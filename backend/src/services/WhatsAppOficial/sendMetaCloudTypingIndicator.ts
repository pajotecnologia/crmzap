import axios from "axios";
import Whatsapp from "../../models/Whatsapp";
import { getMetaAccessToken, sanitizeMetaToken } from "./metaWhatsAppAuth";
import logger from "../../utils/logger";

/**
 * Exibe "digitando…" no WhatsApp do contato (Cloud API).
 * Requer o wamid da última mensagem inbound do usuário.
 * Some automaticamente ao enviar a resposta ou após ~25s.
 *
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/typing-indicators/
 */
export async function sendMetaCloudTypingIndicator(params: {
  whatsapp: Whatsapp;
  messageId: string;
}): Promise<boolean> {
  const token = sanitizeMetaToken(getMetaAccessToken(params.whatsapp));
  const phoneNumberId = params.whatsapp.phone_number_id;
  const messageId = String(params.messageId || "").trim();

  if (!token || !phoneNumberId || !messageId) {
    return false;
  }

  try {
    const res = await axios.post(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
        typing_indicator: {
          type: "text"
        }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );
    const ok = res.data?.success === true;
    if (ok) {
      logger.info(
        `[WABA] typing_indicator ok phone=${phoneNumberId} wid=${messageId.slice(0, 24)}…`
      );
    }
    return ok;
  } catch (err: any) {
    const msg = err?.response?.data?.error?.message || err?.message;
    logger.warn(`[WABA] typing_indicator falhou wid=${messageId}: ${msg}`);
    return false;
  }
}

/** Atualiza markMetaCloudMessageRead para também poder disparar typing. */
export async function markMetaCloudMessageReadWithTyping(
  whatsapp: Whatsapp,
  messageId: string,
  withTyping: boolean
): Promise<void> {
  if (withTyping) {
    await sendMetaCloudTypingIndicator({ whatsapp, messageId });
    return;
  }
  const { markMetaCloudMessageRead } = await import("./markMetaCloudMessageRead");
  await markMetaCloudMessageRead(whatsapp, messageId);
}
