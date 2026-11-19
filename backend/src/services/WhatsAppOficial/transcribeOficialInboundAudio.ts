import fs from "fs";
import path from "path";
import OpenAI from "openai";
import logger from "../../utils/logger";

/**
 * Transcreve áudio inbound da Cloud API (igual Whisper no Baileys handleOpenAi).
 * Retorna texto vazio se não houver arquivo/API key ou se a transcrição falhar.
 */
export async function transcribeOficialInboundAudio(params: {
  companyId: number;
  fileName: string;
  apiKey?: string | null;
  ticketId?: number;
}): Promise<string> {
  const fileName = String(params.fileName || "").trim();
  const apiKey = String(params.apiKey || "").trim();
  if (!fileName || !apiKey) return "";

  const fullPath = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "public",
    `company${params.companyId}`,
    fileName
  );
  if (!fs.existsSync(fullPath)) {
    logger.warn(
      `[WA-OFICIAL-AGENT] áudio não encontrado p/ whisper ticket=${params.ticketId || "?"} path=${fullPath}`
    );
    return "";
  }

  try {
    const openai = new OpenAI({ apiKey });
    const file = fs.createReadStream(fullPath) as any;
    const transcription = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file
    });
    const text = String((transcription as any)?.text || "").trim();
    if (text) {
      logger.info(
        `[WA-OFICIAL-AGENT] whisper ok ticket=${params.ticketId || "?"} chars=${text.length}`
      );
    }
    return text;
  } catch (e: any) {
    logger.warn(
      `[WA-OFICIAL-AGENT] whisper falhou ticket=${params.ticketId || "?"}: ${
        e?.message || e
      }`
    );
    return "";
  }
}
