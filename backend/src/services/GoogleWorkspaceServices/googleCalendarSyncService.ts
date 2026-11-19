import { google } from "googleapis";
import { Op } from "sequelize";
import logger from "../../utils/logger";
import Activity from "../../models/Activity";
import Schedule from "../../models/Schedule";
import Contact from "../../models/Contact";
import Project from "../../models/Project";
import {
  googleCalendarMarker,
  resolveGoogleCalendarConnection
} from "./googleCalendarEventsService";
import {
  DEFAULT_MEETING_SLOT_MINUTES,
  extractScheduleSlotMinutesFromBody,
  stripScheduleSlotMinutesMarker
} from "../../helpers/meetingSlotDuration";
import { getAuthorizedGoogleClient } from "./googleOAuthService";

const DEFAULT_TZ = "America/Sao_Paulo";
const CRM_ENTITY_MARKER = /\[google-calendar-sync:(\w+):(\d+)\]/;
const GOOGLE_EVENT_MARKER = /\[google-calendar:([^\]]+)\]/;

export function extractGoogleEventIdFromText(text?: string | null): string | null {
  if (!text) return null;
  const m = String(text).match(GOOGLE_EVENT_MARKER);
  return m ? m[1] : null;
}

function stripSyncMarkers(text?: string | null): string {
  if (!text) return "";
  return String(text)
    .replace(GOOGLE_EVENT_MARKER, "")
    .replace(CRM_ENTITY_MARKER, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildCalendarTypeLabel(params: {
  entity: "activity" | "schedule" | "project";
  activityType?: string;
  projectName?: string;
}): string {
  if (params.entity === "schedule") return "Agendamento WhatsApp";
  if (params.entity === "project") return "Projeto";
  if (params.projectName) return "Projeto";
  const t = String(params.activityType || "task").toLowerCase();
  if (t === "event" || t === "meeting" || t === "reuniao") return "Reunião";
  if (t === "task" || t === "atividade") return "Atividade";
  return "Atividade";
}

function buildGoogleEventDescription(params: {
  typeLabel: string;
  body?: string;
  entity: string;
  entityId: number;
  extras?: string[];
}): string {
  const parts = [
    `Tipo: ${params.typeLabel}`,
    `Origem: VB Solution CRM`,
    `[google-calendar-sync:${params.entity}:${params.entityId}]`
  ];
  const clean = stripSyncMarkers(params.body);
  if (clean) parts.push("", clean);
  if (params.extras?.length) {
    parts.push("", ...params.extras.filter(Boolean));
  }
  return parts.join("\n");
}

async function upsertGoogleEvent(params: {
  companyId: number;
  existingEventId?: string | null;
  summary: string;
  description: string;
  location?: string;
  start: Date;
  end?: Date;
}): Promise<{ eventId: string; htmlLink: string }> {
  const connection = await resolveGoogleCalendarConnection(params.companyId);
  if (!connection) {
    throw new Error("Google Calendário não conectado.");
  }

  const auth = await getAuthorizedGoogleClient(connection);
  const calendar = google.calendar({ version: "v3", auth });
  const start = params.start;
  const end =
    params.end ||
    new Date(start.getTime() + DEFAULT_MEETING_SLOT_MINUTES * 60 * 1000);

  const requestBody = {
    summary: params.summary,
    description: params.description,
    location: params.location || "",
    start: { dateTime: start.toISOString(), timeZone: DEFAULT_TZ },
    end: { dateTime: end.toISOString(), timeZone: DEFAULT_TZ }
  };

  if (params.existingEventId) {
    try {
      const updated = await calendar.events.update({
        calendarId: "primary",
        eventId: params.existingEventId,
        requestBody
      });
      return {
        eventId: String(updated.data.id || params.existingEventId),
        htmlLink: String(updated.data.htmlLink || "")
      };
    } catch (err: any) {
      logger.warn(
        `[GOOGLE-CAL-SYNC] update failed ${params.existingEventId}, creating new: ${err?.message}`
      );
    }
  }

  const inserted = await calendar.events.insert({
    calendarId: "primary",
    requestBody
  });

  return {
    eventId: String(inserted.data.id || ""),
    htmlLink: String(inserted.data.htmlLink || "")
  };
}

function appendGoogleMarkers(
  description: string | null | undefined,
  entity: string,
  entityId: number,
  googleEventId: string
): string {
  const base = stripSyncMarkers(description);
  const marker = googleCalendarMarker(googleEventId);
  const entityTag = `[google-calendar-sync:${entity}:${entityId}]`;
  return [base, entityTag, marker].filter(Boolean).join("\n\n");
}

export async function syncActivityToGoogleCalendar(
  activity: Activity
): Promise<{ synced: boolean; htmlLink?: string; eventId?: string }> {
  try {
    if (!activity?.companyId || !activity?.date) {
      return { synced: false };
    }

    const connection = await resolveGoogleCalendarConnection(activity.companyId);
    if (!connection) return { synced: false };

    let projectName = "";
    if (activity.projectId) {
      const project = await Project.findByPk(activity.projectId, {
        attributes: ["id", "name"]
      });
      projectName = project?.name || "";
    }

    const typeLabel = buildCalendarTypeLabel({
      entity: activity.projectId ? "project" : "activity",
      activityType: activity.type,
      projectName
    });

    const titlePrefix = typeLabel === "Atividade" ? "Atividade:" : `${typeLabel}:`;
    const summary = `${titlePrefix} ${activity.title}`.trim();

    const extras: string[] = [];
    if (projectName) extras.push(`Projeto: ${projectName}`);
    if (activity.owner) extras.push(`Responsável: ${activity.owner}`);
    if (activity.location) extras.push(`Local: ${activity.location}`);
    if (activity.phone) extras.push(`Telefone: ${activity.phone}`);

    const existingId = extractGoogleEventIdFromText(activity.description);
    const start = new Date(activity.date);
    const end = activity.dateEnd ? new Date(activity.dateEnd) : undefined;

    const { eventId, htmlLink } = await upsertGoogleEvent({
      companyId: activity.companyId,
      existingEventId: existingId,
      summary,
      description: buildGoogleEventDescription({
        typeLabel,
        body: activity.description,
        entity: "activity",
        entityId: activity.id,
        extras
      }),
      location: activity.location || activity.address || "",
      start,
      end
    });

    await activity.update({
      description: appendGoogleMarkers(
        activity.description,
        "activity",
        activity.id,
        eventId
      ),
      link: htmlLink || activity.link
    });

    return { synced: true, htmlLink, eventId };
  } catch (err: any) {
    logger.warn(`[GOOGLE-CAL-SYNC] activity ${activity?.id}: ${err?.message}`);
    return { synced: false };
  }
}

export async function syncScheduleToGoogleCalendar(
  schedule: Schedule
): Promise<{ synced: boolean; htmlLink?: string }> {
  try {
    if (!schedule?.companyId || !schedule?.sendAt) {
      return { synced: false };
    }

    const connection = await resolveGoogleCalendarConnection(Number(schedule.companyId));
    if (!connection) return { synced: false };

    let contactName = "";
    if (schedule.contactId) {
      const contact = await Contact.findByPk(schedule.contactId, {
        attributes: ["id", "name", "number"]
      });
      contactName = contact?.name || "";
    }

    const typeLabel = "Agendamento WhatsApp";
    const summary = contactName
      ? `${typeLabel}: ${contactName}`
      : `${typeLabel}: Mensagem programada`;

    const extras: string[] = [];
    if (contactName) extras.push(`Contato: ${contactName}`);

    const existingId = extractGoogleEventIdFromText(schedule.body);
    const start = new Date(schedule.sendAt);
    const slotMinutes =
      extractScheduleSlotMinutesFromBody(schedule.body) ||
      DEFAULT_MEETING_SLOT_MINUTES;
    const end = new Date(start.getTime() + slotMinutes * 60 * 1000);

    const { eventId, htmlLink } = await upsertGoogleEvent({
      companyId: Number(schedule.companyId),
      existingEventId: existingId,
      summary,
      description: buildGoogleEventDescription({
        typeLabel,
        body: stripScheduleSlotMinutesMarker(schedule.body),
        entity: "schedule",
        entityId: schedule.id,
        extras
      }),
      start,
      end
    });

    await schedule.update({
      body: appendGoogleMarkers(schedule.body, "schedule", schedule.id, eventId)
    });

    return { synced: true, htmlLink };
  } catch (err: any) {
    logger.warn(`[GOOGLE-CAL-SYNC] schedule ${schedule?.id}: ${err?.message}`);
    return { synced: false };
  }
}

/** Evita loop quando o Brain já criou o evento no Google. */
export async function activityAlreadySyncedFromGoogle(
  companyId: number,
  activityId: number
): Promise<boolean> {
  const row = await Activity.findOne({
    where: { id: activityId, companyId },
    attributes: ["description"]
  });
  return Boolean(extractGoogleEventIdFromText(row?.description));
}

export async function findActivityByGoogleEventId(
  companyId: number,
  googleEventId: string
): Promise<Activity | null> {
  return Activity.findOne({
    where: {
      companyId,
      description: { [Op.like]: `%${googleCalendarMarker(googleEventId)}%` }
    }
  });
}
