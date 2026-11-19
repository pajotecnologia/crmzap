import fs from "fs";
import path from "path";
import mime from "mime-types";
import axios from "axios";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";
import SendWhatsAppOficialMessage from "./SendWhatsAppOficialMessage";
import { processScriptMessage } from "../../helpers/processScriptMessage";
import { resolveWhatsAppMediaKindFromMime } from "../../helpers/whatsAppMediaKind";
import { sendMetaCloudTypingIndicator } from "./sendMetaCloudTypingIndicator";
import { computeTypingDurationMs } from "../../helpers/agentOutboundHumanDelay";
import delay from "../../utils/delay";
import logger from "../../utils/logger";

function buildScriptCtx(ticket: Ticket, contact: Contact) {
  return {
    contact: {
      name: contact?.name,
      number: contact?.number,
      email: contact?.email,
      extraInfo:
        (contact as any)?.extraInfo ||
        (ticket as any)?.__scriptContactExtraInfo ||
        null
    },
    ticket: {
      id: ticket?.id,
      user: (ticket as any)?.user || null,
      queue: (ticket as any)?.queue || null,
      whatsapp: (ticket as any)?.whatsapp || null,
      company: (ticket as any)?.company || null
    },
    agentName:
      (ticket as any)?.__agentOutboundPrompt?.name ||
      (ticket as any)?.user?.name ||
      "",
    companyName:
      (ticket as any)?.__scriptCompanyName ||
      (ticket as any)?.company?.name ||
      "",
    now: new Date()
  };
}

function expandOutboundText(
  raw: string,
  ticket: Ticket,
  contact: Contact
): string {
  return processScriptMessage(
    String(raw || ""),
    buildScriptCtx(ticket, contact)
  ).trim();
}

function asMulterFile(
  fullPath: string,
  fileName: string,
  mimetype: string
): Express.Multer.File {
  const size = fs.existsSync(fullPath) ? fs.statSync(fullPath).size : 0;
  return {
    fieldname: "file",
    originalname: fileName,
    encoding: "7bit",
    mimetype,
    size,
    destination: path.dirname(fullPath),
    filename: path.basename(fullPath),
    path: fullPath,
    buffer: undefined as any,
    stream: undefined as any
  };
}

type ResolvedBaileysMedia = {
  kind: "document" | "image" | "video" | "audio";
  buffer: Buffer;
  fileName: string;
  mimetype: string;
  caption: string;
};

async function bufferFromMediaSource(
  raw: any,
  defaultName: string
): Promise<{ buffer: Buffer; fileName: string; mimetypeHint?: string } | null> {
  if (!raw) return null;
  if (Buffer.isBuffer(raw)) {
    return { buffer: raw, fileName: defaultName };
  }
  if (typeof raw === "string") {
    if (/^https?:\/\//i.test(raw)) {
      const res = await axios.get(raw, {
        responseType: "arraybuffer",
        timeout: 45000
      });
      const urlName = path.basename(String(raw).split("?")[0] || defaultName);
      return {
        buffer: Buffer.from(res.data),
        fileName: urlName || defaultName,
        mimetypeHint: String(res.headers?.["content-type"] || "")
      };
    }
    if (fs.existsSync(raw)) {
      return {
        buffer: fs.readFileSync(raw),
        fileName: path.basename(raw) || defaultName
      };
    }
    try {
      return { buffer: Buffer.from(raw), fileName: defaultName };
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") {
    if (Buffer.isBuffer(raw.url) || typeof raw.url === "string") {
      return bufferFromMediaSource(raw.url, defaultName);
    }
    if (Buffer.isBuffer(raw.data)) {
      return { buffer: raw.data, fileName: defaultName };
    }
  }
  return null;
}

/** Aceita Buffer, path local, { url } HTTP e data — igual Baileys / inventário. */
async function resolveBaileysMedia(
  content: any
): Promise<ResolvedBaileysMedia | null> {
  if (!content || typeof content !== "object") return null;

  const pick = async (
    key: "document" | "image" | "video" | "audio",
    defaultName: string,
    defaultMime: string
  ): Promise<ResolvedBaileysMedia | null> => {
    if (!content[key]) return null;
    const resolved = await bufferFromMediaSource(content[key], defaultName);
    if (!resolved?.buffer?.length) return null;
    const fileName = String(
      content.fileName || resolved.fileName || defaultName
    );
    const mimetype = String(
      content.mimetype ||
        resolved.mimetypeHint ||
        mime.lookup(fileName) ||
        defaultMime
    );
    return {
      kind: key,
      buffer: resolved.buffer,
      fileName,
      mimetype,
      caption: String(content.caption || "").trim()
    };
  };

  return (
    (await pick("document", `doc_${Date.now()}.pdf`, "application/pdf")) ||
    (await pick("image", `img_${Date.now()}.jpg`, "image/jpeg")) ||
    (await pick("video", `vid_${Date.now()}.mp4`, "video/mp4")) ||
    (await pick("audio", `aud_${Date.now()}.ogg`, "audio/ogg"))
  );
}

function resolveCloudMediaType(
  kind: string,
  mimetype: string,
  fileName: string
): "document" | "image" | "video" | "audio" {
  const fromMime = resolveWhatsAppMediaKindFromMime(mimetype, fileName);
  if (
    fromMime === "image" ||
    fromMime === "video" ||
    fromMime === "audio" ||
    fromMime === "document"
  ) {
    return fromMime;
  }
  if (
    kind === "image" ||
    kind === "video" ||
    kind === "audio" ||
    kind === "document"
  ) {
    return kind;
  }
  return "document";
}

async function sendOficialMedia(params: {
  ticket: Ticket;
  contact: Contact;
  connection: Whatsapp;
  media: ResolvedBaileysMedia;
}): Promise<any> {
  const { ticket, contact, connection, media } = params;
  const companyId = ticket.companyId;
  const dir = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "public",
    `company${companyId}`,
    "agent-media"
  );
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const safeName = String(media.fileName || `media_${Date.now()}`)
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 180);
  const fullPath = path.join(dir, `${Date.now()}_${safeName}`);
  fs.writeFileSync(fullPath, media.buffer);

  const caption = expandOutboundText(media.caption || "", ticket, contact);
  const type = resolveCloudMediaType(media.kind, media.mimetype, safeName);
  const multerFile = asMulterFile(fullPath, safeName, media.mimetype);

  (ticket as any).whatsapp = connection;
  (ticket as any).contact = contact;

  logger.info(
    `[WA-OFICIAL-AGENT] enviando mídia roteiro type=${type} mime=${media.mimetype} file=${safeName} bytes=${media.buffer.length} ticket=${ticket.id}`
  );

  const sendResult = await SendWhatsAppOficialMessage({
    body: type === "audio" ? "" : caption || "",
    ticket,
    quotedMsg: null,
    type,
    media: multerFile,
    vCard: null,
    fromAgent: true
  });
  return sendResult;
}

/**
 * Stub Baileys-like: texto + mídia Cloud API + typing_indicator Meta.
 */
export function buildOficialAttendanceWbot(params: {
  connection: Whatsapp;
  ticket: Ticket;
  contact: Contact;
  /** wamid da última mensagem do cliente (obrigatório p/ digitando…). */
  inboundMessageId?: string;
}) {
  const inboundWamid = String(
    params.inboundMessageId ||
      (params.ticket as any)?.__lastInboundWamid ||
      ""
  ).trim();

  if (inboundWamid) {
    (params.ticket as any).__lastInboundWamid = inboundWamid;
  }

  return {
    __oficialInboundWamid: inboundWamid,
    __oficialCloudApi: true,
    __oficialConnection: params.connection,
    presenceSubscribe: async () => undefined,
    sendPresenceUpdate: async (presence: string, _jid?: string) => {
      if (presence !== "composing" && presence !== "available") return;
      const wid = String(
        (params.ticket as any)?.__lastInboundWamid ||
          inboundWamid ||
          ""
      ).trim();
      if (!wid) {
        logger.debug?.(
          `[WA-OFICIAL-AGENT] typing sem wamid inbound ticket=${params.ticket.id}`
        );
        return;
      }
      await sendMetaCloudTypingIndicator({
        whatsapp: params.connection,
        messageId: wid
      });
    },
    sendMessage: async (_jid: string, content: any) => {
      const remoteJid = `${params.contact.number}@s.whatsapp.net`;
      (params.ticket as any).whatsapp = params.connection;
      (params.ticket as any).contact = params.contact;

      const media = await resolveBaileysMedia(content);
      if (media) {
        try {
          const sendResult = await sendOficialMedia({
            ticket: params.ticket,
            contact: params.contact,
            connection: params.connection,
            media
          });
          const sendAny = sendResult as any;
          const mid = String(
            sendAny?.idMessageWhatsApp?.[0] ||
              sendAny?.messages?.[0]?.id ||
              `ofc_media_${Date.now()}_${params.ticket.id}`
          );
          return {
            key: { id: mid, fromMe: true, remoteJid },
            message: { documentMessage: { fileName: media.fileName } },
            messageTimestamp: Math.floor(Date.now() / 1000),
            status: 2
          };
        } catch (e: any) {
          logger.error(
            `[WA-OFICIAL-AGENT] falha mídia roteiro ticket=${params.ticket.id}: ${
              e?.message || e
            }`
          );
          throw e;
        }
      }

      const rawIn = String(content?.text || "")
        .replace(/\u200e/g, "")
        .trim();
      const raw = expandOutboundText(rawIn, params.ticket, params.contact);
      if (!raw) {
        return {
          key: {
            id: `ofc_empty_${Date.now()}`,
            fromMe: true,
            remoteJid
          },
          message: { conversation: "" },
          messageTimestamp: Math.floor(Date.now() / 1000),
          status: 2
        };
      }

      // Digitando… antes do texto (se ainda não houver delay externo)
      try {
        const wid = String(
          (params.ticket as any)?.__lastInboundWamid || inboundWamid || ""
        ).trim();
        if (wid && !(params.ticket as any).__oficialTypingSentForTurn) {
          await sendMetaCloudTypingIndicator({
            whatsapp: params.connection,
            messageId: wid
          });
          await delay(Math.min(computeTypingDurationMs(raw), 4000));
          (params.ticket as any).__oficialTypingSentForTurn = true;
        }
      } catch {
        /* typing opcional */
      }

      const sendResult = await SendWhatsAppOficialMessage({
        body: `\u200e ${raw}`,
        ticket: params.ticket,
        quotedMsg: null,
        type: "text",
        media: null,
        vCard: null,
        fromAgent: true
      });
      const sendAny = sendResult as any;
      const mid = String(
        sendAny?.idMessageWhatsApp?.[0] ||
          sendAny?.messages?.[0]?.id ||
          `ofc_flow_${Date.now()}_${params.ticket.id}`
      );
      return {
        key: { id: mid, fromMe: true, remoteJid },
        message: { conversation: raw },
        messageTimestamp: Math.floor(Date.now() / 1000),
        status: 2
      };
    }
  };
}

export function buildOficialStubMsg(contact: Contact, messageWid: string) {
  return {
    key: {
      remoteJid: `${contact.number}@s.whatsapp.net`,
      id: String(messageWid || `ofc_${Date.now()}`),
      fromMe: false
    },
    message: { conversation: "" },
    messageTimestamp: Math.floor(Date.now() / 1000)
  } as any;
}

export function promptHasAttendanceFlowScript(prompt: any): boolean {
  const scriptBlob = `${String(prompt?.attendanceScript || "")}\n${String(
    prompt?.prompt || ""
  )}`;
  return (
    (Array.isArray(prompt?.attendanceFlowSteps) &&
      prompt.attendanceFlowSteps.length > 0) ||
    /(?:^|\r?\n)\s*#?\s*(?:ETAPA|PASSO)\s*\d+|#\s*ETAPA\b|#\s*PASSO\b|(^|\r?\n)\s*---\s*(\r?\n|$)/im.test(
      scriptBlob
    )
  );
}
