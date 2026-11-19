import fs from "fs";
import path from "path";
import { proto } from "baileys";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import TicketTraking from "../../models/TicketTraking";
import Prompt from "../../models/Prompt";
import PromptSmartAction from "../../models/PromptSmartAction";
import PromptAgentMedia from "../../models/PromptAgentMedia";
import Inventory from "../../models/Inventory";
import { getMessageOptions } from "../WbotServices/SendWhatsAppMedia";
import CreateConvertedLeadService from "../ConvertedLeadServices/CreateService";
import { executeSmartAction } from "./PromptSmartActionExecutorService";
import CreateLogTicketService from "../TicketServices/CreateLogTicketService";
import logger from "../../utils/logger";
import { sanitizeAgentCustomerVisibleText } from "../../helpers/sanitizeAgentCustomerVisibleText";
import { processScriptMessage } from "../../helpers/processScriptMessage";
import { assistantTextImpliesTransferToHuman } from "../../helpers/assistantTransferIntent";
import {
  extractSlashCommandsFromTrainingTail,
  extractHashMediaSlugsFromScriptBlock,
  isScriptStructuralHeadingLine,
  matchScriptCommandSlugFromLine,
  matchScriptMediaSlugFromLine,
  sliceAgentStepTextForInitialSend,
  stripTrailingScriptToken
} from "../../helpers/agentScriptInitialSendSlice";
import axios from "axios";
import mime from "mime-types";
import PromptKnowledgeSource from "../../models/PromptKnowledgeSource";
import { resolveWhatsAppMediaKindFromMime } from "../../helpers/whatsAppMediaKind";

type Session = any;

function normalizeMediaSlugKey(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function transferVarsIfDeclared(
  actionSlug: string,
  vars: Record<string, unknown>,
  customerVisibleText: string
): Record<string, unknown> | null {
  if (actionSlug !== "transferirChamado" && actionSlug !== "transferirAtendimento") {
    return vars;
  }
  if (!assistantTextImpliesTransferToHuman(customerVisibleText)) {
    return null;
  }
  return {
    ...vars,
    assistantDeclaredTransfer: true,
    transferAuthorized: true,
    scriptTransferWithDeclaration: true
  };
}

function parseMidiasJson(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return p && typeof p === "object" && !Array.isArray(p) ? p : {};
    } catch {
      return {};
    }
  }
  return {};
}

type MediaEntry = { slug: string; fileUrl?: string; fileType?: string; caption?: string; name?: string };

const PUBLIC_ROOT = path.resolve(__dirname, "..", "..", "..", "public");

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(String(s || "").trim());
}

/**
 * Resolve caminho local do arquivo de mídia do roteiro.
 * Aceita /company…, company…, URL http(s) e caminho absoluto.
 */
async function materializeScriptMediaFile(
  companyId: number,
  entry: MediaEntry
): Promise<{ fullPath: string; fileName: string } | null> {
  const url = String(entry.fileUrl || "").trim();
  if (!url) {
    logger.warn(`[SCRIPT-CMD] Mídia sem URL slug=${entry.slug}`);
    return null;
  }

  const preferredName = String(entry.name || "").trim();
  const ensureExt = (name: string, fallbackPath: string): string => {
    const n = String(name || "").trim() || path.basename(fallbackPath);
    if (/\.[a-z0-9]{1,8}$/i.test(n)) return n.slice(0, 380);
    const ext = path.extname(fallbackPath) || ".bin";
    return `${n.replace(/\.[^.]+$/, "")}${ext}`.slice(0, 380);
  };

  const rel = url.startsWith("/") ? url.slice(1) : url;
  const fullPathLocal = path.join(PUBLIC_ROOT, rel);
  if (fs.existsSync(fullPathLocal)) {
    return {
      fullPath: fullPathLocal,
      fileName: ensureExt(preferredName || path.basename(fullPathLocal), fullPathLocal)
    };
  }

  if (isHttpUrl(url)) {
    try {
      const dir = path.join(PUBLIC_ROOT, `company${companyId}`, "agent-media");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const res = await axios.get(url, { responseType: "arraybuffer", timeout: 60000 });
      let ext = ".bin";
      try {
        ext = path.extname(new URL(url).pathname) || ".bin";
      } catch {
        /* ignore */
      }
      if (ext === ".bin" && /\.pdf(\?|$)/i.test(url)) ext = ".pdf";
      const base =
        (preferredName && /\.[a-z0-9]{1,8}$/i.test(preferredName)
          ? preferredName
          : `${entry.slug || "media"}${ext}`
        ).replace(/[^\w.\-]+/g, "_") || `media${ext}`;
      const fileName = `${Date.now()}_${base}`.slice(0, 380);
      const fullPath = path.join(dir, fileName);
      fs.writeFileSync(fullPath, Buffer.from(res.data));
      return { fullPath, fileName };
    } catch (e) {
      logger.error(`[SCRIPT-CMD] Download HTTP falhou slug=${entry.slug}`, e);
      return null;
    }
  }

  if (path.isAbsolute(url) && fs.existsSync(url)) {
    return { fullPath: url, fileName: ensureExt(preferredName || path.basename(url), url) };
  }

  logger.warn(`[SCRIPT-CMD] Arquivo ausente slug=${entry.slug} url=${url} tried=${fullPathLocal}`);
  return null;
}

function putMediaEntry(map: Map<string, MediaEntry>, entry: MediaEntry): void {
  const slug = String(entry.slug || "").trim();
  if (!slug || !entry.fileUrl) return;
  map.set(slug, entry);
  const alt = normalizeMediaSlugKey(slug);
  if (alt && alt !== slug && !map.has(alt)) {
    map.set(alt, { ...entry, slug: alt });
  }
  const fromName = normalizeMediaSlugKey(String(entry.name || "").replace(/\.[^.]+$/, ""));
  if (fromName && !map.has(fromName)) {
    map.set(fromName, { ...entry, slug: fromName });
  }
  try {
    const base = path.basename(String(entry.fileUrl).split("?")[0] || "");
    const fromFile = normalizeMediaSlugKey(base.replace(/\.[^.]+$/, ""));
    if (fromFile && !map.has(fromFile)) {
      map.set(fromFile, { ...entry, slug: fromFile });
    }
  } catch {
    /* ignore */
  }
}

async function loadMediaIndex(prompt: Prompt, companyId: number): Promise<Map<string, MediaEntry>> {
  const map = new Map<string, MediaEntry>();
  // Sequelize: getDataValue pode ser null enquanto .midias ainda tem o JSON em memória
  const midiasRaw =
    (typeof (prompt as any)?.getDataValue === "function"
      ? (prompt as any).getDataValue("midias")
      : null) ?? (prompt as any)?.midias;
  const mid = parseMidiasJson(midiasRaw);
  const lib = mid.guimoMediaLibrary;
  if (Array.isArray(lib)) {
    for (const m of lib) {
      const slug = String(m?.slug || "").trim();
      if (!slug) continue;
      putMediaEntry(map, {
        slug,
        fileUrl: m.fileUrl != null ? String(m.fileUrl) : "",
        fileType: m.fileType != null ? String(m.fileType) : "",
        caption: m.caption != null ? String(m.caption) : "",
        name: m.name != null ? String(m.name) : slug
      });
    }
  }
  try {
    const rows = await PromptAgentMedia.findAll({
      where: { promptId: prompt.id, companyId }
    });
    for (const r of rows) {
      const slug = String(r.slug || "").trim();
      if (!slug) continue;
      putMediaEntry(map, {
        slug,
        fileUrl: r.fileUrl || "",
        fileType: r.fileType || "",
        caption: r.caption || "",
        name: r.name || slug
      });
    }
  } catch (e) {
    logger.warn(`[SCRIPT-CMD] PromptAgentMedia load falhou prompt=${prompt.id}`, e);
  }
  // Documentos da base com fileUrl também respondem a #slug (título / nome do arquivo).
  try {
    const knowledgeRows = await PromptKnowledgeSource.findAll({
      where: { promptId: prompt.id, companyId }
    });
    for (const r of knowledgeRows) {
      const fileUrl = String(r.fileUrl || "").trim();
      if (!fileUrl) continue;
      const title = String(r.title || "").trim();
      const slug =
        normalizeMediaSlugKey(title.replace(/\.[^.]+$/, "")) ||
        normalizeMediaSlugKey(path.basename(fileUrl.split("?")[0] || "").replace(/\.[^.]+$/, ""));
      if (!slug) continue;
      putMediaEntry(map, {
        slug,
        fileUrl,
        fileType: "documento",
        caption: "",
        name: title || slug
      });
    }
  } catch (e) {
    logger.warn(`[SCRIPT-CMD] PromptKnowledgeSource media load falhou prompt=${prompt.id}`, e);
  }
  return map;
}

function parseAttachments(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function sendOneMedia(
  verifyMediaMessage: any,
  wbot: Session,
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  contact: Contact,
  ticketTraking: TicketTraking | undefined,
  companyId: number,
  entry: MediaEntry,
  verifyMessage: any
): Promise<boolean> {
  const mat = await materializeScriptMediaFile(companyId, entry);
  if (!mat) return false;

  // WhatsApp Oficial (Cloud API stub): envia direto — sem verifyMediaMessage Baileys
  if ((wbot as any)?.__oficialCloudApi === true) {
    try {
      const SendWhatsAppOficialMessage = (
        await import("../WhatsAppOficial/SendWhatsAppOficialMessage")
      ).default;
      const conn =
        (wbot as any)?.__oficialConnection ||
        (ticket as any)?.whatsapp ||
        null;
      if (conn) {
        (ticket as any).whatsapp = conn;
        if (!ticket.whatsappId) {
          ticket.whatsappId = Number(conn.id) || ticket.whatsappId;
        }
      }
      (ticket as any).contact = contact;
      if (contact?.id && !ticket.contactId) {
        (ticket as any).contactId = contact.id;
      }

      let mimetype = String(mime.lookup(mat.fileName) || "").toLowerCase();
      if (!mimetype || mimetype === "application/octet-stream") {
        if (
          /\.pdf$/i.test(mat.fileName) ||
          entry.fileType === "documento" ||
          entry.fileType === "document"
        ) {
          mimetype = "application/pdf";
        } else if (entry.fileType === "imagem" || entry.fileType === "image") {
          mimetype = "image/jpeg";
        } else if (entry.fileType === "video") {
          mimetype = "video/mp4";
        } else if (entry.fileType === "audio" || entry.fileType === "áudio") {
          mimetype = "audio/mpeg";
        } else {
          mimetype = "application/octet-stream";
        }
      }
      let cloudType = resolveWhatsAppMediaKindFromMime(
        mimetype,
        mat.fileName
      ) as "document" | "image" | "video" | "audio";
      if (!["document", "image", "video", "audio"].includes(cloudType)) {
        cloudType = "document";
      }
      const multerFile = {
        fieldname: "file",
        originalname: mat.fileName,
        encoding: "7bit",
        mimetype,
        size: fs.existsSync(mat.fullPath) ? fs.statSync(mat.fullPath).size : 0,
        destination: path.dirname(mat.fullPath),
        filename: path.basename(mat.fullPath),
        path: mat.fullPath,
        buffer: undefined as any,
        stream: undefined as any
      };
      await SendWhatsAppOficialMessage({
        body: "",
        ticket,
        quotedMsg: null,
        type: cloudType,
        media: multerFile as any,
        vCard: null,
        fromAgent: true
      });
      logger.info(
        `[SCRIPT-CMD] mídia Oficial enviada slug=${entry.slug} type=${cloudType} file=${mat.fileName} mime=${mimetype}`
      );
      const cap = String(entry.caption || "").trim();
      if (cap) {
        await SendWhatsAppOficialMessage({
          body: `\u200e ${cap}`,
          ticket,
          quotedMsg: null,
          type: "text",
          media: null,
          vCard: null,
          fromAgent: true
        });
      }
      return true;
    } catch (e) {
      logger.error(
        `[SCRIPT-CMD] Falha mídia Oficial direta slug=${entry.slug} — tentando stub wbot`,
        e
      );
      // Fallback: stub Baileys-like (resolveBaileysMedia → Cloud API)
      try {
        const buf = fs.readFileSync(mat.fullPath);
        const kind = resolveWhatsAppMediaKindFromMime(
          String(mime.lookup(mat.fileName) || "application/octet-stream"),
          mat.fileName
        );
        const payload: any = {
          mimetype: String(mime.lookup(mat.fileName) || "application/octet-stream"),
          fileName: mat.fileName,
          caption: String(entry.caption || "").trim()
        };
        if (kind === "image") payload.image = buf;
        else if (kind === "video") payload.video = buf;
        else if (kind === "audio") payload.audio = buf;
        else payload.document = buf;
        await wbot.sendMessage(String(msg.key.remoteJid || ""), payload);
        logger.info(
          `[SCRIPT-CMD] mídia Oficial via stub ok slug=${entry.slug} file=${mat.fileName}`
        );
        return true;
      } catch (e2) {
        logger.error(
          `[SCRIPT-CMD] Falha mídia Oficial stub slug=${entry.slug}`,
          e2
        );
        return false;
      }
    }
  }

  try {
    // Caption vazio: não força body=" " (evita caption espúrio e preserva tipo nativo).
    const opts = await getMessageOptions(mat.fileName, mat.fullPath, String(companyId), "");
    if (opts && Object.keys(opts).length) {
      const mediaMsg = await wbot.sendMessage(msg.key.remoteJid!, { ...opts });
      await verifyMediaMessage(mediaMsg!, ticket, contact, ticketTraking!, false, false, wbot, true);
      logger.info(`[SCRIPT-CMD] mídia enviada slug=${entry.slug} file=${mat.fileName}`);
    } else {
      logger.warn(`[SCRIPT-CMD] getMessageOptions vazio slug=${entry.slug} file=${mat.fileName}`);
      return false;
    }
    const cap = String(entry.caption || "").trim();
    if (cap) {
      const sent = await wbot.sendMessage(msg.key.remoteJid!, { text: `\u200e ${cap}` });
      await verifyMessage(sent!, ticket, contact, ticketTraking, true, false, true);
    }
    return true;
  } catch (e) {
    logger.error(`[SCRIPT-CMD] Falha ao enviar mídia slug=${entry.slug}`, e);
    return false;
  }
}

async function resolveAndSendScriptMedia(
  mediaMap: Map<string, MediaEntry>,
  slug: string,
  verifyMediaMessage: any,
  wbot: Session,
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  contact: Contact,
  ticketTraking: TicketTraking | undefined,
  companyId: number,
  verifyMessage: any,
  executedCommands: Array<{ kind: "action" | "media"; slug: string }>
): Promise<boolean> {
  const norm = normalizeMediaSlugKey(slug);
  const compact = norm.replace(/_/g, "");
  const media =
    mediaMap.get(slug) ||
    mediaMap.get(slug.toLowerCase()) ||
    mediaMap.get(norm) ||
    [...mediaMap.entries()].find(([key, m]) => {
      const s = normalizeMediaSlugKey(key || m.slug);
      const nameKey = normalizeMediaSlugKey(String(m.name || "").replace(/\.[^.]+$/, ""));
      let fileKey = "";
      try {
        fileKey = normalizeMediaSlugKey(
          path.basename(String(m.fileUrl || "").split("?")[0] || "").replace(/\.[^.]+$/, "")
        );
      } catch {
        /* ignore */
      }
      return (
        s === norm ||
        s.replace(/_/g, "") === compact ||
        nameKey === norm ||
        nameKey.replace(/_/g, "") === compact ||
        fileKey === norm ||
        fileKey.replace(/_/g, "") === compact ||
        (compact.length >= 12 &&
          (s.replace(/_/g, "").includes(compact) ||
            compact.includes(s.replace(/_/g, "")) ||
            fileKey.replace(/_/g, "").includes(compact) ||
            compact.includes(fileKey.replace(/_/g, ""))))
      );
    })?.[1];
  if (!media || !media.fileUrl) {
    logger.warn(
      `[SCRIPT-CMD] mídia não encontrada slug=${slug} (norm=${norm}) keys=${[...mediaMap.keys()].slice(0, 40).join(",")}`
    );
    return false;
  }
  const ok = await sendOneMedia(
    verifyMediaMessage,
    wbot,
    msg,
    ticket,
    contact,
    ticketTraking,
    companyId,
    media,
    verifyMessage
  );
  if (ok) {
    executedCommands.push({ kind: "media", slug });
  }
  return ok;
}

/** Resolve linha de “Ação inteligente” pelo slug do roteiro (/agendamento, aliases). */
export async function findPromptSmartActionRowByScriptSlug(
  promptId: number,
  companyId: number,
  slug: string
): Promise<PromptSmartAction | null> {
  const s = String(slug || "").trim();
  if (!s) return null;
  try {
    const rows = await PromptSmartAction.findAll({
      where: { promptId, companyId }
    });
    const lower = (x: unknown) => String(x || "").toLowerCase();
    const bySlug = rows.find((r) => lower(r.slug) === s.toLowerCase());
    if (bySlug) return bySlug;
    const sl = s.toLowerCase();
    if (sl === "agendar" || sl === "marcarhorario" || sl === "marcar_horario") {
      const ag =
        rows.find((r) => lower(r.slug) === "agendamento" || lower(r.type) === "agendamento") || null;
      if (ag) return ag;
    }
    /** Roteiro pode usar /transferirAtendimento enquanto o preset salva slug transferirchamado. */
    if (
      sl === "transferiratendimento" ||
      sl === "transferirchamado" ||
      sl === "transferir_chamado" ||
      sl === "transferir_atendimento" ||
      (sl.includes("transferir") && (sl.includes("atendimento") || sl.includes("chamado")))
    ) {
      const xfer =
        rows.find((r) => {
          const rt = lower(r.type);
          const rs = lower(r.slug);
          return (
            rt === "transferir" ||
            rt === "transfer" ||
            rs === "transferirchamado" ||
            rs === "transferiratendimento"
          );
        }) || null;
      if (xfer) return xfer;
    }
    return rows.find((r) => lower(r.type) === sl) || null;
  } catch {
    return null;
  }
}

async function sendLineText(
  verifyMessage: any,
  wbot: Session,
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  contact: Contact,
  ticketTraking: TicketTraking | undefined,
  text: string
): Promise<void> {
  const prompt = (ticket as any)?.__agentOutboundPrompt || null;
  const processed = processScriptMessage(String(text || ""), {
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
      whatsapp: (ticket as any)?.whatsapp || null,
      company: (ticket as any)?.company || null
    },
    agentName: prompt?.name || (ticket as any)?.user?.name || "",
    companyName: (ticket as any)?.company?.name || "",
    now: new Date()
  });
  const t = sanitizeAgentCustomerVisibleText(processed);
  if (!t) return;
  const sent = await wbot.sendMessage(msg.key.remoteJid!, { text: `\u200e ${t}` });
  if ((wbot as any)?.__oficialCloudApi !== true) {
    await verifyMessage(sent!, ticket, contact, ticketTraking, true, false, true);
  }
}

export async function presentStepWithScriptCommands(params: {
  stepText: string;
  stepAttachments: unknown;
  wbot: Session;
  msg: proto.IWebMessageInfo;
  ticket: Ticket;
  contact: Contact;
  ticketTraking: TicketTraking | undefined;
  prompt: Prompt;
  verifyMessage: any;
  verifyMediaMessage: any;
  sendStepTextBlocks: (
    verifyMessage: any,
    wbot: Session,
    msg: proto.IWebMessageInfo,
    ticket: Ticket,
    contact: Contact,
    ticketTraking: TicketTraking | undefined,
    text: string
  ) => Promise<void>;
  /** transferQueue(queueId, ticket, contact, userId?, whatsappId?) do wbotMessageListener */
  transferQueue: (
    queueId: number,
    ticket: Ticket,
    contact: Contact,
    userId?: number | null,
    whatsappId?: number | null
  ) => Promise<void>;
  /** Se true (padrão), /agendamento sem data fixa nas variáveis da ação só roda após o cliente responder com data/hora. */
  deferAgendamentoUntilReply?: boolean;
  /** Etapa do fluxo de atendimento — evita deduplicar a mesma ação em passos diferentes do roteiro. */
  attendanceFlowStep?: number;
}): Promise<{
  executedCommands: Array<{ kind: "action" | "media"; slug: string }>;
  deferredActions: Array<{ slug: string; actionId: number; kind?: string }>;
}> {
  const {
    stepText,
    stepAttachments,
    wbot,
    msg,
    ticket,
    contact,
    ticketTraking,
    prompt,
    verifyMessage,
    verifyMediaMessage,
    sendStepTextBlocks,
    transferQueue,
    deferAgendamentoUntilReply = true,
    attendanceFlowStep
  } = params;

  const companyId = ticket.companyId;
  const mediaMap = await loadMediaIndex(prompt, companyId);
  let working = sliceAgentStepTextForInitialSend(String(stepText || ""));
  const lines = working.split(/\n/);
  const textBuffer: string[] = [];
  const executedCommands: Array<{ kind: "action" | "media"; slug: string }> = [];
  const deferredActions: Array<{ slug: string; actionId: number; kind?: string }> = [];

  const flushText = async () => {
    // Não colapsar a estrutura: join com \n preserva linha em branco (= bolha separada).
    const chunk = sanitizeAgentCustomerVisibleText(textBuffer.join("\n"));
    textBuffer.length = 0;
    if (chunk) await sendStepTextBlocks(verifyMessage, wbot, msg, ticket, contact, ticketTraking, chunk);
  };

  /** Após "EXEMPLO..." não enviar linhas ao cliente até "RESPOSTA:" (rótulo de treinamento). */
  let lineMode: "normal" | "skip_exemplo" = "normal";

  for (const line of lines) {
    const trimmed = line.trim();

    if (lineMode === "skip_exemplo") {
      if (/^resposta\s*:/i.test(trimmed)) {
        lineMode = "normal";
        continue;
      }
      continue;
    }

    if (/^EXEMPLO\s+DE\s+RESPOSTA/i.test(trimmed)) {
      await flushText();
      lineMode = "skip_exemplo";
      continue;
    }

    if (
      isScriptStructuralHeadingLine(trimmed) ||
      /^[\s\-=*_·•]{3,}$/.test(trimmed) ||
      /^(\*\s*){3,}$/.test(trimmed) ||
      /^(-\s*){3,}$/.test(trimmed)
    ) {
      continue;
    }
    if (/^mensagem\s*:?\s*$/i.test(trimmed)) continue;
    if (/^resposta\s*:/i.test(trimmed)) continue;

    // 1) Mídia via #slug (nova sintaxe do roteiro)
    const mediaSlug = matchScriptMediaSlugFromLine(trimmed);
    if (mediaSlug) {
      const preceding = stripTrailingScriptToken(line, mediaSlug, "media");
      if (String(preceding || "").trim()) textBuffer.push(preceding);
      await flushText();
      const sent = await resolveAndSendScriptMedia(
        mediaMap,
        mediaSlug,
        verifyMediaMessage,
        wbot,
        msg,
        ticket,
        contact,
        ticketTraking,
        companyId,
        verifyMessage,
        executedCommands
      );
      if (!sent) {
        logger.info(`[SCRIPT-CMD] #${mediaSlug} sem mídia cadastrada`);
      }
      continue;
    }

    const cmdSlug = matchScriptCommandSlugFromLine(trimmed);
    if (cmdSlug) {
      const preceding = stripTrailingScriptToken(line, cmdSlug, "command");
      if (String(preceding || "").trim()) textBuffer.push(preceding);
      await flushText();
      const slug = cmdSlug;
      // Compat: /slug ainda pode enviar mídia se existir na biblioteca (roteiros antigos).
      const sentMedia = await resolveAndSendScriptMedia(
        mediaMap,
        slug,
        verifyMediaMessage,
        wbot,
        msg,
        ticket,
        contact,
        ticketTraking,
        companyId,
        verifyMessage,
        executedCommands
      );
      if (sentMedia) {
        continue;
      }
      const action = await findPromptSmartActionRowByScriptSlug(prompt.id, companyId, slug);
      if (!action) {
        logger.info(`[SCRIPT-CMD] slug sem mídia nem ação: ${slug}`);
        continue;
      }
      const vars = (action.variables && typeof action.variables === "object" ? action.variables : {}) as Record<
        string,
        unknown
      >;
      const type = String(action.type || "").toLowerCase();
      try {
        let actionSlug = slug;
        
        if (
          type === "transferir" ||
          type === "transfer" ||
          slug.toLowerCase().includes("transfer") ||
          slug.toLowerCase().includes("transferir") ||
          slug.toLowerCase() === "transferiratendimento"
        ) {
          actionSlug = "transferirChamado";
        } else if (type === "criar_lead" || type === "criarlead") {
          actionSlug = "criarLead";
        } else if (type === "inventario" || type === "preco") {
          actionSlug = "passarPreco";
        } else if (type === "consultar_produtos" || /consultarproduto/i.test(slug)) {
          actionSlug = "consultarProdutos";
        } else if (type === "consultar_estoque" || /consultarestoque/i.test(slug)) {
          actionSlug = "consultarEstoque";
        } else if (type === "enviar_link_produto" || /enviarlinkproduto/i.test(slug)) {
          actionSlug = "enviarLinkProduto";
        } else if (
          type === "registrar_intencao_compra" ||
          /registrarintencaocompra|intencaocompra/i.test(slug)
        ) {
          actionSlug = "registrarIntencaoCompra";
        } else if (
          type === "consultar_agenda" ||
          type === "consultaragenda" ||
          /agenda/i.test(slug)
        ) {
          actionSlug = "consultarAgenda";
        } else if (type === "agendamento" || slug.toLowerCase() === "agendar") {
          actionSlug = "agendamento";
        } else if (type === "atender" || slug.toLowerCase().includes("atender")) {
          actionSlug = "atenderChamado";
        } else if (type === "enviar_link" || slug.toLowerCase().includes("enviar") || slug.toLowerCase().includes("link")) {
          actionSlug = "enviarLink";
        }

        const explicitSchedule =
          vars.useNow === true ||
          vars.scheduleNow === true ||
          (vars.date != null && String(vars.date).trim() !== "") ||
          (vars.sendAt != null && String(vars.sendAt).trim() !== "");

        if (
          actionSlug === "agendamento" &&
          deferAgendamentoUntilReply &&
          !explicitSchedule
        ) {
          deferredActions.push({
            kind: "agendamento",
            slug: String(action.slug || slug).trim() || "agendamento",
            actionId: action.id
          });
          continue;
        }

        const customerVisible = sanitizeAgentCustomerVisibleText(textBuffer.join("\n"));
        const execVars = transferVarsIfDeclared(actionSlug, vars, customerVisible);
        if (execVars === null) {
          logger.info(
            `[SCRIPT-CMD] transferência omitida — agente não declarou transferência na mensagem ticket=${ticket.id}`
          );
          continue;
        }

        executedCommands.push({ kind: "action", slug });
        const actionResult = await executeSmartAction(actionSlug, prompt, ticket, contact, execVars, {
          smartActionId: action.id,
          scriptSlug: slug,
          attendanceFlowStep
        });

        const isTransferAction =
          actionSlug === "transferirChamado" || actionSlug === "transferirAtendimento";
        const isSilentCrm =
          actionSlug === "criarLead" ||
          actionSlug === "criarAtividade" ||
          actionSlug === "criarContato";

        if (actionResult.success) {
          if (isSilentCrm) {
            continue;
          }
          const rm = sanitizeAgentCustomerVisibleText(
            String(actionResult.message || action.responseMessage || "").trim()
          );
          if (rm) {
            await sendLineText(verifyMessage, wbot, msg, ticket, contact, ticketTraking, rm);
          } else if (!isTransferAction) {
            /* outras ações sem texto configurado */
          }
        } else {
          logger.warn(`[SCRIPT-CMD] Ação ${actionSlug} falhou: ${actionResult.message}`);
          const rm = sanitizeAgentCustomerVisibleText(String(action.responseMessage || "").trim());
          if (rm) {
            await sendLineText(verifyMessage, wbot, msg, ticket, contact, ticketTraking, rm);
          }
        }
      } catch (e) {
        logger.error(`[SCRIPT-CMD] ação slug=${slug} falhou`, e);
      }
      continue;
    }
    textBuffer.push(line);
  }
  await flushText();

  const tailSlugs = extractSlashCommandsFromTrainingTail(String(stepText || ""));
  const haveDeferredId = new Set(deferredActions.map((d) => d.actionId));
  const haveExecutedSlug = new Set(executedCommands.map((e) => e.slug));

  for (const tailSlug of tailSlugs) {
    if (haveExecutedSlug.has(tailSlug)) continue;
    const action = await findPromptSmartActionRowByScriptSlug(prompt.id, companyId, tailSlug);
    if (!action) {
      logger.info(`[SCRIPT-CMD] tail /${tailSlug} sem ação configurada`);
      continue;
    }
    if (haveDeferredId.has(action.id)) continue;

    const vars = (action.variables && typeof action.variables === "object" ? action.variables : {}) as Record<
      string,
      unknown
    >;
    const type = String(action.type || "").toLowerCase();
    let actionSlug = tailSlug;
    if (
      type === "transferir" ||
      type === "transfer" ||
      tailSlug.toLowerCase().includes("transfer") ||
      tailSlug.toLowerCase().includes("transferir") ||
      tailSlug.toLowerCase() === "transferiratendimento"
    ) {
      actionSlug = "transferirChamado";
    } else if (type === "criar_lead" || type === "criarlead") {
      actionSlug = "criarLead";
    } else if (type === "inventario" || type === "preco") {
      actionSlug = "passarPreco";
    } else if (type === "consultar_agenda" || type === "consultaragenda" || /agenda/i.test(tailSlug)) {
      actionSlug = "consultarAgenda";
    } else if (type === "agendamento" || tailSlug.toLowerCase() === "agendar") {
      actionSlug = "agendamento";
    } else if (type === "atender" || tailSlug.toLowerCase().includes("atender")) {
      actionSlug = "atenderChamado";
    } else if (
      type === "enviar_link" ||
      tailSlug.toLowerCase().includes("enviar") ||
      tailSlug.toLowerCase().includes("link")
    ) {
      actionSlug = "enviarLink";
    }

    const explicitSchedule =
      vars.useNow === true ||
      vars.scheduleNow === true ||
      (vars.date != null && String(vars.date).trim() !== "") ||
      (vars.sendAt != null && String(vars.sendAt).trim() !== "");

    if (actionSlug === "agendamento" && deferAgendamentoUntilReply && !explicitSchedule) {
      deferredActions.push({
        kind: "agendamento",
        slug: String(action.slug || tailSlug).trim() || "agendamento",
        actionId: action.id
      });
      haveDeferredId.add(action.id);
      continue;
    }
    /**
     * Transferência no tail (RESPOSTA após EXEMPLO): executar neste mesmo turno após o texto ao cliente.
     * Diferente do agendamento, não depende de uma nova mensagem inbound — senão o ticket fica sem transferir.
     */
    if (actionSlug === "transferirChamado" || actionSlug === "transferirAtendimento") {
      const tailVisible = sanitizeAgentCustomerVisibleText(working);
      const tailVars = transferVarsIfDeclared(actionSlug, vars, tailVisible);
      if (tailVars === null) {
        logger.info(
          `[SCRIPT-CMD] tail transferência omitida — sem declaração na etapa ticket=${ticket.id}`
        );
        continue;
      }
      executedCommands.push({ kind: "action", slug: tailSlug });
      try {
        const actionResult = await executeSmartAction(actionSlug, prompt, ticket, contact, tailVars, {
          smartActionId: action.id,
          scriptSlug: tailSlug,
          attendanceFlowStep
        });
        if (actionResult.success) {
          const rmOk = sanitizeAgentCustomerVisibleText(
            String(actionResult.message || action.responseMessage || "").trim()
          );
          if (rmOk) {
            await sendLineText(verifyMessage, wbot, msg, ticket, contact, ticketTraking, rmOk);
          }
        } else {
          const rmFail = sanitizeAgentCustomerVisibleText(
            String(action.responseMessage || actionResult.message || "").trim()
          );
          if (rmFail) {
            await sendLineText(verifyMessage, wbot, msg, ticket, contact, ticketTraking, rmFail);
          }
        }
      } catch (e) {
        logger.error(`[SCRIPT-CMD] tail ação transfer slug=${tailSlug}`, e);
      }
      continue;
    }

    executedCommands.push({ kind: "action", slug: tailSlug });
    try {
      const actionResult = await executeSmartAction(actionSlug, prompt, ticket, contact, vars, {
        smartActionId: action.id,
        scriptSlug: tailSlug,
        attendanceFlowStep
      });
      const isSilentCrm =
        actionSlug === "criarLead" ||
        actionSlug === "criarAtividade" ||
        actionSlug === "criarContato";
      if (actionResult.success && !isSilentCrm) {
        const rm = sanitizeAgentCustomerVisibleText(
          String(actionResult.message || action.responseMessage || "").trim()
        );
        if (rm) {
          await sendLineText(verifyMessage, wbot, msg, ticket, contact, ticketTraking, rm);
        }
      }
    } catch (e) {
      logger.error(`[SCRIPT-CMD] tail ação slug=${tailSlug}`, e);
    }
  }

  // Garante #slug do passo inteiro (inclui trechos após EXEMPLO/RESPOSTA que o slice inicial cortou).
  const haveMediaSlug = new Set(
    executedCommands.filter((c) => c.kind === "media").map((c) => String(c.slug || "").toLowerCase())
  );
  for (const mediaSlug of extractHashMediaSlugsFromScriptBlock(String(stepText || ""))) {
    if (haveMediaSlug.has(String(mediaSlug).toLowerCase())) continue;
    const sent = await resolveAndSendScriptMedia(
      mediaMap,
      mediaSlug,
      verifyMediaMessage,
      wbot,
      msg,
      ticket,
      contact,
      ticketTraking,
      companyId,
      verifyMessage,
      executedCommands
    );
    if (sent) {
      haveMediaSlug.add(String(mediaSlug).toLowerCase());
    } else {
      logger.info(`[SCRIPT-CMD] #${mediaSlug} no passo sem mídia cadastrada (recovery)`);
    }
  }

  const list = parseAttachments(stepAttachments);
  for (const att of list) {
    const url = String(att?.url || "").trim();
    if (!url) continue;
    const pseudo: MediaEntry = {
      slug: String(att?.slug || att?.originalName || "attachment").slice(0, 80),
      fileUrl: url,
      name: String(att?.originalName || "").trim() || undefined,
      caption: String(att?.caption || "").trim() || undefined
    };
    try {
      await sendOneMedia(
        verifyMediaMessage,
        wbot,
        msg,
        ticket,
        contact,
        ticketTraking,
        companyId,
        pseudo,
        verifyMessage
      );
    } catch (e) {
      logger.error(`[SCRIPT-CMD] anexo passo falhou`, e);
    }
  }

  return { executedCommands, deferredActions };
}
