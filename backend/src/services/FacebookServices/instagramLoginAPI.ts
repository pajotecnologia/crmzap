import axios from "axios";
import logger from "../../utils/logger";
import {
  getInstagramAppId,
  getInstagramAppSecret,
  getMetaAppSecret
} from "../../helpers/getMetaAppCredentials";

const IG_GRAPH = "https://graph.instagram.com";
const IG_GRAPH_VERSION = "v21.0";

export const INSTAGRAM_LOGIN_PROVIDER = "instagram_login";

export const INSTAGRAM_LOGIN_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments"
].join(",");

/** client_id do Instagram Login — nunca usar FACEBOOK_APP_ID (Invalid platform app). */
function resolveInstagramOAuthClientId(): string {
  return getInstagramAppId() || "";
}

function resolveInstagramOAuthClientSecret(): string {
  return getInstagramAppSecret() || getMetaAppSecret();
}

export function buildInstagramAuthorizeUrl(redirectUri: string): string {
  const clientId = resolveInstagramOAuthClientId();
  if (!clientId) {
    throw new Error("ERR_INSTAGRAM_APP_ID_MISSING");
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: INSTAGRAM_LOGIN_SCOPES,
    force_reauth: "true"
  });
  return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
}

export async function exchangeInstagramAuthorizationCode(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; userId: string }> {
  const clientId = resolveInstagramOAuthClientId();
  const clientSecret = resolveInstagramOAuthClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error(
      clientId ? "ERR_META_APP_CREDENTIALS" : "ERR_INSTAGRAM_APP_ID_MISSING"
    );
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code
  });

  const { data } = await axios.post(
    "https://api.instagram.com/oauth/access_token",
    body.toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 30000 }
  );

  const accessToken = data?.access_token;
  const userId = String(data?.user_id || data?.user_id?.id || "");
  if (!accessToken) {
    throw new Error("ERR_INSTAGRAM_CODE_EXCHANGE");
  }

  return { accessToken, userId };
}

export async function exchangeInstagramLongLivedToken(
  shortLivedToken: string
): Promise<{ accessToken: string; expiresIn?: number }> {
  const clientSecret = resolveInstagramOAuthClientSecret();
  const { data } = await axios.get(`${IG_GRAPH}/access_token`, {
    params: {
      grant_type: "ig_exchange_token",
      client_secret: clientSecret,
      access_token: shortLivedToken
    },
    timeout: 30000
  });

  if (!data?.access_token) {
    throw new Error("ERR_INSTAGRAM_LONG_LIVED_TOKEN");
  }

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in
  };
}

export async function getInstagramLoginProfile(accessToken: string): Promise<{
  id: string;
  username?: string;
  name?: string;
  accountType?: string;
}> {
  const { data } = await axios.get(`${IG_GRAPH}/${IG_GRAPH_VERSION}/me`, {
    params: {
      fields: "user_id,username,name,account_type",
      access_token: accessToken
    },
    timeout: 30000
  });

  const id = String(data?.user_id || data?.id || "");
  if (!id) {
    throw new Error("ERR_INSTAGRAM_PROFILE");
  }

  return {
    id,
    username: data?.username,
    name: data?.name,
    accountType: data?.account_type
  };
}

export async function subscribeInstagramLoginWebhooks(
  accessToken: string
): Promise<{ ok: boolean; error?: string; data?: any }> {
  // comments é obrigatório para App Review (comentário → DM / resposta pública).
  const fieldSets = [
    "messages,messaging_postbacks,messaging_seen,message_reactions,comments",
    "messages,comments",
    "comments,messages",
    "messages"
  ];

  let lastError = "";
  let bestOk: { ok: boolean; data?: any; subscribed_fields?: string } | null =
    null;

  for (const subscribed_fields of fieldSets) {
    try {
      const { data } = await axios.post(
        `${IG_GRAPH}/${IG_GRAPH_VERSION}/me/subscribed_apps`,
        null,
        {
          params: { subscribed_fields, access_token: accessToken },
          timeout: 30000
        }
      );
      logger.info("[subscribeInstagramLoginWebhooks] OK", {
        subscribed_fields,
        success: data?.success
      });
      const hasComments = subscribed_fields.includes("comments");
      if (hasComments) {
        return { ok: true, data };
      }
      // Guarda fallback sem comments só se nada melhor funcionar.
      if (!bestOk) {
        bestOk = { ok: true, data, subscribed_fields };
      }
    } catch (err: any) {
      lastError =
        err?.response?.data?.error?.message ||
        err?.message ||
        "Falha ao inscrever webhooks Instagram Login";
      logger.warn("[subscribeInstagramLoginWebhooks] Tentativa falhou", {
        subscribed_fields,
        apiError: lastError
      });
    }
  }

  if (bestOk?.ok) {
    logger.warn(
      "[subscribeInstagramLoginWebhooks] Inscrito sem comments — reconecte após Advanced Access de manage_comments",
      { subscribed_fields: bestOk.subscribed_fields }
    );
    return { ok: true, data: bestOk.data };
  }

  return { ok: false, error: lastError };
}

function metaApiErrorMessage(err: any): string {
  const api =
    err?.response?.data?.error?.message ||
    err?.response?.data?.error_message ||
    err?.response?.data?.error?.error_user_msg ||
    err?.message;
  return String(api || "Falha ao enviar mensagem no Instagram").trim();
}

export async function sendInstagramLoginText(
  igUserId: string,
  recipientId: string | number,
  text: string,
  accessToken: string
): Promise<any> {
  const payload = {
    recipient: { id: String(recipientId) },
    message: { text: String(text) }
  };

  const igId = String(igUserId || "me").trim() || "me";
  const urls = [
    `${IG_GRAPH}/${IG_GRAPH_VERSION}/me/messages`,
    `${IG_GRAPH}/${IG_GRAPH_VERSION}/${igId}/messages`
  ];

  let lastError: any = null;
  for (const url of urls) {
    // 1) Bearer (formato oficial Instagram Login)
    try {
      const { data } = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        timeout: 30000
      });
      return data;
    } catch (err: any) {
      lastError = err;
      logger.warn("[sendInstagramLoginText] Bearer falhou", {
        url,
        apiError: metaApiErrorMessage(err)
      });
    }

    // 2) access_token em query (fallback)
    try {
      const { data } = await axios.post(url, payload, {
        params: { access_token: accessToken },
        timeout: 30000
      });
      return data;
    } catch (err: any) {
      lastError = err;
      logger.warn("[sendInstagramLoginText] access_token query falhou", {
        url,
        apiError: metaApiErrorMessage(err)
      });
    }
  }

  const msg = metaApiErrorMessage(lastError);
  const e = new Error(msg);
  (e as any).response = lastError?.response;
  throw e;
}

export async function replyInstagramLoginComment(
  commentId: string,
  text: string,
  accessToken: string
): Promise<any> {
  const { data } = await axios.post(
    `${IG_GRAPH}/${IG_GRAPH_VERSION}/${commentId}/replies`,
    { message: String(text) },
    {
      params: { access_token: accessToken },
      timeout: 30000
    }
  );
  return data;
}

export async function sendInstagramLoginPrivateReply(
  igUserId: string,
  commentId: string,
  text: string,
  accessToken: string
): Promise<any> {
  const { data } = await axios.post(
    `${IG_GRAPH}/${IG_GRAPH_VERSION}/${igUserId}/messages`,
    {
      recipient: { comment_id: String(commentId) },
      message: { text: String(text) }
    },
    {
      params: { access_token: accessToken },
      timeout: 30000
    }
  );
  return data;
}

export async function sendInstagramLoginAttachment(
  igUserId: string,
  recipientId: string | number,
  url: string,
  type: string,
  accessToken: string
): Promise<any> {
  const payload = {
    recipient: { id: String(recipientId) },
    message: {
      attachment: {
        type,
        payload: { url }
      }
    }
  };

  const igId = String(igUserId || "me").trim() || "me";
  const endpoints = [
    `${IG_GRAPH}/${IG_GRAPH_VERSION}/me/messages`,
    `${IG_GRAPH}/${IG_GRAPH_VERSION}/${igId}/messages`
  ];

  let lastError: any = null;
  for (const endpoint of endpoints) {
    try {
      const { data } = await axios.post(endpoint, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        timeout: 30000
      });
      return data;
    } catch (err: any) {
      lastError = err;
    }
    try {
      const { data } = await axios.post(endpoint, payload, {
        params: { access_token: accessToken },
        timeout: 30000
      });
      return data;
    } catch (err: any) {
      lastError = err;
    }
  }

  throw new Error(metaApiErrorMessage(lastError));
}

export async function profileInstagramScopedId(
  igsid: string,
  accessToken: string
): Promise<any> {
  try {
    const { data } = await axios.get(
      `${IG_GRAPH}/${IG_GRAPH_VERSION}/${igsid}`,
      {
        params: {
          fields: "name,username,profile_pic",
          access_token: accessToken
        },
        timeout: 15000
      }
    );
    if (data?.id || data?.username) {
      return {
        id: String(data.id || igsid),
        name: data.name || data.username || `Contato ${String(igsid).slice(-6)}`,
        username: data.username,
        profile_pic: data.profile_pic
      };
    }
  } catch {
    // fallback abaixo
  }

  return {
    id: String(igsid),
    name: `Contato ${String(igsid).slice(-6)}`
  };
}

export function isInstagramLoginConnection(whatsapp: {
  provider?: string | null;
  channel?: string | null;
}): boolean {
  return (
    String(whatsapp?.provider || "") === INSTAGRAM_LOGIN_PROVIDER ||
    (whatsapp?.channel === "instagram" &&
      String(whatsapp?.provider || "") === INSTAGRAM_LOGIN_PROVIDER)
  );
}
