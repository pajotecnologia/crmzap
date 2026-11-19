import { google } from "googleapis";
import { Op } from "sequelize";
import AppError from "../../errors/AppError";
import GoogleWorkspaceConnection from "../../models/GoogleWorkspaceConnection";
import { getAuthorizedGoogleClient } from "./googleOAuthService";
import Activity from "../../models/Activity";

export type GoogleCalendarEventDto = {
  id: string;
  summary: string;
  description: string;
  location: string;
  htmlLink: string;
  start: string;
  end: string;
  status?: string;
  allDay: boolean;
};

function parseEventTimes(ev: {
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}): { start: string; end: string; allDay: boolean } {
  const startRaw = ev.start?.dateTime || ev.start?.date;
  const endRaw = ev.end?.dateTime || ev.end?.date;
  const allDay = Boolean(ev.start?.date && !ev.start?.dateTime);
  const start = startRaw ? new Date(startRaw).toISOString() : new Date().toISOString();
  let end = endRaw ? new Date(endRaw).toISOString() : start;
  if (allDay && startRaw && !endRaw) {
    const d = new Date(startRaw);
    d.setHours(23, 59, 59, 999);
    end = d.toISOString();
  }
  return { start, end, allDay };
}

export async function resolveGoogleCalendarConnection(
  companyId: number,
  connectionId?: number
): Promise<GoogleWorkspaceConnection | null> {
  if (connectionId) {
    return GoogleWorkspaceConnection.findOne({
      where: {
        id: connectionId,
        companyId,
        service: "google_calendar",
        isActive: true
      }
    });
  }
  return GoogleWorkspaceConnection.findOne({
    where: { companyId, service: "google_calendar", isActive: true },
    order: [["createdAt", "DESC"]]
  });
}

export async function listGoogleCalendarEvents(params: {
  connectionId: number;
  companyId: number;
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
}) {
  const connection = await GoogleWorkspaceConnection.findOne({
    where: {
      id: params.connectionId,
      companyId: params.companyId,
      service: "google_calendar",
      isActive: true
    }
  });
  if (!connection) {
    throw new AppError("Conexão Google Calendar não encontrada.", 404);
  }

  return listEventsForConnection(connection, params);
}

export async function listGoogleCalendarEventsForCompany(params: {
  companyId: number;
  connectionId?: number;
  timeMin: string;
  timeMax: string;
  maxResults?: number;
}): Promise<{
  connected: boolean;
  connectionId?: number;
  accountEmail?: string;
  accountName?: string;
  events: GoogleCalendarEventDto[];
}> {
  const connection = await resolveGoogleCalendarConnection(
    params.companyId,
    params.connectionId
  );

  if (!connection) {
    return { connected: false, events: [] };
  }

  const result = await listEventsForConnection(connection, {
    companyId: params.companyId,
    connectionId: connection.id,
    timeMin: params.timeMin,
    timeMax: params.timeMax,
    maxResults: params.maxResults || 250
  });

  return {
    connected: true,
    connectionId: connection.id,
    accountEmail: connection.accountEmail,
    accountName: connection.accountName,
    events: result.events
  };
}

async function listEventsForConnection(
  connection: GoogleWorkspaceConnection,
  params: {
    companyId: number;
    connectionId: number;
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
  }
) {
  const auth = await getAuthorizedGoogleClient(connection);
  const calendar = google.calendar({ version: "v3", auth });

  const { data } = await calendar.events.list({
    calendarId: "primary",
    timeMin: params.timeMin,
    timeMax: params.timeMax,
    maxResults: params.maxResults || 250,
    singleEvents: true,
    orderBy: "startTime"
  });

  const events: GoogleCalendarEventDto[] = (data.items || [])
    .filter(ev => ev.status !== "cancelled")
    .map(ev => {
      const { start, end, allDay } = parseEventTimes(ev);
      return {
        id: String(ev.id || ""),
        summary: ev.summary || "(Sem título)",
        description: ev.description || "",
        location: ev.location || "",
        htmlLink: ev.htmlLink || "",
        start,
        end,
        status: ev.status,
        allDay
      };
    });

  return {
    accountEmail: connection.accountEmail,
    events
  };
}

const GOOGLE_MARKER = "[google-calendar:";

export function googleCalendarMarker(eventId: string): string {
  return `${GOOGLE_MARKER}${eventId}]`;
}

export async function importGoogleCalendarEventAsActivity(params: {
  companyId: number;
  userId: number;
  connectionId?: number;
  googleEventId: string;
}): Promise<Activity> {
  const connection = await resolveGoogleCalendarConnection(
    params.companyId,
    params.connectionId
  );
  if (!connection) {
    throw new AppError(
      "Conecte o Google Calendário em Integrações antes de importar.",
      400
    );
  }

  const marker = googleCalendarMarker(params.googleEventId);
  const existing = await Activity.findOne({
    where: {
      companyId: params.companyId,
      description: { [Op.like]: `%${marker}%` }
    }
  });
  if (existing) {
    return existing;
  }

  const { events } = await listEventsForConnection(connection, {
    companyId: params.companyId,
    connectionId: connection.id,
    timeMin: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
    timeMax: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    maxResults: 500
  });

  const ev = events.find(e => e.id === params.googleEventId);
  if (!ev) {
    throw new AppError("Evento não encontrado no Google Calendar.", 404);
  }

  const description = [ev.description, marker].filter(Boolean).join("\n\n");

  const activity = await Activity.create({
    title: ev.summary,
    description,
    type: "event",
    status: "pending",
    date: new Date(ev.start),
    location: ev.location || "",
    link: ev.htmlLink || "",
    eventColor: "#4285F4",
    companyId: params.companyId,
    userId: params.userId,
    owner: connection.accountEmail
  } as any);

  return activity;
}

const DEFAULT_TZ = "America/Sao_Paulo";

function scopeReconnectHint(service: string): string {
  return ` Reconecte em Integrações → ${service} para autorizar permissões de escrita (OAuth atualizado).`;
}

export async function createGoogleCalendarEventForCompany(params: {
  companyId: number;
  userId: number;
  connectionId?: number;
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end?: string;
  timeZone?: string;
}): Promise<{
  googleEventId: string;
  htmlLink: string;
  activityId: number;
  accountEmail: string;
  start: string;
  end: string;
}> {
  const connection = await resolveGoogleCalendarConnection(
    params.companyId,
    params.connectionId
  );
  if (!connection) {
    throw new AppError(
      "Google Calendário não conectado. Conecte em Integrações → Google Calendário.",
      400
    );
  }

  const summary = String(params.summary || "").trim();
  if (!summary) {
    throw new AppError("Informe o título do evento.", 400);
  }

  const startDate = new Date(params.start);
  if (Number.isNaN(startDate.getTime())) {
    throw new AppError("Data/hora de início inválida (use ISO 8601).", 400);
  }

  let endDate: Date;
  if (params.end) {
    endDate = new Date(params.end);
    if (Number.isNaN(endDate.getTime())) {
      throw new AppError("Data/hora de fim inválida (use ISO 8601).", 400);
    }
  } else {
    endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
  }

  const timeZone = params.timeZone || DEFAULT_TZ;
  const auth = await getAuthorizedGoogleClient(connection);
  const calendar = google.calendar({ version: "v3", auth });

  let inserted: { data: { id?: string | null; htmlLink?: string | null } };
  try {
    inserted = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary,
        description: params.description || "",
        location: params.location || "",
        start: { dateTime: startDate.toISOString(), timeZone },
        end: { dateTime: endDate.toISOString(), timeZone }
      }
    });
  } catch (err: any) {
    const msg = String(err?.message || err || "");
    if (/insufficient|scope|403|permission/i.test(msg)) {
      throw new AppError(
        `Sem permissão para criar eventos no Google Calendar.${scopeReconnectHint("Google Calendário")}`,
        403
      );
    }
    throw err;
  }

  const googleEventId = String(inserted.data.id || "");
  if (!googleEventId) {
    throw new AppError("Google não retornou ID do evento criado.", 502);
  }

  const htmlLink = String(inserted.data.htmlLink || "");
  const marker = googleCalendarMarker(googleEventId);
  const description = [params.description, marker].filter(Boolean).join("\n\n");

  const activity = await Activity.create({
    title: summary,
    description,
    type: "event",
    status: "pending",
    date: startDate,
    dateEnd: endDate,
    location: params.location || "",
    link: htmlLink,
    eventColor: "#4285F4",
    companyId: params.companyId,
    userId: params.userId,
    owner: connection.accountEmail
  } as any);

  return {
    googleEventId,
    htmlLink,
    activityId: activity.id,
    accountEmail: connection.accountEmail,
    start: startDate.toISOString(),
    end: endDate.toISOString()
  };
}
