import fs from "fs";
import path from "path";
import FormData from "form-data";
import axios from "axios";
import mime from "mime-types";
import Whatsapp from "../../models/Whatsapp";
import { getMetaAccessToken } from "./metaWhatsAppAuth";
import logger from "../../utils/logger";

export interface UploadedMetaMedia {
  id: string;
}

/**
 * Upload de mídia para a Graph API (Cloud API direta).
 * Meta exige: messaging_product, file (com filename + contentType) e type (MIME).
 */
export const uploadMetaCloudMedia = async (
  whatsapp: Whatsapp,
  filePath: string,
  mimeType: string,
  originalFileName?: string
): Promise<UploadedMetaMedia> => {
  const token = getMetaAccessToken(whatsapp);
  const phoneNumberId = whatsapp.phone_number_id;

  if (!token || !phoneNumberId) {
    throw new Error("Token ou phone_number_id ausente na conexão oficial.");
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }

  const filename =
    String(originalFileName || path.basename(filePath) || "file.bin")
      .replace(/[^\w.\-() ]+/g, "_")
      .slice(0, 200) || "file.bin";

  const resolvedMime = (() => {
    const raw = String(mimeType || "application/octet-stream").trim();
    if (raw && raw !== "application/octet-stream") return raw;
    const fromName = mime.lookup(filename);
    if (fromName) return String(fromName);
    if (/\.pdf$/i.test(filename) || /\.pdf$/i.test(filePath)) {
      return "application/pdf";
    }
    return raw || "application/octet-stream";
  })();

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", resolvedMime);
  form.append("file", fs.createReadStream(filePath), {
    filename,
    contentType: resolvedMime,
    knownLength: fs.statSync(filePath).size
  });

  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/media`;
  try {
    const response = await axios.post(url, form, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...form.getHeaders()
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 120000
    });

    const mediaId = response.data?.id;
    if (!mediaId) {
      throw new Error(
        `Meta não retornou id de mídia. Resposta: ${JSON.stringify(response.data)}`
      );
    }
    logger.info(
      `[WABA] media upload ok id=${mediaId} file=${filename} mime=${resolvedMime}`
    );
    return { id: mediaId };
  } catch (err: any) {
    const metaErr = err?.response?.data?.error;
    const detail =
      metaErr?.message ||
      err?.message ||
      JSON.stringify(err?.response?.data || {});
    logger.error(
      `[WABA] media upload falhou file=${filename} mime=${resolvedMime}: ${detail}`
    );
    throw new Error(`Falha upload mídia Meta: ${detail}`);
  }
};
