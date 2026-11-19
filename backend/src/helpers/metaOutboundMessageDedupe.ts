import { Op } from "sequelize";
import Message from "../models/Message";

/** Normaliza texto outbound Meta para comparar echo ↔ envio do CRM/agente. */
export function normalizeMetaOutboundBody(text: string): string {
  return String(text || "")
    .replace(/\u200e/g, "")
    .replace(/\u200c/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isSyntheticMetaWid(wid: string): boolean {
  const w = String(wid || "");
  return (
    w.startsWith("meta_agent_") ||
    w.startsWith("meta_flow_") ||
    w.startsWith("meta_out_") ||
    w.startsWith("meta_empty_")
  );
}

/**
 * Eco da Graph (is_echo) chega com mid diferente do wid sintético do CRM
 * e gera bolha verde duplicada da mensagem do agente. Localiza o outbound recente
 * pelo texto para fundir / ignorar o eco.
 */
export async function findRecentMetaOutboundDuplicate(params: {
  ticketId: number;
  companyId: number;
  body: string;
  withinMs?: number;
}): Promise<Message | null> {
  const norm = normalizeMetaOutboundBody(params.body);
  if (!norm) return null;

  const since = new Date(Date.now() - (params.withinMs ?? 10 * 60 * 1000));
  const recent = await Message.findAll({
    where: {
      ticketId: params.ticketId,
      companyId: params.companyId,
      fromMe: true,
      createdAt: { [Op.gte]: since }
    },
    order: [["createdAt", "DESC"]],
    limit: 40
  });

  return (
    recent.find(
      m => normalizeMetaOutboundBody(String(m.body || "")) === norm
    ) || null
  );
}

export function isMetaMessengerChannel(channel: unknown): boolean {
  const ch = String(channel || "").toLowerCase();
  return ch === "facebook" || ch === "instagram";
}
