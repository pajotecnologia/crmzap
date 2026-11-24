import { WAMessage, AnyMessageContent } from "baileys";
import * as Sentry from "@sentry/node";
import fs, { unlinkSync } from "fs";

import path from "path";
import { execFileSync, execFile } from "child_process";
import { promisify } from "util";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

import AppError from "../../errors/AppError";
import Ticket from "../../models/Ticket";
import mime from "mime-types";
import Contact from "../../models/Contact";
import { getWbot, Session } from "../../libs/wbot";
import CreateMessageService from "../MessageServices/CreateMessageService";
import formatBody from "../../helpers/Mustache";
import logger from "../../utils/logger";
import { ENABLE_LID_DEBUG } from "../../config/debug";
import { normalizeJid } from "../../utils";
import { getJidOf } from "./getJidOf";
import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import EnsureTicketWhatsApp from "../../helpers/EnsureTicketWhatsApp";
import { resolveWhatsAppMediaKindFromMime } from "../../helpers/whatsAppMediaKind";

export { resolveWhatsAppMediaKindFromMime };

const execFileAsync = promisify(execFile);

const resolveFfmpegPath = (): string => {
  const candidates: Array<string | undefined | null> = [
    process.env.FFMPEG_PATH,
    "ffmpeg",
    typeof ffmpegInstaller?.path === "string" ? ffmpegInstaller.path : null,
    typeof ffmpegStatic === "string" ? ffmpegStatic : null
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (candidate === "ffmpeg") {
        execFileSync("ffmpeg", ["-version"], {
          stdio: "ignore",
          timeout: 5000
        });
        return "ffmpeg";
      }
      if (fs.existsSync(candidate)) {
        try {
          fs.accessSync(candidate, fs.constants.X_OK);
        } catch {
          try {
            fs.chmodSync(candidate, 0o755);
          } catch {
            /* ignore */
          }
        }
        execFileSync(candidate, ["-version"], {
          stdio: "ignore",
          timeout: 5000
        });
        return candidate;
      }
    } catch {
      /* try next */
    }
  }

  throw new Error(
    "ffmpeg indisponível. Instale ffmpeg no servidor ou configure FFMPEG_PATH."
  );
};

let cachedFfmpegPath: string | null = null;
const getFfmpegBinary = (): string => {
  if (!cachedFfmpegPath) {
    cachedFfmpegPath = resolveFfmpegPath();
    ffmpeg.setFfmpegPath(cachedFfmpegPath);
    logger.info(`ffmpeg resolvido: ${cachedFfmpegPath}`);
  }
  return cachedFfmpegPath;
};

try {
  getFfmpegBinary();
} catch (e) {
  logger.warn({ e }, "Falha ao configurar ffmpeg no boot; tentará no envio de áudio");
}

/**
 * Sempre gera OGG/Opus PTT válido para Baileys.
 * Não confiar em extensão .ogg (frontend já enviou MP3 com nome .ogg).
 */
const convertToOggOpus = async (inputFile: string): Promise<string> => {
  const ffmpegBin = getFfmpegBinary();
  const parsed = path.parse(inputFile);
  const outputFile = path.join(parsed.dir, `${parsed.name}-${Date.now()}.ogg`);

  const runFluent = (): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      ffmpeg.setFfmpegPath(ffmpegBin);
      ffmpeg(inputFile)
        .noVideo()
        .audioChannels(1)
        .audioFrequency(16000)
        .audioCodec("libopus")
        .audioBitrate("32k")
        .outputOptions([
          "-application",
          "voip",
          "-frame_duration",
          "20",
          "-vbr",
          "off",
          "-avoid_negative_ts",
          "make_zero"
        ])
        .format("ogg")
        .on("end", () => resolve())
        .on("error", err => reject(err))
        .save(outputFile);
    });

  try {
    await runFluent();
  } catch (fluentErr) {
    logger.warn(
      { err: fluentErr },
      "fluent-ffmpeg falhou na conversão; tentando execFile direto"
    );
    try {
      if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
    } catch {
      /* ignore */
    }
    await execFileAsync(
      ffmpegBin,
      [
        "-y",
        "-i",
        inputFile,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "libopus",
        "-b:a",
        "32k",
        "-application",
        "voip",
        "-frame_duration",
        "20",
        "-vbr",
        "off",
        "-f",
        "ogg",
        outputFile
      ],
      { timeout: 60000 }
    );
  }

  if (!fs.existsSync(outputFile) || fs.statSync(outputFile).size < 100) {
    throw new Error(`Conversão OGG/Opus falhou para ${inputFile}`);
  }

  return outputFile;
};

const prepareWhatsAppVoiceNote = async (
  pathMedia: string
): Promise<{ audioPath: string; cleanupPath: string | null }> => {
  // Sempre converter: extensão .ogg pode ser MP3 renomeado (bug antigo do frontend)
  const audioPath = await convertToOggOpus(pathMedia);
  return {
    audioPath,
    cleanupPath: audioPath !== pathMedia ? audioPath : null
  };
};

const getMediaTypeFromMimeType = (mimetype: string): string => {
  return resolveWhatsAppMediaKindFromMime(mimetype);
};

interface Request {
  media: Express.Multer.File;
  ticket: Ticket;
  companyId?: number;
  body?: string;
  isPrivate?: boolean;
  isForwarded?: boolean;
}

const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");

// ✅ CORREÇÃO: Função de conversão de áudio otimizada

export const convertAudioToOgg = async (
  inputPath: string,
  companyId: number
): Promise<string> => {
  const converted = await convertToOggOpus(inputPath);
  const newMediaFileName = `${new Date().getTime()}.ogg`;
  const outputFile = path.join(
    publicFolder,
    `company${companyId}`,
    newMediaFileName
  );

  const outDir = path.dirname(outputFile);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  if (converted !== outputFile) {
    fs.copyFileSync(converted, outputFile);
    if (converted !== inputPath && fs.existsSync(converted)) {
      try {
        fs.unlinkSync(converted);
      } catch {
        /* ignore */
      }
    }
  }

  return outputFile;
};

// ✅ Função para converter PNG/WebP para JPG usando ffmpeg
export const convertPngToJpg = async (
  inputPath: string,
  companyId: number
): Promise<Buffer> => {
  try {
    console.log("🔄 Convertendo imagem para JPG:", inputPath);

    const outputPath = path.join(
      publicFolder,
      `company${companyId}`,
      `temp_${new Date().getTime()}.jpg`
    );

    // Usar ffmpeg para converter qualquer formato de imagem para JPG
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputFormat('mjpeg')
        .outputOptions('-q:v', '2') // Qualidade alta
        .on('end', () => {
          console.log("✅ Conversão para JPG concluída");
          resolve();
        })
        .on('error', (err) => {
          console.error("❌ Erro na conversão para JPG:", err);
          reject(err);
        })
        .save(outputPath);
    });

    // Ler o arquivo JPG convertido
    const imageBuffer = fs.readFileSync(outputPath);

    // Limpar arquivo temporário
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    console.log("✅ Conversão concluída e buffer retornado");
    return imageBuffer;
  } catch (error) {
    console.error("❌ Erro na conversão para JPG:", error);
    throw error;
  }
};

export const getMessageOptions = async (
  fileName: string,
  pathMedia: string,
  companyId: string,
  body: string = " "
): Promise<any> => {
  const lookedUp = mime.lookup(pathMedia) || mime.lookup(fileName);
  let mimeType = lookedUp ? String(lookedUp) : "";
  // Fallback por extensão quando o lookup falha (nome sem extensão no path, etc.)
  if (!mimeType) {
    const lower = `${fileName} ${pathMedia}`.toLowerCase();
    if (lower.includes(".pdf")) mimeType = "application/pdf";
    else if (/\.(jpe?g)(\b|$)/i.test(lower)) mimeType = "image/jpeg";
    else if (lower.includes(".png")) mimeType = "image/png";
    else if (lower.includes(".webp")) mimeType = "image/webp";
    else if (lower.includes(".mp4")) mimeType = "video/mp4";
    else if (/\.(mp3|mpeg)(\b|$)/i.test(lower)) mimeType = "audio/mpeg";
    else if (lower.includes(".ogg")) mimeType = "audio/ogg";
    else if (lower.includes(".docx"))
      mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  const typeMessage = mimeType
    ? resolveWhatsAppMediaKindFromMime(mimeType, fileName || pathMedia)
    : "document";

  console.log("🔍 Processando mídia:", {
    fileName,
    pathMedia,
    mimeType,
    typeMessage
  });

  try {
    // Sem MIME conhecido: ainda envia como documento (PDF/arquivos genéricos).
    const effectiveMime = mimeType || "application/octet-stream";
    const effectiveType = mimeType ? typeMessage : "document";

    let options: AnyMessageContent;
    const caption = body && String(body).trim() ? body : null;

    if (effectiveType === "video") {
      options = {
        video: fs.readFileSync(pathMedia),
        caption,
        fileName: fileName
      };
    } else if (effectiveType === "audio") {
      // Sempre converter para OGG/Opus — não confiar em extensão
      console.log("🔄 Convertendo áudio para OGG/Opus (PTT)...");
      const audioPath = await convertAudioToOgg(pathMedia, +companyId);

      options = {
        audio: fs.readFileSync(audioPath),
        mimetype: "audio/ogg; codecs=opus",
        ptt: true
      };

      if (audioPath !== pathMedia && fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
    } else if (effectiveType === "document" || effectiveType === "application") {
      options = {
        document: fs.readFileSync(pathMedia),
        caption,
        fileName: fileName,
        mimetype: effectiveMime
      };
    } else if (effectiveType === "image") {
      options = {
        image: fs.readFileSync(pathMedia),
        caption
      };
    } else {
      // Fallback: preserva como documento com MIME original (não força imagem).
      options = {
        document: fs.readFileSync(pathMedia),
        caption,
        fileName: fileName,
        mimetype: effectiveMime
      };
    }

    return options;
  } catch (e) {
    Sentry.captureException(e);
    console.error("❌ Erro ao processar mídia:", e);
    return null;
  }
};

const SendWhatsAppMedia = async ({
  media,
  ticket,
  body = "",
  isPrivate = false,
  isForwarded = false
}: Request): Promise<WAMessage> => {
  try {
    await EnsureTicketWhatsApp(ticket);

    if (ticket && !ticket.contact && ticket.contactId) {
      const contact = await Contact.findByPk(ticket.contactId);
      if (contact) {
        ticket.contact = contact;
      }
    }

    let wbot: Session;
    try {
      wbot = await getWbot(ticket.whatsappId);
    } catch (err) {
      if (err instanceof AppError && err.message === "ERR_WAPP_NOT_INITIALIZED") {
        console.log("⚠️ WhatsApp do ticket não inicializado, tentando conexão padrão...");
        const defaultWapp = await GetDefaultWhatsApp(ticket.companyId);
        wbot = await getWbot(defaultWapp.id);
        await ticket.update({ whatsappId: defaultWapp.id });
      } else {
        throw err;
      }
    }
    const companyId = ticket.companyId.toString();

    // ✅ CORREÇÃO: Garantir que body é sempre uma string válida
    const safeBody = body || "";

    // Preferir caminho absoluto do multer quando o arquivo já existe
    let pathMedia = media.path;
    if (!pathMedia || !fs.existsSync(pathMedia)) {
      if (media.path?.startsWith("/") && !media.path.includes("public")) {
        pathMedia = path.join(publicFolder, media.path);
      } else if (media.path?.includes("public")) {
        pathMedia = media.path;
      } else if (media.path?.startsWith("company")) {
        pathMedia = path.join(publicFolder, media.path);
      } else if (media.filename) {
        pathMedia = path.join(
          publicFolder,
          `company${ticket.companyId}`,
          media.filename
        );
      } else {
        pathMedia = path.join(publicFolder, media.path || "");
      }
    }

    // Debug: verificar se o arquivo existe
    console.log("🔍 Verificando arquivo de mídia:", {
      originalPath: media.path,
      publicFolder,
      fullPath: pathMedia,
      exists: fs.existsSync(pathMedia)
    });

    if (!fs.existsSync(pathMedia)) {
      throw new Error(`Arquivo de mídia não encontrado: ${pathMedia}`);
    }

    // ✅ CORREÇÃO: Detectar mimetype correto pela extensão se vier como octet-stream
    let realMimetype = media.mimetype;
    if (media.mimetype === "application/octet-stream") {
      const detectedMime = mime.lookup(pathMedia);
      if (detectedMime) {
        realMimetype = detectedMime;
        console.log("🔄 Mimetype corrigido:", { original: media.mimetype, detected: realMimetype });
      }
    }
    const typeMessage = realMimetype.split("/")[0];

    let options: AnyMessageContent;
    let bodyTicket = "";
    const bodyMedia = ticket ? formatBody(safeBody, ticket) : safeBody;

    console.log("📤 Enviando mídia:", {
      originalname: media.originalname,
      mimetype: realMimetype,
      typeMessage,
      pathMedia
    });

    if (typeMessage === "video") {
      options = {
        video: fs.readFileSync(pathMedia),
        caption: bodyMedia,
        fileName: media.originalname.replace("/", "-"),
        contextInfo: {
          forwardingScore: isForwarded ? 2 : 0,
          isForwarded: isForwarded
        }
      };
      bodyTicket = "🎥 Arquivo de vídeo";
    } else if (typeMessage === "audio" || realMimetype.includes("audio")) {
      console.log("🔄 Convertendo áudio para OGG/Opus (PTT WhatsApp)...");
      const { audioPath, cleanupPath } = await prepareWhatsAppVoiceNote(pathMedia);
      const audioBuffer = fs.readFileSync(audioPath);

      // Mantém OGG permanente para o player do ticket (além do envio PTT)
      const permanentName = `audio_${Date.now()}.ogg`;
      const permanentPath = path.join(path.dirname(pathMedia), permanentName);
      try {
        if (audioPath !== permanentPath) {
          fs.copyFileSync(audioPath, permanentPath);
        }
        media.filename = permanentName;
        if (pathMedia !== permanentPath && fs.existsSync(pathMedia)) {
          try {
            fs.unlinkSync(pathMedia);
          } catch {
            /* ignore */
          }
        }
      } catch (persistErr) {
        logger.warn({ persistErr }, "Falha ao persistir OGG para playback; mantendo original");
      }

      if (
        cleanupPath &&
        cleanupPath !== permanentPath &&
        fs.existsSync(cleanupPath)
      ) {
        try {
          fs.unlinkSync(cleanupPath);
        } catch {
          /* ignore */
        }
      }

      options = {
        audio: audioBuffer,
        mimetype: "audio/ogg; codecs=opus",
        ptt: true,
        contextInfo: {
          forwardingScore: isForwarded ? 2 : 0,
          isForwarded: isForwarded
        }
      };

      bodyTicket = bodyMedia || "🎵 Mensagem de voz";
    } else if (typeMessage === "document" || typeMessage === "text") {
      options = {
        document: fs.readFileSync(pathMedia),
        caption: bodyMedia,
        fileName: media.originalname.replace("/", "-"),
        mimetype: realMimetype,
        contextInfo: {
          forwardingScore: isForwarded ? 2 : 0,
          isForwarded: isForwarded
        }
      };
      bodyTicket = "📂 Documento";
    } else if (typeMessage === "application") {
      options = {
        document: fs.readFileSync(pathMedia),
        caption: bodyMedia,
        fileName: media.originalname.replace("/", "-"),
        mimetype: realMimetype,
        contextInfo: {
          forwardingScore: isForwarded ? 2 : 0,
          isForwarded: isForwarded
        }
      };
      bodyTicket = "📎 Outros anexos";
    } else {
      if (realMimetype.includes("gif")) {
        options = {
          image: fs.readFileSync(pathMedia),
          caption: bodyMedia,
          mimetype: "image/gif",
          contextInfo: {
            forwardingScore: isForwarded ? 2 : 0,
            isForwarded: isForwarded
          },
          gifPlayback: true
        };
      } else {
        if (realMimetype.includes("png") || realMimetype.includes("webp")) {
          // ✅ Converter PNG/WebP para JPG antes de enviar
          console.log("🔄 Detectado arquivo PNG/WebP, convertendo para JPG...");
          const imageBuffer = await convertPngToJpg(pathMedia, ticket.companyId);
          options = {
            image: imageBuffer,
            caption: bodyMedia,
            contextInfo: {
              forwardingScore: isForwarded ? 2 : 0,
              isForwarded: isForwarded
            }
          };
        } else {
          options = {
            image: fs.readFileSync(pathMedia),
            caption: bodyMedia,
            contextInfo: {
              forwardingScore: isForwarded ? 2 : 0,
              isForwarded: isForwarded
            }
          };
        }
      }
      bodyTicket = "🖼️ Imagem";
    }

    if (isPrivate === true) {
      const messageData = {
        // Várias mídias da mesma requisição rodam em paralelo; o wid precisa ser único por arquivo
        wid: `PVT${companyId}${ticket.id}-${Date.now()}-${media.filename || media.originalname}`,
        ticketId: ticket.id,
        contactId: undefined,
        body: bodyMedia,
        fromMe: true,
        mediaUrl: media.filename,
        mediaType: getMediaTypeFromMimeType(realMimetype),
        read: true,
        quotedMsgId: null,
        ack: 2,
        remoteJid: null,
        participant: null,
        dataJson: null,
        ticketTrakingId: null,
        isPrivate
      };

      await CreateMessageService({ messageData, companyId: ticket.companyId });
      return;
    }

    const contactNumber = await Contact.findByPk(ticket.contactId);
    if (contactNumber && !ticket.contact) {
      ticket.contact = contactNumber;
    }

    const targetJid = getJidOf(ticket.contact || ticket);
    const phoneDigits = String(contactNumber?.number || "").replace(/\D/g, "");
    const fallbackJid =
      phoneDigits.length >= 10 && phoneDigits.length <= 15
        ? normalizeJid(
            `${phoneDigits}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`
          )
        : null;

    let sentMessage: WAMessage;

    if (ticket.isGroup) {
      if (ENABLE_LID_DEBUG) {
        logger.info(`[LID-DEBUG] Media - Enviando mídia para grupo: ${targetJid}`);
      }

      try {
        sentMessage = await wbot.sendMessage(targetJid, options);
      } catch (err1) {
        if (err1.message && err1.message.includes("senderMessageKeys")) {
          sentMessage = await wbot.sendMessage(targetJid, options);
        } else {
          sentMessage = await wbot.sendMessage(targetJid, options);
        }
      }
    } else {
      try {
        sentMessage = await wbot.sendMessage(targetJid, options);
      } catch (firstErr) {
        if (fallbackJid && fallbackJid !== targetJid) {
          logger.warn(
            `[SEND] Falha em ${targetJid}, tentando fallback ${fallbackJid}:`,
            firstErr
          );
          sentMessage = await wbot.sendMessage(fallbackJid, options);
        } else {
          throw firstErr;
        }
      }
    }

    try {
      wbot.store(sentMessage);
    } catch (storeErr) {
      logger.warn({ storeErr }, "Falha ao cachear mensagem enviada (store)");
    }

    try {
      const messageData = {
        wid: sentMessage.key.id,
        ticketId: ticket.id,
        contactId: ticket.contactId,
        body: bodyMedia || bodyTicket,
        fromMe: true,
        mediaType: typeMessage,
        mediaUrl: media.filename,
        read: true,
        quotedMsgId: null,
        ack: 2,
        remoteJid: contactNumber?.remoteJid || null,
        dataJson: JSON.stringify(sentMessage),
      };

      await CreateMessageService({ messageData, companyId: ticket.companyId });
    } catch (persistErr) {
      // Mensagem já foi ao WhatsApp — não mascarar como falha de conexão
      logger.error(
        { persistErr, ticketId: ticket.id },
        "Mídia enviada ao WhatsApp, mas falhou ao gravar no banco"
      );
    }

    await ticket.update({
      lastMessage: safeBody !== media.filename ? safeBody : bodyMedia,
      imported: null
    });

    return sentMessage;
  } catch (err) {
    console.error(
      `❌ ERRO AO ENVIAR MÍDIA ${ticket.id} media ${media?.originalname || 'desconhecido'}:`,
      err
    );
    Sentry.captureException(err);

    if (err instanceof AppError) {
      throw err;
    }

    const detail = err instanceof Error ? err.message : String(err);
    logger.error({ detail }, "Detalhe do erro de envio de mídia WhatsApp");

    throw new AppError("ERR_SENDING_WAPP_MSG");
  }
};

export default SendWhatsAppMedia;
