/**
 * Classifica o tipo de payload Baileys/WhatsApp a partir do MIME (e extensão se octet-stream).
 * Mantido puro (sem ffmpeg/baileys) para testes e para o envio do roteiro preservar o formato.
 */
import mime from "mime-types";

const DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.oasis.opendocument.graphics",
  "application/rtf",
  "text/plain",
  "text/csv",
  "text/html",
  "text/xml",
  "application/xml",
  "application/json",
  "application/ofx",
  "application/vnd.ms-outlook",
  "application/vnd.apple.keynote",
  "application/vnd.apple.numbers",
  "application/vnd.apple.pages",
  "application/x-msdownload",
  "application/x-executable",
  "application/acad",
  "application/x-pkcs12",
  "application/x-ret",
  "application/zip",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
  "application/x-tar",
  "application/gzip",
  "application/x-bzip2"
]);

function classifyMime(mimetype: string): string {
  const mt = String(mimetype || "").toLowerCase().trim();
  if (!mt) return "document";
  if (mt === "audio/webm") return "audio";
  if (DOCUMENT_MIME_TYPES.has(mt)) return "document";
  const major = mt.split("/")[0];
  if (major === "text" || major === "application") return "document";
  if (major === "image" || major === "video" || major === "audio") return major;
  return "document";
}

/** Expõe a classificação de mídia usada no envio WhatsApp (roteiro / getMessageOptions). */
export function resolveWhatsAppMediaKindFromMime(mimetype: string, fileName?: string): string {
  let mimeType = String(mimetype || "").trim().toLowerCase();
  if (!mimeType || mimeType === "application/octet-stream") {
    const detected = fileName ? mime.lookup(fileName) : false;
    if (detected) mimeType = String(detected).toLowerCase();
  }
  if (!mimeType) return "document";
  return classifyMime(mimeType);
}
