import fs from "fs";
import os from "os";
import path from "path";
import { proto } from "baileys";
import Ticket from "../models/Ticket";
import Contact from "../models/Contact";
import TicketTraking from "../models/TicketTraking";
import logger from "../utils/logger";
import { getMessageOptions } from "../services/WbotServices/SendWhatsAppMedia";

type SessionLike = {
  sendMessage: (jid: string, content: any) => Promise<any>;
};

function parseDataUrl(dataUrl: string): { buffer: Buffer; ext: string; mime: string } | null {
  const m = String(dataUrl || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const ext = mime.includes("png")
    ? "png"
    : mime.includes("webp")
      ? "webp"
      : mime.includes("gif")
        ? "gif"
        : "jpg";
  try {
    return { buffer: Buffer.from(m[2], "base64"), ext, mime };
  } catch {
    return null;
  }
}

/**
 * Envia imagens (data URL / http) e documento opcional após a resposta de inventário.
 */
export async function sendInventoryReplyMedia(params: {
  wbot: SessionLike;
  msg: proto.IWebMessageInfo;
  ticket: Ticket;
  contact: Contact;
  ticketTraking?: TicketTraking;
  verifyMediaMessage: (...args: any[]) => Promise<any>;
  images: string[];
  documentUrl?: string;
  documentName?: string;
}): Promise<number> {
  const jid = String(params.msg?.key?.remoteJid || "").trim();
  if (!jid) return 0;
  let sent = 0;
  const tmpFiles: string[] = [];

  try {
    for (const src of (params.images || []).slice(0, 6)) {
      const url = String(src || "").trim();
      if (!url) continue;
      try {
        if (url.startsWith("data:image")) {
          const parsed = parseDataUrl(url);
          if (!parsed) continue;
          const tmp = path.join(
            os.tmpdir(),
            `inv-${params.ticket.id}-${Date.now()}-${sent}.${parsed.ext}`
          );
          fs.writeFileSync(tmp, parsed.buffer);
          tmpFiles.push(tmp);
          const mediaMsg = await params.wbot.sendMessage(jid, {
            image: parsed.buffer,
            mimetype: parsed.mime,
            caption: " "
          });
          await params.verifyMediaMessage(
            mediaMsg,
            params.ticket,
            params.contact,
            params.ticketTraking,
            false,
            false,
            params.wbot,
            true
          );
          sent += 1;
        } else if (/^https?:\/\//i.test(url)) {
          const mediaMsg = await params.wbot.sendMessage(jid, {
            image: { url },
            caption: " "
          });
          await params.verifyMediaMessage(
            mediaMsg,
            params.ticket,
            params.contact,
            params.ticketTraking,
            false,
            false,
            params.wbot,
            true
          );
          sent += 1;
        } else {
          const publicRoot = path.resolve(__dirname, "..", "..", "public");
          const rel = url.startsWith("/") ? url.slice(1) : url;
          const fullPath = path.join(publicRoot, rel);
          if (!fs.existsSync(fullPath)) continue;
          const fileName = path.basename(fullPath);
          const opts = await getMessageOptions(fileName, fullPath, String(params.ticket.companyId), " ");
          if (opts && Object.keys(opts).length) {
            const mediaMsg = await params.wbot.sendMessage(jid, { ...opts });
            await params.verifyMediaMessage(
              mediaMsg,
              params.ticket,
              params.contact,
              params.ticketTraking,
              false,
              false,
              params.wbot,
              true
            );
            sent += 1;
          }
        }
        await new Promise(r => setTimeout(r, 350));
      } catch (e) {
        logger.warn(`[INVENTORY-MEDIA] falha ao enviar imagem ticket=${params.ticket.id}`, e as any);
      }
    }

    const docUrl = String(params.documentUrl || "").trim();
    if (docUrl) {
      try {
        if (/^https?:\/\//i.test(docUrl)) {
          const name = String(params.documentName || "documento.pdf").slice(0, 120);
          const mediaMsg = await params.wbot.sendMessage(jid, {
            document: { url: docUrl },
            mimetype: "application/pdf",
            fileName: name
          });
          await params.verifyMediaMessage(
            mediaMsg,
            params.ticket,
            params.contact,
            params.ticketTraking,
            false,
            false,
            params.wbot,
            true
          );
          sent += 1;
        } else {
          const publicRoot = path.resolve(__dirname, "..", "..", "public");
          const rel = docUrl.startsWith("/") ? docUrl.slice(1) : docUrl;
          const fullPath = path.join(publicRoot, rel);
          if (fs.existsSync(fullPath)) {
            const fileName = String(params.documentName || path.basename(fullPath)).slice(0, 120);
            const opts = await getMessageOptions(
              fileName,
              fullPath,
              String(params.ticket.companyId),
              " "
            );
            if (opts && Object.keys(opts).length) {
              const mediaMsg = await params.wbot.sendMessage(jid, { ...opts });
              await params.verifyMediaMessage(
                mediaMsg,
                params.ticket,
                params.contact,
                params.ticketTraking,
                false,
                false,
                params.wbot,
                true
              );
              sent += 1;
            }
          }
        }
      } catch (e) {
        logger.warn(`[INVENTORY-MEDIA] falha ao enviar documento ticket=${params.ticket.id}`, e as any);
      }
    }
  } finally {
    for (const f of tmpFiles) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
  }

  return sent;
}

export default sendInventoryReplyMedia;
