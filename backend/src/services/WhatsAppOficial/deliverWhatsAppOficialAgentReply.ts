import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";
import { sanitizeAgentCustomerVisibleText } from "../../helpers/sanitizeAgentCustomerVisibleText";
import {
  isAgentOutboundGuardEnabled,
  recordSentOutbound,
  shouldSendOutbound
} from "../PromptServices/AgentOutboundGuard";
import { splitAgentReplyIntoSmartBlocks } from "../PromptServices/AgentOrchestratorService";
import {
  AGENT_OUTBOUND_BUBBLE_DELAY_MS
} from "../../config/openAiDefaults";
import SendWhatsAppOficialMessage from "./SendWhatsAppOficialMessage";
import { markTicketUnderAgentAttendance } from "../TicketServices/markTicketUnderAgentAttendance";
import ShowTicketService from "../TicketServices/ShowTicketService";
import { getIO } from "../../libs/socket";
import logger from "../../utils/logger";
import { processScriptMessage } from "../../helpers/processScriptMessage";
import {
  extractHashMediaSlugsFromScriptBlock
} from "../../helpers/agentScriptInitialSendSlice";
import ShowPromptService from "../PromptServices/ShowPromptService";
import PromptAgentMedia from "../../models/PromptAgentMedia";
import PromptKnowledgeSource from "../../models/PromptKnowledgeSource";
import path from "path";
import fs from "fs";
import mime from "mime-types";
import axios from "axios";
import { resolveWhatsAppMediaKindFromMime } from "../../helpers/whatsAppMediaKind";
import { sendMetaCloudTypingIndicator } from "./sendMetaCloudTypingIndicator";
import {
  computeTypingDurationMs
} from "../../helpers/agentOutboundHumanDelay";
import delay from "../../utils/delay";

function normalizeMediaSlugKey(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function slugMatches(candidate: string, wantNorm: string, wantCompact: string): boolean {
  const s = normalizeMediaSlugKey(candidate);
  if (!s) return false;
  return (
    s === wantNorm ||
    s.replace(/_/g, "") === wantCompact ||
    (wantCompact.length >= 12 &&
      (s.replace(/_/g, "").includes(wantCompact) ||
        wantCompact.includes(s.replace(/_/g, ""))))
  );
}

async function resolvePromptMediaBySlug(
  promptId: number,
  companyId: number,
  slug: string
): Promise<{ fullPath: string; fileName: string; mimetype: string } | null> {
  try {
    const norm = normalizeMediaSlugKey(slug);
    const compact = norm.replace(/_/g, "");
    let fileUrl = "";
    let preferred = `${norm || slug}.pdf`;

    try {
      const rows = await PromptAgentMedia.findAll({
        where: { promptId, companyId }
      });
      const hit = rows.find(
        (r) =>
          slugMatches(String(r.slug || ""), norm, compact) ||
          slugMatches(String(r.name || "").replace(/\.[^.]+$/, ""), norm, compact)
      );
      if (hit?.fileUrl) {
        fileUrl = String(hit.fileUrl);
        preferred = String(hit.name || preferred);
      }
    } catch {
      /* ignore */
    }

    if (!fileUrl) {
      try {
        const prompt = await ShowPromptService({ promptId, companyId });
        const midRaw =
          (prompt as any)?.getDataValue?.("midias") ?? (prompt as any)?.midias;
        const mid =
          typeof midRaw === "string"
            ? (() => {
                try {
                  return JSON.parse(midRaw);
                } catch {
                  return {};
                }
              })()
            : midRaw || {};
        const lib = mid?.guimoMediaLibrary;
        if (Array.isArray(lib)) {
          const hit = lib.find(
            (m: any) =>
              slugMatches(String(m?.slug || ""), norm, compact) ||
              slugMatches(String(m?.name || "").replace(/\.[^.]+$/, ""), norm, compact)
          );
          if (hit?.fileUrl) {
            fileUrl = String(hit.fileUrl);
            preferred = String(hit.name || preferred);
          }
        }
      } catch {
        /* ignore */
      }
    }

    // Base de conhecimento com fileUrl (mesmo PDF anexado em Documentos extraídos)
    if (!fileUrl) {
      try {
        const knRows = await PromptKnowledgeSource.findAll({
          where: { promptId, companyId }
        });
        const hit = knRows.find((r) => {
          const fu = String(r.fileUrl || "").trim();
          if (!fu) return false;
          const title = String(r.title || "").replace(/\.[^.]+$/, "");
          let fileKey = "";
          try {
            fileKey = path
              .basename(fu.split("?")[0] || "")
              .replace(/\.[^.]+$/, "");
          } catch {
            /* ignore */
          }
          return (
            slugMatches(title, norm, compact) ||
            slugMatches(fileKey, norm, compact)
          );
        });
        if (hit?.fileUrl) {
          fileUrl = String(hit.fileUrl);
          preferred = String(hit.title || preferred);
        }
      } catch {
        /* ignore */
      }
    }

    if (!fileUrl) return null;

    const PUBLIC_ROOT = path.resolve(__dirname, "..", "..", "..", "public");
    const rel = fileUrl.startsWith("/") ? fileUrl.slice(1) : fileUrl;
    const local = path.join(PUBLIC_ROOT, rel);
    if (fs.existsSync(local)) {
      const fileName = path.basename(preferred || local);
      const withExt = /\.[a-z0-9]{1,8}$/i.test(fileName)
        ? fileName
        : `${fileName}${path.extname(local) || ".pdf"}`;
      let mimetype = String(mime.lookup(withExt) || "");
      if (!mimetype || mimetype === "application/octet-stream") {
        mimetype = /\.pdf$/i.test(withExt) ? "application/pdf" : "application/octet-stream";
      }
      return {
        fullPath: local,
        fileName: withExt,
        mimetype
      };
    }
    if (/^https?:\/\//i.test(fileUrl)) {
      const dir = path.join(PUBLIC_ROOT, `company${companyId}`, "agent-media");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const res = await axios.get(fileUrl, {
        responseType: "arraybuffer",
        timeout: 60000
      });
      let ext = ".pdf";
      try {
        ext = path.extname(new URL(fileUrl).pathname) || ".pdf";
      } catch {
        /* ignore */
      }
      if (ext === ".bin" || !ext) ext = ".pdf";
      const fileName = `${slug}${ext}`.replace(/[^\w.\-]+/g, "_");
      const fullPath = path.join(dir, `${Date.now()}_${fileName}`);
      fs.writeFileSync(fullPath, Buffer.from(res.data));
      return {
        fullPath,
        fileName,
        mimetype: String(mime.lookup(fileName) || "application/pdf")
      };
    }
  } catch (e: any) {
    logger.warn(
      `[WA-OFICIAL-AGENT] resolve media slug=${slug}: ${e?.message || e}`
    );
  }
  return null;
}

async function emitTicketUpdate(ticket: Ticket): Promise<void> {
  try {
    const io = getIO();
    const full = await ShowTicketService(ticket.id, ticket.companyId);
    io.of("/" + String(ticket.companyId)).emit(
      `company-${ticket.companyId}-ticket`,
      {
        action: "update",
        ticket: full,
        ticketId: ticket.id
      }
    );
  } catch {
    /* socket opcional */
  }
}

/**
 * Envia resposta do agente via WhatsApp Cloud API (oficial)
 * e grava bolha azul (fromAgent) no CRM.
 */
export async function deliverWhatsAppOficialAgentReply(params: {
  connection: Whatsapp;
  ticket: Ticket;
  contact: Contact;
  prompt: { id: number };
  text: string;
}): Promise<number> {
  const connection =
    (await Whatsapp.findByPk(params.connection.id)) || params.connection;
  const contact =
    (await Contact.findByPk(params.contact.id)) || params.contact;
  let ticket = (await Ticket.findByPk(params.ticket.id)) || params.ticket;

  if (!String(contact?.number || "").trim()) {
    throw new Error(
      `WA-OFICIAL-AGENT: contato ${contact?.id} sem number`
    );
  }

  (ticket as any).whatsapp = connection;
  (ticket as any).contact = contact;
  (ticket as any).setDataValue?.("whatsapp", connection);
  (ticket as any).setDataValue?.("contact", contact);
  if (!ticket.channel) {
    (ticket as any).channel = "whatsapp_oficial";
  }
  if (!ticket.whatsappId) {
    ticket.whatsappId = connection.id;
  }

  const processedText = processScriptMessage(String(params.text || ""), {
    contact: {
      name: contact?.name,
      number: contact?.number,
      email: contact?.email,
      extraInfo: (contact as any)?.extraInfo || null
    },
    ticket: {
      id: ticket?.id,
      user: (ticket as any)?.user || null,
      queue: (ticket as any)?.queue || null,
      whatsapp: connection,
      company: (ticket as any)?.company || null
    },
    agentName: (params.prompt as any)?.name || "",
    companyName: (ticket as any)?.company?.name || "",
    now: new Date()
  });

  // #slug no texto (PDF do roteiro) — envia mídia e remove o hash do corpo
  const mediaSlugs = extractHashMediaSlugsFromScriptBlock(processedText);
  let textForBubbles = processedText;
  for (const slug of mediaSlugs) {
    textForBubbles = textForBubbles
      .replace(new RegExp(`#${slug}\\b`, "gi"), "")
      .replace(/[ \t]+\n/g, "\n")
      .trim();
  }

  const blocks = splitAgentReplyIntoSmartBlocks(textForBubbles, {
    // Cloud API: ~4096 chars/bolha. Nunca descartar resto de FAQ/roteiro.
    maxChars: 4000,
    maxBlocks: 80,
    preserveScriptStructure: true,
    neverDropRemainder: true
  });

  const inboundWamid = String(
    (ticket as any)?.__lastInboundWamid || ""
  ).trim();
  if (inboundWamid && blocks.some(b => sanitizeAgentCustomerVisibleText(b))) {
    try {
      await sendMetaCloudTypingIndicator({
        whatsapp: connection,
        messageId: inboundWamid
      });
      const preview = blocks.map(b => sanitizeAgentCustomerVisibleText(b)).join(" ");
      await delay(Math.min(computeTypingDurationMs(preview), 5000));
    } catch {
      /* typing opcional */
    }
  }

  let sent = 0;
  for (const block of blocks) {
    const safeBlock = sanitizeAgentCustomerVisibleText(block);
    if (!safeBlock) continue;

    if (isAgentOutboundGuardEnabled()) {
      const guard = shouldSendOutbound(
        safeBlock,
        ticket,
        params.prompt.id
      );
      if (!guard.send) {
        logger.info(
          `[WA-OFICIAL-AGENT] outbound guard (${guard.reason}) ticket=${ticket.id}`
        );
        continue;
      }
    }

    const agentBody = `\u200e ${safeBlock}`;
    try {
      await SendWhatsAppOficialMessage({
        body: agentBody,
        ticket,
        quotedMsg: null,
        type: "text",
        media: null,
        vCard: null,
        fromAgent: true
      });
      if (isAgentOutboundGuardEnabled()) {
        await recordSentOutbound(safeBlock, ticket, params.prompt.id);
      }
      sent += 1;
      logger.info(
        `[WA-OFICIAL-AGENT] bolha enviada ticket=${ticket.id}`
      );
    } catch (err: any) {
      logger.error(
        `[WA-OFICIAL-AGENT] falha envio ticket=${ticket.id} recipient=${contact.number}: ${
          err?.message || err
        }`
      );
      throw err;
    }

    if (blocks.length > 1) {
      await new Promise(resolve =>
        setTimeout(resolve, AGENT_OUTBOUND_BUBBLE_DELAY_MS)
      );
    }
  }

  for (const slug of mediaSlugs) {
    try {
      const mat = await resolvePromptMediaBySlug(
        Number(params.prompt.id),
        ticket.companyId,
        slug
      );
      if (!mat) {
        logger.warn(
          `[WA-OFICIAL-AGENT] #${slug} sem arquivo no prompt ticket=${ticket.id}`
        );
        continue;
      }
      let mimetype = String(mat.mimetype || "").toLowerCase();
      if (!mimetype || mimetype === "application/octet-stream") {
        mimetype = /\.pdf$/i.test(mat.fileName)
          ? "application/pdf"
          : "application/octet-stream";
      }
      const mediaType = resolveWhatsAppMediaKindFromMime(
        mimetype,
        mat.fileName
      ) as "document" | "image" | "video" | "audio";
      const multerFile = {
        fieldname: "file",
        originalname: mat.fileName,
        encoding: "7bit",
        mimetype,
        size: fs.statSync(mat.fullPath).size,
        destination: path.dirname(mat.fullPath),
        filename: path.basename(mat.fullPath),
        path: mat.fullPath,
        buffer: undefined as any,
        stream: undefined as any
      } as Express.Multer.File;
      await SendWhatsAppOficialMessage({
        body: "",
        ticket,
        quotedMsg: null,
        type:
          mediaType === "image" ||
          mediaType === "video" ||
          mediaType === "audio" ||
          mediaType === "document"
            ? mediaType
            : "document",
        media: multerFile,
        vCard: null,
        fromAgent: true
      });
      sent += 1;
      logger.info(
        `[WA-OFICIAL-AGENT] mídia #${slug} type=${mediaType} enviada ticket=${ticket.id}`
      );
    } catch (e: any) {
      logger.error(
        `[WA-OFICIAL-AGENT] falha #${slug} ticket=${ticket.id}: ${e?.message || e}`
      );
    }
  }

  if (sent > 0) {
    await markTicketUnderAgentAttendance(ticket);
    await emitTicketUpdate(ticket);
  }

  return sent;
}
