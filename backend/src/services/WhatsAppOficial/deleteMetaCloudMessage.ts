import axios from "axios";
import Whatsapp from "../../models/Whatsapp";
import { getMetaAccessToken, sanitizeMetaToken } from "./metaWhatsAppAuth";
import logger from "../../utils/logger";

export interface DeleteMetaCloudMessageResult {
  /** Meta aceitou a requisição de remoção remota (raro / futuro). */
  remoteDeleted: boolean;
  /** Soft-delete no CRM é sempre seguro para API oficial. */
  allowLocalDelete: boolean;
  detail?: string;
}

/**
 * Tenta remover uma mensagem enviada via Cloud API.
 *
 * A Graph API pública da Meta (Cloud API) não documenta "delete for everyone"
 * para mensagens enviadas pelo CRM — só webhooks de revoke (coexistência / app).
 * Tentamos os formatos mais próximos do contrato de status (como `read`);
 * se a Meta rejeitar, o chamador ainda pode marcar `isDeleted` no CRM.
 */
export const deleteMetaCloudMessage = async (
  whatsapp: Whatsapp,
  wamid: string
): Promise<DeleteMetaCloudMessageResult> => {
  const token = sanitizeMetaToken(getMetaAccessToken(whatsapp));
  const phoneNumberId = String(whatsapp.phone_number_id || "").trim();
  const messageId = String(wamid || "").trim();

  if (!messageId) {
    return {
      remoteDeleted: false,
      allowLocalDelete: true,
      detail: "Mensagem sem wamid; exclusão apenas no CRM."
    };
  }

  if (!token || !phoneNumberId) {
    return {
      remoteDeleted: false,
      allowLocalDelete: true,
      detail: "Token ou phone_number_id ausente; exclusão apenas no CRM."
    };
  }

  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  // 1) Espelha o contrato de mark-as-read com status de remoção (se a Meta passar a aceitar).
  try {
    const res = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        status: "deleted",
        message_id: messageId
      },
      { headers, timeout: 15000, validateStatus: () => true }
    );

    if (res.status >= 200 && res.status < 300 && res.data?.success !== false) {
      logger.info(`[WABA] delete remote ok wamid=${messageId}`);
      return {
        remoteDeleted: true,
        allowLocalDelete: true,
        detail: "Meta aceitou status=deleted"
      };
    }

    const errMsg =
      res.data?.error?.message ||
      res.data?.error?.error_user_msg ||
      `HTTP ${res.status}`;
    logger.warn(
      `[WABA] delete status=deleted rejeitado wamid=${messageId}: ${errMsg}`
    );
  } catch (err: any) {
    const msg = err?.response?.data?.error?.message || err?.message;
    logger.warn(`[WABA] delete status=deleted erro wamid=${messageId}: ${msg}`);
  }

  // 2) Fallback: DELETE no wamid (não documentado; alguns BSPs espelham isso).
  try {
    const res = await axios.delete(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(messageId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { phone_number_id: phoneNumberId },
        timeout: 15000,
        validateStatus: () => true
      }
    );

    if (res.status >= 200 && res.status < 300) {
      logger.info(`[WABA] delete DELETE wamid ok wamid=${messageId}`);
      return {
        remoteDeleted: true,
        allowLocalDelete: true,
        detail: "Meta aceitou DELETE no wamid"
      };
    }

    logger.warn(
      `[WABA] delete DELETE wamid rejeitado wamid=${messageId}: HTTP ${res.status}`
    );
  } catch (err: any) {
    const msg = err?.response?.data?.error?.message || err?.message;
    logger.warn(`[WABA] delete DELETE wamid erro wamid=${messageId}: ${msg}`);
  }

  // Cloud API: remoção no aparelho do cliente não é suportada publicamente.
  // Soft-delete no CRM é a exclusão legítima disponível para o canal oficial.
  return {
    remoteDeleted: false,
    allowLocalDelete: true,
    detail:
      "Meta Cloud API não expõe apagar-para-todos; mensagem marcada como excluída no CRM."
  };
};
