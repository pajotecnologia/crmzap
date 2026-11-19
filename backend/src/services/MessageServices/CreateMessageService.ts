import { QueryTypes } from "sequelize";
import { getIO } from "../../libs/socket";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Queue from "../../models/Queue";
import Tag from "../../models/Tag";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";
import logger from "../../utils/logger";
import ShowTicketService from "../TicketServices/ShowTicketService";
import { markTicketUnderAgentAttendance } from "../TicketServices/markTicketUnderAgentAttendance";
import {
  findRecentMetaOutboundDuplicate,
  isMetaMessengerChannel,
  isSyntheticMetaWid
} from "../../helpers/metaOutboundMessageDedupe";

export interface MessageData {
  wid: string;
  ticketId: number;
  body: string;
  contactId?: number;
  fromMe?: boolean;
  read?: boolean;
  mediaType?: string;
  mediaUrl?: string;
  ack?: number;
  queueId?: number;
  channel?: string;
  ticketTrakingId?: number;
  isPrivate?: boolean;
  ticketImported?: any;
  isForwarded?: boolean;
  fromAgent?: boolean;
  remoteJid?: string;
  participant?: string;
  dataJson?: string;
  quotedMsgId?: string | number;
  createdAt?: string | Date;
}

interface Request {
  messageData: MessageData;
  companyId: number;
}

const messageInclude = [
  "contact",
  {
    model: Ticket,
    as: "ticket",
    include: [
      {
        model: Contact,
        attributes: [
          "id",
          "name",
          "number",
          "email",
          "profilePicUrl",
          "acceptAudioMessage",
          "active",
          "urlPicture",
          "companyId"
        ],
        include: ["extraInfo", "tags"]
      },
      { model: Queue, attributes: ["id", "name", "color"] },
      { model: Whatsapp, attributes: ["id", "name", "groupAsTicket", "color"] },
      { model: User, attributes: ["id", "name"] },
      { model: Tag, as: "tags", attributes: ["id", "name", "color"] }
    ]
  },
  {
    model: Message,
    as: "quotedMsg",
    include: ["contact"]
  }
];

function sanitizeWid(raw: unknown, ticketId: number): string {
  const base =
    raw != null && String(raw).trim() !== ""
      ? String(raw).trim()
      : `gen-${ticketId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return base.slice(0, 255);
}

function sanitizeQuotedMsgId(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return null;
  return n;
}

function sanitizeDataJson(raw: unknown): string | null {
  if (raw == null) return null;
  let s = typeof raw === "string" ? raw : JSON.stringify(raw);
  // PostgreSQL TEXT rejeita \u0000
  s = s.replace(/\u0000/g, "");
  if (s.length > 500_000) {
    s = s.slice(0, 500_000);
  }
  return s || null;
}

function sanitizeCreatedAt(raw: unknown): Date | null {
  if (raw == null || raw === "") return null;
  try {
    const d = raw instanceof Date ? raw : new Date(raw as string);
    if (Number.isNaN(d.getTime())) return null;
    const year = d.getUTCFullYear();
    if (year < 2000 || year > 2100) return null;
    return d;
  } catch {
    return null;
  }
}

function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

async function rawInsertMessage(params: {
  wid: string;
  ticketId: number;
  body: string;
  fromMe: boolean;
  read: boolean;
  mediaType: string;
  companyId: number;
  fromAgent: boolean;
  isPrivate: boolean;
  ack: number;
  contactId?: number | null;
  remoteJid?: string | null;
  dataJson?: string | null;
  mediaUrl?: string | null;
}): Promise<number> {
  const sequelize = Message.sequelize!;
  const rows = (await sequelize.query(
    `INSERT INTO "Messages"
      (wid, "ticketId", body, "fromMe", read, "mediaType", ack, "isPrivate", "isForwarded",
       "fromAgent", "companyId", "contactId", "remoteJid", "dataJson", "mediaUrl", "createdAt", "updatedAt")
     VALUES
      (:wid, :ticketId, :body, :fromMe, :read, :mediaType, :ack, :isPrivate, false,
       :fromAgent, :companyId, :contactId, :remoteJid, :dataJson, :mediaUrl, NOW(), NOW())
     RETURNING id`,
    {
      replacements: {
        wid: params.wid.slice(0, 255),
        ticketId: params.ticketId,
        body: params.body ?? "",
        fromMe: params.fromMe,
        read: params.read,
        mediaType: params.mediaType || "conversation",
        ack: params.ack ?? 2,
        isPrivate: params.isPrivate,
        fromAgent: params.fromAgent,
        companyId: params.companyId,
        contactId: params.contactId ?? null,
        remoteJid: params.remoteJid ?? null,
        dataJson: params.dataJson ?? null,
        mediaUrl: params.mediaUrl ?? null
      },
      type: QueryTypes.SELECT
    }
  )) as Array<{ id: number }>;

  const id = rows?.[0]?.id;
  if (!id) {
    throw new Error("ERR_RAW_INSERT_MESSAGE");
  }
  return Number(id);
}

const CreateMessageService = async ({
  messageData,
  companyId
}: Request): Promise<Message> => {
  const ticketId = Number(messageData.ticketId);
  if (!Number.isFinite(ticketId) || ticketId <= 0) {
    throw new Error("ERR_INVALID_TICKET_ID");
  }

  const wid = sanitizeWid(messageData.wid, ticketId);
  const quotedMsgId = sanitizeQuotedMsgId(messageData.quotedMsgId);
  const dataJson = sanitizeDataJson(messageData.dataJson);
  const createdAt = sanitizeCreatedAt(messageData.createdAt);
  const ticketTrakingId = sanitizeQuotedMsgId(messageData.ticketTrakingId);
  const contactId = sanitizeQuotedMsgId(messageData.contactId);

  let mediaType = String(messageData.mediaType || "conversation").slice(0, 255);
  const mediaUrlStr = String(messageData.mediaUrl || "").toLowerCase();
  const bodyStr = String(messageData.body || "").toLowerCase();
  if (
    mediaType !== "audio" &&
    ([".mp3", ".wav", ".ogg", ".webm", ".m4a", ".aac"].some(ext =>
      mediaUrlStr.includes(ext)
    ) ||
      mediaUrlStr.includes("audio_") ||
      bodyStr.includes("áudio gravado") ||
      bodyStr.includes("🎵 arquivo de áudio"))
  ) {
    mediaType = "audio";
  }

  const payload = omitUndefined({
    wid,
    ticketId,
    body: messageData.body ?? "",
    contactId: contactId ?? undefined,
    fromMe: Boolean(messageData.fromMe),
    read: Boolean(messageData.read),
    mediaType,
    ack: Number(messageData.ack) || 2,
    queueId: sanitizeQuotedMsgId(messageData.queueId) ?? undefined,
    ticketTrakingId: ticketTrakingId ?? undefined,
    isPrivate: Boolean(messageData.isPrivate),
    isForwarded: Boolean(messageData.isForwarded),
    fromAgent: Boolean(messageData.fromAgent),
    remoteJid:
      messageData.remoteJid != null
        ? String(messageData.remoteJid).slice(0, 255)
        : undefined,
    participant:
      messageData.participant != null
        ? String(messageData.participant).slice(0, 255)
        : undefined,
    dataJson: dataJson ?? undefined,
    quotedMsgId: quotedMsgId ?? undefined,
    companyId,
    mediaUrl: messageData.mediaUrl
      ? String(messageData.mediaUrl).slice(0, 500)
      : undefined,
    createdAt: createdAt ?? undefined
  });

  let existing: Message | null = null;
  try {
    existing = await Message.findOne({ where: { wid, companyId } });
  } catch (err) {
    logger.warn(`[CreateMessage] findOne wid falhou: ${err}`);
  }

  /**
   * Facebook/Instagram: eco da Graph (mid diferente) duplicava a bolha do agente
   * como "humano" (verde). Reusa a mensagem recente com o mesmo texto.
   */
  if (!existing && Boolean(messageData.fromMe) && !Boolean(messageData.isPrivate)) {
    try {
      const ticketRow = await Ticket.findByPk(ticketId, {
        attributes: ["id", "channel", "companyId"]
      });
      if (ticketRow && isMetaMessengerChannel(ticketRow.channel)) {
        const dup = await findRecentMetaOutboundDuplicate({
          ticketId,
          companyId,
          body: String(messageData.body ?? "")
        });
        if (dup) {
          existing = dup;
          const patch: Record<string, unknown> = {};
          if (messageData.fromAgent === true && !dup.fromAgent) {
            patch.fromAgent = true;
          }
          const dupWid = String(dup.wid || "");
          if (wid && wid !== dupWid && isSyntheticMetaWid(dupWid)) {
            patch.wid = wid;
          }
          if (Object.keys(patch).length) {
            await dup.update(patch as any);
          }
        }
      }
    } catch (dedupeErr) {
      logger.warn(`[CreateMessage] meta outbound dedupe: ${dedupeErr}`);
    }
  }

  const isUpdate = !!existing;
  let rowId: number | null = existing?.id ?? null;

  try {
    if (existing) {
      await existing.update({
        ...payload,
        fromAgent:
          payload.fromAgent === true ? true : existing.fromAgent
      } as any);
      rowId = existing.id;
    } else {
      const created = await Message.create(payload as any);
      rowId = created?.id != null ? Number(created.id) : null;
      if (rowId == null) {
        const again = await Message.findOne({ where: { wid, companyId } });
        rowId = again?.id ?? null;
      }
    }
  } catch (err) {
    logger.error(
      `[CreateMessage] persist falhou wid=${wid} ticket=${ticketId}: ${err}`
    );
    try {
      const retryWid = `${wid.slice(0, 200)}-r${Date.now()}`.slice(0, 255);
      const created = await Message.create({
        wid: retryWid,
        ticketId,
        body: messageData.body ?? "",
        fromMe: Boolean(messageData.fromMe),
        mediaType,
        companyId,
        fromAgent: Boolean(messageData.fromAgent),
        isPrivate: Boolean(messageData.isPrivate),
        ack: 2,
        read: Boolean(messageData.read),
        contactId: contactId ?? undefined,
        remoteJid: payload.remoteJid,
        mediaUrl: payload.mediaUrl
      } as any);
      rowId = created?.id != null ? Number(created.id) : null;
      if (rowId == null) {
        const again = await Message.findOne({
          where: { wid: retryWid, companyId }
        });
        rowId = again?.id ?? null;
      }
    } catch (err2) {
      logger.error(`[CreateMessage] retry Sequelize falhou: ${err2}`);
      try {
        rowId = await rawInsertMessage({
          wid: `${wid.slice(0, 200)}-raw${Date.now()}`.slice(0, 255),
          ticketId,
          body: String(messageData.body ?? ""),
          fromMe: Boolean(messageData.fromMe),
          read: Boolean(messageData.read),
          mediaType,
          companyId,
          fromAgent: Boolean(messageData.fromAgent),
          isPrivate: Boolean(messageData.isPrivate),
          ack: 2,
          contactId,
          remoteJid: payload.remoteJid as string | undefined,
          dataJson: null,
          mediaUrl: payload.mediaUrl as string | undefined
        });
        logger.info(
          `[CreateMessage] raw SQL insert ok id=${rowId} ticket=${ticketId}`
        );
      } catch (err3) {
        logger.error(`[CreateMessage] raw SQL falhou: ${err3}`);
        throw err3;
      }
    }
  }

  if (rowId == null) {
    try {
      rowId = await rawInsertMessage({
        wid: `${wid.slice(0, 200)}-fb${Date.now()}`.slice(0, 255),
        ticketId,
        body: String(messageData.body ?? ""),
        fromMe: Boolean(messageData.fromMe),
        read: Boolean(messageData.read),
        mediaType,
        companyId,
        fromAgent: Boolean(messageData.fromAgent),
        isPrivate: Boolean(messageData.isPrivate),
        ack: 2,
        contactId,
        remoteJid: payload.remoteJid as string | undefined,
        dataJson: null,
        mediaUrl: payload.mediaUrl as string | undefined
      });
    } catch (err) {
      logger.error(`[CreateMessage] fallback final falhou: ${err}`);
      throw err;
    }
  }

  if (payload.fromAgent === true && rowId) {
    try {
      await Message.update({ fromAgent: true }, { where: { id: rowId } });
    } catch {
      /* ignore */
    }
  }

  let message =
    rowId != null
      ? await Message.findByPk(rowId, { include: messageInclude as any })
      : null;

  if (!message && rowId != null) {
    message = await Message.findByPk(rowId);
  }

  if (!message) {
    throw new Error("ERR_CREATING_MESSAGE");
  }

  if (!messageData?.ticketImported) {
    try {
      const io = getIO();
      const messagePlain = message.get({ plain: true }) as any;
      const ticketPlain = messagePlain?.ticket || null;
      const contactPlain =
        ticketPlain?.contact || messagePlain?.contact || null;
      io.of("/" + String(companyId)).emit(`company-${companyId}-appMessage`, {
        action: isUpdate ? "update" : "create",
        message: messagePlain,
        ticket: ticketPlain,
        contact: contactPlain
      });
    } catch (err) {
      logger.warn(`[CreateMessage] emit socket falhou: ${err}`);
    }
  }

  try {
    if (message.ticket?.queueId != null && message.queueId == null) {
      await message.update({ queueId: message.ticket.queueId });
    }
  } catch {
    /* ignore */
  }

  // Nota interna / agente: wid estável PVT{id}; status Atendendo só para agente.
  if (message.isPrivate) {
    try {
      await message.update({ wid: `PVT${message.id}` });
    } catch {
      /* ignore */
    }
  }

  if (message.fromAgent) {
    try {
      const ticket = await Ticket.findByPk(message.ticketId);
      if (ticket) {
        await markTicketUnderAgentAttendance(ticket);
      }
    } catch (err) {
      logger.warn(`[CreateMessage] markTicketUnderAgentAttendance: ${err}`);
    }
  } else if (message.isPrivate) {
    // Nota humana: só notifica UI; NÃO força isBot/open (Aceitar continua obrigatório).
    try {
      const io = getIO();
      const full = await ShowTicketService(message.ticketId, companyId);
      io.of("/" + String(companyId)).emit(`company-${companyId}-ticket`, {
        action: "update",
        ticket: full,
        ticketId: message.ticketId
      });
    } catch {
      /* ignore */
    }
  }

  return message;
};

export default CreateMessageService;
