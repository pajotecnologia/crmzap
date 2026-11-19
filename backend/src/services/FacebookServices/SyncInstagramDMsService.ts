import axios from "axios";
import { Op } from "sequelize";
import Whatsapp from "../../models/Whatsapp";
import logger from "../../utils/logger";
import { handleMessage } from "./facebookMessageListener";
import { INSTAGRAM_LOGIN_PROVIDER } from "./instagramLoginAPI";

const IG_GRAPH = "https://graph.instagram.com";
const IG_VERSION = "v21.0";
const FB_GRAPH = "https://graph.facebook.com";
const FB_VERSION = "v20.0";

type SyncResult = {
  ok: boolean;
  provider: string;
  conversations: number;
  imported: number;
  skipped: number;
  error?: string;
  needsInstagramLogin?: boolean;
};

const isIgLogin = (w: Whatsapp) =>
  String(w.provider || "") === INSTAGRAM_LOGIN_PROVIDER;

async function listIgLoginConversations(token: string, igUserId: string) {
  const base = `${IG_GRAPH}/${IG_VERSION}`;
  const tryUrls = [
    `${base}/${igUserId || "me"}/conversations`,
    `${base}/me/conversations`
  ];

  let lastError = "";
  for (const url of tryUrls) {
    try {
      const { data } = await axios.get(url, {
        params: {
          platform: "instagram",
          fields: "id,participants,updated_time",
          limit: 15,
          access_token: token
        },
        timeout: 30000
      });
      return Array.isArray(data?.data) ? data.data : [];
    } catch (err: any) {
      lastError =
        err?.response?.data?.error?.message || err?.message || "conversations_failed";
    }
  }
  throw new Error(lastError || "conversations_failed");
}

async function listPageIgConversations(token: string, pageOrIgId: string) {
  const { data } = await axios.get(
    `${FB_GRAPH}/${FB_VERSION}/${pageOrIgId}/conversations`,
    {
      params: {
        platform: "instagram",
        fields: "id,participants,updated_time",
        limit: 15,
        access_token: token
      },
      timeout: 30000
    }
  );
  return Array.isArray(data?.data) ? data.data : [];
}

async function listPageMessengerConversations(token: string, pageId: string) {
  const { data } = await axios.get(
    `${FB_GRAPH}/${FB_VERSION}/${pageId}/conversations`,
    {
      params: {
        platform: "messenger",
        fields: "id,participants,updated_time",
        limit: 15,
        access_token: token
      },
      timeout: 30000
    }
  );
  return Array.isArray(data?.data) ? data.data : [];
}

async function listMessageIds(
  conversationId: string,
  token: string,
  useIgHost: boolean
) {
  const host = useIgHost
    ? `${IG_GRAPH}/${IG_VERSION}`
    : `${FB_GRAPH}/${FB_VERSION}`;
  const { data } = await axios.get(`${host}/${conversationId}`, {
    params: {
      fields: "messages.limit(10){id,created_time}",
      access_token: token
    },
    timeout: 30000
  });
  return Array.isArray(data?.messages?.data) ? data.messages.data : [];
}

async function getMessageDetail(
  messageId: string,
  token: string,
  useIgHost: boolean
) {
  const host = useIgHost
    ? `${IG_GRAPH}/${IG_VERSION}`
    : `${FB_GRAPH}/${FB_VERSION}`;
  const { data } = await axios.get(`${host}/${messageId}`, {
    params: {
      fields: "id,created_time,from,to,message",
      access_token: token
    },
    timeout: 20000
  });
  return data;
}

function pickCustomerId(
  detail: any,
  businessId: string
): string | null {
  const fromId = String(detail?.from?.id || "").trim();
  if (fromId && fromId !== businessId) return fromId;

  const toData = detail?.to?.data;
  if (Array.isArray(toData)) {
    const other = toData.find((p: any) => String(p?.id || "") !== businessId);
    if (other?.id) return String(other.id);
  }
  return null;
}

/**
 * Importa DMs recentes do Instagram via Conversations API (backup do webhook).
 * Preferencialmente Instagram Login (instagram_business_manage_messages).
 */
export async function syncInstagramDirectMessages(
  whatsapp: Whatsapp
): Promise<SyncResult> {
  if (
    !whatsapp ||
    !["instagram", "facebook"].includes(String(whatsapp.channel || ""))
  ) {
    return {
      ok: false,
      provider: String(whatsapp?.provider || ""),
      conversations: 0,
      imported: 0,
      skipped: 0,
      error: "not_meta_channel"
    };
  }

  if (!whatsapp.importInstagramAccountMessages) {
    logger.info("[syncInstagramDMs] Importação desabilitada na conexão", {
      whatsappId: whatsapp.id,
      channel: whatsapp.channel
    });
    return {
      ok: true,
      provider: String(whatsapp.provider || ""),
      conversations: 0,
      imported: 0,
      skipped: 0,
      error: "import_disabled"
    };
  }

  const token = whatsapp.facebookUserToken;
  const igId = String(whatsapp.facebookPageUserId || "").trim();
  if (!token || !igId) {
    return {
      ok: false,
      provider: String(whatsapp.provider || ""),
      conversations: 0,
      imported: 0,
      skipped: 0,
      error: "missing_token_or_ig_id"
    };
  }

  const useIgHost = isIgLogin(whatsapp);
  const isFacebookChannel = String(whatsapp.channel || "") === "facebook";
  const handleChannel = isFacebookChannel ? "facebook" : "instagram";
  let conversations: any[] = [];

  try {
    if (isFacebookChannel) {
      conversations = await listPageMessengerConversations(token, igId);
    } else if (useIgHost) {
      conversations = await listIgLoginConversations(token, igId);
    } else {
      try {
        conversations = await listPageIgConversations(token, igId);
      } catch (err: any) {
        logger.warn("[syncInstagramDMs] Page/IG conversations falhou", {
          whatsappId: whatsapp.id,
          error: err?.response?.data || err?.message
        });
        return {
          ok: false,
          provider: String(whatsapp.provider || "facebook_login"),
          conversations: 0,
          imported: 0,
          skipped: 0,
          error:
            err?.response?.data?.error?.message ||
            err?.message ||
            "conversations_empty",
          needsInstagramLogin: true
        };
      }
    }
  } catch (err: any) {
    logger.error("[syncInstagramDMs] list conversations", {
      whatsappId: whatsapp.id,
      channel: whatsapp.channel,
      error: err?.response?.data || err?.message
    });
    return {
      ok: false,
      provider: String(whatsapp.provider || ""),
      conversations: 0,
      imported: 0,
      skipped: 0,
      error: err?.message || "list_failed",
      needsInstagramLogin: !useIgHost && !isFacebookChannel
    };
  }

  let imported = 0;
  let skipped = 0;

  for (const conv of conversations.slice(0, 12)) {
    const conversationId = String(conv?.id || "").trim();
    if (!conversationId) continue;

    let messageRefs: any[] = [];
    try {
      messageRefs = await listMessageIds(
        conversationId,
        token,
        useIgHost && !isFacebookChannel
      );
    } catch (err: any) {
      logger.warn("[syncInstagramDMs] list messages", {
        conversationId,
        error: err?.response?.data?.error?.message || err?.message
      });
      continue;
    }

    // Mais antigas primeiro para ordem natural no ticket.
    const ordered = [...messageRefs].reverse();

    for (const ref of ordered) {
      const mid = String(ref?.id || "").trim();
      if (!mid) continue;

      try {
        const detail = await getMessageDetail(
          mid,
          token,
          useIgHost && !isFacebookChannel
        );
        const text = String(detail?.message || "").trim();
        if (!text) {
          skipped += 1;
          continue;
        }

        const fromId = String(detail?.from?.id || "").trim();
        const isEcho = fromId === igId;
        const customerId = pickCustomerId(detail, igId);
        if (!customerId) {
          skipped += 1;
          continue;
        }

        const senderId = isEcho ? igId : customerId;
        const recipientId = isEcho ? customerId : igId;
        const ts = detail?.created_time
          ? Math.floor(new Date(detail.created_time).getTime() / 1000)
          : Math.floor(Date.now() / 1000);

        await handleMessage(
          whatsapp,
          {
            sender: { id: senderId },
            recipient: { id: recipientId },
            timestamp: ts,
            message: {
              mid,
              text,
              is_echo: isEcho
            }
          },
          handleChannel,
          whatsapp.companyId
        );
        imported += 1;
      } catch (err: any) {
        skipped += 1;
        logger.warn("[syncInstagramDMs] import message", {
          mid,
          error: err?.message || String(err)
        });
      }
    }
  }

  logger.info("[syncInstagramDMs] done", {
    whatsappId: whatsapp.id,
    channel: whatsapp.channel,
    provider: whatsapp.provider,
    conversations: conversations.length,
    imported,
    skipped
  });

  return {
    ok: true,
    provider: String(whatsapp.provider || ""),
    conversations: conversations.length,
    imported,
    skipped,
    needsInstagramLogin: !useIgHost && !isFacebookChannel && imported === 0
  };
}

export async function syncAllConnectedInstagramDMs(): Promise<void> {
  const rows = await Whatsapp.findAll({
    where: {
      channel: { [Op.in]: ["instagram", "facebook"] },
      status: "CONNECTED",
      importInstagramAccountMessages: true
    }
  });

  for (const row of rows) {
    try {
      await syncInstagramDirectMessages(row);
    } catch (err: any) {
      logger.warn("[syncInstagramDMs] connection failed", {
        whatsappId: row.id,
        error: err?.message
      });
    }
  }
}

export default syncInstagramDirectMessages;
