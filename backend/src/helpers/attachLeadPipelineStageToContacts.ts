import { Op } from "sequelize";
import Ticket from "../models/Ticket";
import Contact from "../models/Contact";
import LeadSale from "../models/LeadSale";
import LeadPipelineStage from "../models/LeadPipelineStage";
import logger from "../utils/logger";

export type ContactPipelineStagePayload = {
  leadSaleId: number;
  status: string;
  pipelineId: number | null;
  key: string;
  label: string;
  color: string;
} | null;

/**
 * Anexa a etapa atual do funil de leads (último LeadSale do contato).
 * Sem JOIN no ListTickets — attach pós-fetch.
 */
export async function attachLeadPipelineStageToContacts(
  contacts: Array<Contact | Record<string, unknown> | null | undefined>,
  companyId: number
): Promise<void> {
  const list = (contacts || []).filter(Boolean) as any[];
  if (!list.length) return;

  const contactIds = Array.from(
    new Set(
      list
        .map((c) => Number(c.id || 0))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );
  if (!contactIds.length) return;

  const assignField = (target: any, key: string, value: unknown) => {
    if (!target || typeof target !== "object") return;
    if (typeof target.setDataValue === "function") {
      try {
        target.setDataValue(key, value);
      } catch {
        /* ignore */
      }
    }
    target[key] = value;
  };

  try {
    const leads = await LeadSale.findAll({
      where: {
        companyId,
        contactId: { [Op.in]: contactIds }
      },
      attributes: [
        "id",
        "contactId",
        "status",
        "pipelineId",
        "updatedAt",
        "name"
      ],
      order: [["updatedAt", "DESC"]]
    });

    const latestByContact = new Map<number, LeadSale>();
    for (const lead of leads) {
      const cid = Number(lead.contactId);
      if (!latestByContact.has(cid)) {
        latestByContact.set(cid, lead);
      }
    }

    const statusKeys = Array.from(
      new Set(
        Array.from(latestByContact.values())
          .map((l) => String(l.status || "").trim().toLowerCase())
          .filter(Boolean)
      )
    );

    let stages: LeadPipelineStage[] = [];
    if (statusKeys.length) {
      stages = await LeadPipelineStage.findAll({
        where: {
          companyId,
          key: { [Op.in]: statusKeys }
        },
        attributes: ["id", "key", "label", "color", "pipelineId", "order"]
      });
    }

    const stageByKeyPipeline = new Map<string, LeadPipelineStage>();
    const stageByKey = new Map<string, LeadPipelineStage>();
    for (const s of stages) {
      const k = String(s.key || "").toLowerCase();
      if (!k) continue;
      if (!stageByKey.has(k)) stageByKey.set(k, s);
      const pid = Number(s.pipelineId || 0);
      if (pid > 0) stageByKeyPipeline.set(`${pid}:${k}`, s);
    }

    for (const contact of list) {
      const cid = Number(contact.id);
      const lead = latestByContact.get(cid);
      let payload: ContactPipelineStagePayload = null;
      if (lead) {
        const statusKey = String(lead.status || "").trim().toLowerCase();
        const pid = Number(lead.pipelineId || 0);
        const stage =
          (pid > 0 ? stageByKeyPipeline.get(`${pid}:${statusKey}`) : null) ||
          stageByKey.get(statusKey) ||
          null;
        payload = {
          leadSaleId: Number(lead.id),
          status: statusKey,
          pipelineId: pid > 0 ? pid : null,
          key: stage?.key || statusKey,
          label: stage?.label || (statusKey ? statusKey.toUpperCase() : "Lead"),
          color: stage?.color || "#64748b"
        };
      }
      assignField(contact, "pipelineStage", payload);
    }
  } catch (err) {
    logger.warn(
      `[LeadPipeline] attachLeadPipelineStageToContacts ignorado: ${
        (err as Error)?.message || err
      }`
    );
  }
}

export async function attachLeadPipelineStageToTickets(
  tickets: Ticket[],
  companyId: number
): Promise<void> {
  if (!Array.isArray(tickets) || !tickets.length) return;
  const contacts = tickets
    .map((t) => t.contact as Contact | undefined)
    .filter(Boolean) as Contact[];
  await attachLeadPipelineStageToContacts(contacts, companyId);
}
