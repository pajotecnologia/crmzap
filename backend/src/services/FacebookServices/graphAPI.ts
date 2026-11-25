import axios from "axios";
import FormData from "form-data";
import { createReadStream } from "fs";
import logger from "../../utils/logger";
import { isNil } from "lodash";
import {
  getMetaAppId,
  getMetaAppSecret
} from "../../helpers/getMetaAppCredentials";
const formData: FormData = new FormData();

const apiBase = (token: string) =>
  axios.create({
    baseURL: "https://graph.facebook.com/v20.0/",
    params: {
      access_token: token
    }
  });

export const getAccessToken = async (): Promise<string> => {
  const { data } = await axios.get(
    "https://graph.facebook.com/v20.0/oauth/access_token",
    {
      params: {
        client_id: getMetaAppId(),
        client_secret: getMetaAppSecret(),
        grant_type: "client_credentials"
      }
    }
  );

  return data.access_token;
};

export const markSeen = async (id: string, token: string): Promise<void> => {
  await apiBase(token).post(`${id}/messages`, {
    recipient: {
      id
    },
    sender_action: "mark_seen"
  });
};

export const showTypingIndicator = async (
  id: string, 
  token: string,
  action: string
): Promise<void> => {

  try {
    const { data } = await apiBase(token).post("me/messages", {
      recipient: {
        id: id
      },
      sender_action: action
    })

    return data;
  } catch (error) {
    //console.log(error);
  }

}

export type SendMetaMessageOpts = {
  provider?: string | null;
  igUserId?: string | null;
};

/**
 * Resposta pública a um comentário do Instagram (thread do post).
 * Exige `instagram_business_manage_comments` (ou equivalente aprovado).
 */
export const replyToInstagramComment = async (
  commentId: string,
  text: string,
  token: string,
  opts?: SendMetaMessageOpts
): Promise<any> => {
  const id = String(commentId || "").trim();
  const message = String(text || "").trim();
  if (!id || !message) {
    throw new Error("ERR_IG_COMMENT_REPLY_MISSING_PARAMS");
  }

  if (opts?.provider === "instagram_login") {
    const { replyInstagramLoginComment } = await import("./instagramLoginAPI");
    return replyInstagramLoginComment(id, message, token);
  }

  const { data } = await axios.post(
    `https://graph.facebook.com/v20.0/${id}/replies`,
    { message },
    { params: { access_token: token }, timeout: 30000 }
  );
  return data;
};

/**
 * Private Reply: comentário no post → DM (janela limitada pela Meta).
 * Exige comments + manage_messages.
 */
export const sendInstagramPrivateReply = async (
  commentId: string,
  text: string,
  token: string,
  opts?: SendMetaMessageOpts & { igUserId?: string }
): Promise<any> => {
  const id = String(commentId || "").trim();
  const message = String(text || "").trim();
  if (!id || !message) {
    throw new Error("ERR_IG_PRIVATE_REPLY_MISSING_PARAMS");
  }

  const payload = {
    recipient: { comment_id: id },
    message: { text: message }
  };

  if (opts?.provider === "instagram_login") {
    const { sendInstagramLoginPrivateReply } = await import("./instagramLoginAPI");
    return sendInstagramLoginPrivateReply(
      String(opts.igUserId || "me"),
      id,
      message,
      token
    );
  }

  const { data } = await apiBase(token).post("me/messages", payload);
  return data;
};

export const sendText = async (
  id: string | number,
  text: string,
  token: string,
  tag?: string | null,
  opts?: SendMetaMessageOpts
): Promise<void> => {
  if (opts?.provider === "instagram_login") {
    const { sendInstagramLoginText } = await import("./instagramLoginAPI");
    return sendInstagramLoginText(
      String(opts.igUserId || "me"),
      id,
      text,
      token
    );
  }

  try {
    if (!isNil(tag)) {
      const { data } = await apiBase(token).post("me/messages", {
        recipient: {
          id
        },
        message: {
          text: `${text}`,
        },
        messaging_type: "MESSAGE_TAG",
        tag: tag
      });
      return data;
    } else {
      const { data } = await apiBase(token).post("me/messages", {
        recipient: {
          id
        },
        message: {
          text: `${text}`,
        },
      });
      return data;
    }
  } catch (error) {
    const status = (error as any)?.response?.status;
    const data = (error as any)?.response?.data;
    logger.error(`ERR_SENDING_MESSAGE_TO_FACEBOOK_TRY_3: Axios ${status} ${JSON.stringify(data)}`);
    if (status === 401) {
      // Token expirado ou inválido
      throw new Error("ERR_SESSION_EXPIRED");
    }
    try {
      if (!isNil(tag)) {
        const { data } = await apiBase(token).post("me/messages", {
          recipient: {
          id
        },
        message: {
          text: `${text}`,
        },
        messaging_type: "MESSAGE_TAG",
        tag: tag
        });
        return data;
      } else {
        throw new Error("ERR_SENDING_MESSAGE_TO_FACEBOOK_TRY_3");
      }
    } catch (error) {
      console.log(error);
    }
  }
};

export const sendAttachmentFromUrl = async (
  id: string,
  url: string,
  type: string,
  token: string,
  tag?: string | null,
  opts?: SendMetaMessageOpts
): Promise<void> => {
  if (opts?.provider === "instagram_login") {
    const { sendInstagramLoginAttachment } = await import("./instagramLoginAPI");
    return sendInstagramLoginAttachment(
      String(opts.igUserId || "me"),
      id,
      url,
      type,
      token
    );
  }

  try {
    const payload: Record<string, unknown> = {
      recipient: { id },
      message: {
        attachment: {
          type,
          payload: { url }
        }
      }
    };

    if (!isNil(tag)) {
      payload.messaging_type = "MESSAGE_TAG";
      payload.tag = tag;
    }

    const { data } = await apiBase(token).post("me/messages", payload);
    return data;
  } catch (error) {
    console.log(error);
    throw error;
  }
};

export const sendAttachment = async (
  id: string,
  file: Express.Multer.File,
  type: string,
  token: string
): Promise<void> => {
  formData.append(
    "recipient",
    JSON.stringify({
      id
    })
  );

  formData.append(
    "message",
    JSON.stringify({
      attachment: {
        type,
        payload: {
          is_reusable: true
        }
      }
    })
  );

  const fileReaderStream = createReadStream(file.path);

  formData.append("filedata", fileReaderStream);

  try {
    await apiBase(token).post("me/messages", formData, {
      headers: {
        ...formData.getHeaders()
      }
    });
  } catch (error) {
    throw new Error(error);
  }
};

export const genText = (text: string): any => {
  const response = {
    text
  };

  return response;
};

export const getProfile = async (id: string, token: string): Promise<any> => {
  try {
    const { data } = await axios.get(
      `https://graph.facebook.com/v20.0/${id}?fields=name,username,profile_pic,follower_count,is_user_follow_business,is_business_follow_user&access_token=${token}`
    );
    return data;
  } catch (error) {
    console.log(error);
    throw new Error("ERR_FETCHING_FB_USER_PROFILE_2");
  }
};

export const getPageProfile = async (
  id: string,
  token: string
): Promise<any> => {
  try {
    logger.info("[getPageProfile] Chamando Graph API", { userId: id, tokenLength: token?.length ?? 0 });
    const endpoints = [
      `${id}/accounts?fields=name,access_token,instagram_business_account{id,username,name},connected_instagram_account{id,username,name}`,
      `${id}/accounts?fields=name,access_token,instagram_business_account,connected_instagram_account`,
      `${id}/accounts?fields=name,access_token,instagram_business_account{id}`,
      `${id}/accounts?fields=name,access_token,connected_instagram_account{id}`,
      `${id}/accounts?fields=name,access_token,instagram_business_accounts{id}`,
      `${id}/accounts?fields=name,access_token`
    ];

    let response: any = null;
    for (const endpoint of endpoints) {
      try {
        response = await apiBase(token).get(endpoint);
        break;
      } catch (e) {
        // tenta próximo endpoint
      }
    }

    if (!response) throw new Error("ERR_FETCHING_FB_PAGES");

    const data = response.data;

    if (data?.error) {
      logger.error("[getPageProfile] Graph API retornou erro", {
        code: data.error.code,
        message: data.error.message,
        type: data.error.type,
        subcode: data.error.error_subcode
      });
      throw new Error(`ERR_FETCHING_FB_PAGES: ${data.error.message || data.error.code}`);
    }

    if (!Array.isArray(data?.data)) {
      logger.warn("[getPageProfile] Resposta sem array data", { keys: data ? Object.keys(data) : [] });
      return { data: [] };
    }

    logger.info("[getPageProfile] Páginas encontradas", { count: data.data.length });
    return data;
  } catch (error: any) {
    const status = error?.response?.status;
    const errData = error?.response?.data;
    logger.error("[getPageProfile] Falha na requisição", {
      message: error?.message,
      status,
      apiError: errData?.error?.message || errData?.error?.code,
      apiErrorType: errData?.error?.type
    });
    throw new Error("ERR_FETCHING_FB_PAGES");
  }
};

/** Completa username/name do IG Business quando o Graph só devolveu o id. */
export const enrichInstagramBusinessAccount = async (
  account: any,
  pageToken: string
): Promise<any> => {
  if (!account?.id) return account;
  if (account.username || account.name) return account;

  try {
    const { data } = await apiBase(pageToken).get(
      `${account.id}?fields=username,name,profile_picture_url`
    );
    if (data?.id) {
      return {
        ...account,
        username: data.username || account.username,
        name: data.name || account.name,
        profile_picture_url:
          data.profile_picture_url || account.profile_picture_url
      };
    }
  } catch (err: any) {
    logger.warn("[enrichInstagramBusinessAccount] Falha ao buscar username", {
      instagramId: account.id,
      error: err?.message
    });
  }

  return account;
};

export const getInstagramBusinessAccountFromPage = async (
  pageId: string,
  pageToken: string
): Promise<any> => {
  // Graph costuma variar o formato do campo/endpoint retornado conforme token/permissões.
  // NÃO retornar cedo só com {id}: isso gerava "Insta undefined" no CRM.
  // Preferimos respostas com username/name; se só vier id, enriquecemos depois.
  const fieldSets = [
    "id,username,name,profile_picture_url",
    "id,username,name",
    "id,username",
    "id"
  ];

  const extract = (payload: any): any => {
    if (!payload) return null;

    // Caso 1: /{pageId}?fields=instagram_business_account{...} ou connected_instagram_account{...}
    if (payload?.instagram_business_account?.id) return payload.instagram_business_account;
    if (Array.isArray(payload?.instagram_business_account) && payload.instagram_business_account?.[0]?.id) {
      return payload.instagram_business_account[0];
    }
    if (payload?.connected_instagram_account?.id) return payload.connected_instagram_account;
    if (Array.isArray(payload?.connected_instagram_account) && payload.connected_instagram_account?.[0]?.id) {
      return payload.connected_instagram_account[0];
    }
    if (payload?.data?.instagram_business_account?.id) return payload.data.instagram_business_account;
    if (Array.isArray(payload?.data?.instagram_business_account) && payload.data.instagram_business_account?.[0]?.id) {
      return payload.data.instagram_business_account[0];
    }
    if (payload?.data?.connected_instagram_account?.id) return payload.data.connected_instagram_account;
    if (Array.isArray(payload?.data?.connected_instagram_account) && payload.data.connected_instagram_account?.[0]?.id) {
      return payload.data.connected_instagram_account[0];
    }

    // Caso 2: /{pageId}/instagram_business_account?fields=...
    // (pode vir como objeto direto ou como "data")
    if (payload?.id && (payload?.username || payload?.name)) return payload;
    if (payload?.data?.id && (payload?.data?.username || payload?.data?.name)) return payload.data;

    if (Array.isArray(payload?.data) && payload.data[0]?.id) return payload.data[0];
    if (Array.isArray(payload?.data?.instagram_business_account) && payload.data.instagram_business_account[0]?.id) {
      return payload.data.instagram_business_account[0];
    }

    // Último recurso: só o id (será enriquecido abaixo)
    if (payload?.id) return payload;
    if (payload?.data?.id) return payload.data;

    return null;
  };

  const attempts: Array<() => Promise<any>> = [];

  for (const fields of fieldSets) {
    attempts.push(async () => {
      const response = await apiBase(pageToken).get(
        `${pageId}?fields=instagram_business_account{${fields}},connected_instagram_account{${fields}}`
      );
      return extract(response?.data);
    });
  }

  // Fallback sem nested fields (só id) — depois enrichInstagramBusinessAccount completa
  attempts.push(async () => {
    const response = await apiBase(pageToken).get(
      `${pageId}?fields=instagram_business_account,connected_instagram_account`
    );
    return extract(response?.data);
  });

  // 2) Tentativas via sub-recurso: /{pageId}/instagram_business_account(s) ou connected_instagram_account?fields=...
  for (const fields of fieldSets) {
    attempts.push(async () => {
      const response = await apiBase(pageToken).get(
        `${pageId}/instagram_business_account?fields=${fields}`
      );
      return extract(response?.data);
    });
    attempts.push(async () => {
      // Alguns casos retornam como lista em plural
      const response = await apiBase(pageToken).get(
        `${pageId}/instagram_business_accounts?fields=${fields}`
      );
      return extract(response?.data);
    });
    attempts.push(async () => {
      const response = await apiBase(pageToken).get(
        `${pageId}/connected_instagram_account?fields=${fields}`
      );
      return extract(response?.data);
    });
  }

  // Fallback direto sub-recurso sem fields
  attempts.push(async () => {
    const response = await apiBase(pageToken).get(
      `${pageId}/connected_instagram_account`
    );
    return extract(response?.data);
  });

  let best: any = null;
  for (const attempt of attempts) {
    try {
      const acc = await attempt();
      if (!acc?.id) continue;
      if (acc.username || acc.name) {
        return await enrichInstagramBusinessAccount(acc, pageToken);
      }
      if (!best) best = acc;
    } catch {
      // segue
    }
  }

  if (best?.id) {
    return enrichInstagramBusinessAccount(best, pageToken);
  }

  return null;
};

export const profilePsid = async (
  id: string,
  token: string,
  opts?: SendMetaMessageOpts
): Promise<any> => {
  if (opts?.provider === "instagram_login") {
    const { profileInstagramScopedId } = await import("./instagramLoginAPI");
    return profileInstagramScopedId(id, token);
  }

  try {
    const { data } = await axios.get(
      `https://graph.facebook.com/v20.0/${id}`,
      {
        params: {
          fields: "name,first_name,last_name,profile_pic,username",
          access_token: token
        }
      }
    );
    if (data?.id) return data;
  } catch {
    // tenta campos típicos de Instagram Messaging
  }

  try {
    return await getProfile(id, token);
  } catch {
    // Nunca bloquear criação de ticket por falha de perfil Graph.
    return {
      id: String(id),
      name: `Contato ${String(id).slice(-6)}`
    };
  }
};

/** Campos válidos para Página do Facebook (Messenger). */
const PAGE_SUBSCRIBED_FIELDS = [
  "messages",
  "messaging_postbacks",
  "messaging_handovers",
  "message_deliveries",
  "message_reads",
  "message_echoes",
  "standby"
];

/**
 * Campos válidos para Instagram Business Account.
 * A Graph rejeita messaging_handovers / message_deliveries / message_reads / message_echoes
 * no IG id — sem inscrição correta, DMs do Instagram NÃO chegam ao webhook.
 */
const INSTAGRAM_SUBSCRIBED_FIELDS = [
  "messages",
  "messaging_postbacks",
  "messaging_optins",
  "messaging_referral",
  "messaging_seen",
  "message_edit",
  "message_reactions",
  "comments",
  "standby"
];

const MINIMAL_MESSAGING_FIELDS = ["messages", "standby"];

type SubscribeAppKind = "page" | "instagram" | "auto";

const fieldsForKind = (kind: SubscribeAppKind): string[] => {
  if (kind === "instagram") return INSTAGRAM_SUBSCRIBED_FIELDS;
  if (kind === "page") return PAGE_SUBSCRIBED_FIELDS;
  return PAGE_SUBSCRIBED_FIELDS;
};

const postSubscribedApps = async (
  id: string,
  token: string,
  subscribed_fields: string[]
) => {
  const { data } = await axios.post(
    `https://graph.facebook.com/v20.0/${id}/subscribed_apps`,
    { subscribed_fields },
    { params: { access_token: token } }
  );
  return data;
};

export const subscribeApp = async (
  id: string,
  token: string,
  kind: SubscribeAppKind = "auto"
): Promise<any> => {
  const primaryFields = fieldsForKind(kind);
  try {
    const data = await postSubscribedApps(id, token, primaryFields);
    logger.info("[subscribeApp] OK", {
      id,
      kind,
      fields: primaryFields
    });
    return data;
  } catch (error: any) {
    const apiMsg =
      error?.response?.data?.error?.message ||
      error?.response?.headers?.["www-authenticate"] ||
      error?.message;
    const status = error?.response?.status;

    // Se os campos não forem aceitos para este id (Page vs IG), tenta o outro conjunto e o mínimo.
    const fallbacks: string[][] =
      kind === "instagram"
        ? [MINIMAL_MESSAGING_FIELDS]
        : kind === "page"
          ? [MINIMAL_MESSAGING_FIELDS]
          : [INSTAGRAM_SUBSCRIBED_FIELDS, MINIMAL_MESSAGING_FIELDS];

    for (const fields of fallbacks) {
      try {
        const data = await postSubscribedApps(id, token, fields);
        logger.warn("[subscribeApp] OK com fallback de campos", {
          id,
          kind,
          fields,
          previousError: typeof apiMsg === "string" ? apiMsg.slice(0, 180) : apiMsg
        });
        return data;
      } catch {
        // tenta próximo fallback
      }
    }

    logger.error("[subscribeApp] Falha ao inscrever subscribed_apps", {
      id,
      kind,
      status,
      apiError: typeof apiMsg === "string" ? apiMsg.slice(0, 240) : apiMsg
    });
    throw new Error("ERR_SUBSCRIBING_PAGE_TO_MESSAGE_WEBHOOKS");
  }
};

export const unsubscribeApp = async (
  id: string,
  token: string
): Promise<any> => {
  try {
    const { data } = await axios.delete(
      `https://graph.facebook.com/v20.0/${id}/subscribed_apps?access_token=${token}`
    );
    return data;
  } catch (error) {
    throw new Error("ERR_UNSUBSCRIBING_PAGE_TO_MESSAGE_WEBHOOKS");
  }
};

export const getSubscribedApps = async (
  id: string,
  token: string
): Promise<any> => {
  try {
    const { data } = await apiBase(token).get(`${id}/subscribed_apps`);
    return data;
  } catch (error) {
    throw new Error("ERR_GETTING_SUBSCRIBED_APPS");
  }
};

export type MetaAppWebhookSubscribeResult = {
  ok: boolean;
  skipped?: boolean;
  callbackUrl?: string;
  page?: { ok: boolean; error?: string };
  instagram?: { ok: boolean; error?: string };
  listed?: any;
  error?: string;
};

const resolvePublicBackendUrl = (): string => {
  const raw =
    process.env.PUBLIC_BACKEND_URL ||
    process.env.BACKEND_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : "") ||
    "";
  return String(raw).trim().replace(/\/$/, "");
};

export const listMetaAppWebhookSubscriptions = async (): Promise<any> => {
  const appId = getMetaAppId();
  const appSecret = getMetaAppSecret();
  if (!appId || !appSecret) return null;
  const { data } = await axios.get(
    `https://graph.facebook.com/v20.0/${appId}/subscriptions`,
    { params: { access_token: `${appId}|${appSecret}` } }
  );
  return data;
};

/**
 * Garante inscrição do APP nos objetos page + instagram no callback do CRM.
 * Sem o objeto `instagram` no app + `messages` na Página, DMs do Instagram NÃO chegam.
 */
export const ensureMetaAppWebhookSubscriptions =
  async (): Promise<MetaAppWebhookSubscribeResult> => {
  const appId = getMetaAppId();
  const appSecret = getMetaAppSecret();
  const backendUrl = resolvePublicBackendUrl();
  const verifyCandidates = Array.from(
    new Set(
      [
        process.env.VERIFY_TOKEN,
        "whaticket",
        "whaticket-vbs-2025"
      ]
        .map((t) => (typeof t === "string" ? t.trim() : ""))
        .filter(Boolean)
    )
  );

  if (!appId || !appSecret || !backendUrl) {
    logger.warn("[ensureMetaAppWebhookSubscriptions] Skip — faltam appId/secret/BACKEND_URL", {
      hasAppId: !!appId,
      hasSecret: !!appSecret,
      hasBackendUrl: !!backendUrl
    });
    return {
      ok: false,
      skipped: true,
      error: "Faltam FACEBOOK_APP_ID, FACEBOOK_APP_SECRET ou BACKEND_URL/PUBLIC_BACKEND_URL"
    };
  }

  if (!/^https:\/\//i.test(backendUrl)) {
    logger.error("[ensureMetaAppWebhookSubscriptions] BACKEND_URL precisa ser HTTPS público", {
      backendUrl
    });
    return {
      ok: false,
      error: `BACKEND_URL inválido para webhook Meta (precisa HTTPS): ${backendUrl}`
    };
  }

  const callbackUrl = `${backendUrl}/webhook`;
  const appAccessToken = `${appId}|${appSecret}`;
  const result: MetaAppWebhookSubscribeResult = {
    ok: false,
    callbackUrl,
    page: { ok: false },
    instagram: { ok: false }
  };

  const subscribeObject = async (
    object: "page" | "instagram",
    fieldsList: string[]
  ): Promise<{ ok: boolean; error?: string }> => {
    let lastError = "";
    for (const fields of fieldsList) {
      for (const verifyToken of verifyCandidates) {
        try {
          const { data } = await axios.post(
            `https://graph.facebook.com/v20.0/${appId}/subscriptions`,
            null,
            {
              params: {
                object,
                callback_url: callbackUrl,
                fields,
                include_values: true,
                verify_token: verifyToken,
                access_token: appAccessToken
              },
              timeout: 30000
            }
          );
          logger.info("[ensureMetaAppWebhookSubscriptions] OK", {
            object,
            callbackUrl,
            fields,
            verifyTokenUsed: verifyToken.slice(0, 8),
            success: data?.success
          });
          return { ok: true };
        } catch (error: any) {
          lastError =
            error?.response?.data?.error?.message ||
            error?.message ||
            "Falha ao assinar webhook do app";
          logger.warn("[ensureMetaAppWebhookSubscriptions] Tentativa falhou", {
            object,
            fields,
            status: error?.response?.status,
            apiError: lastError
          });
        }
      }
    }
    logger.error("[ensureMetaAppWebhookSubscriptions] Falha definitiva", {
      object,
      callbackUrl,
      apiError: lastError
    });
    return { ok: false, error: lastError };
  };

  result.page = await subscribeObject("page", [
    "messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads,messaging_referrals,standby",
    "messages,standby"
  ]);
  result.instagram = await subscribeObject("instagram", [
    "messages,messaging_postbacks,messaging_seen,message_reactions,comments,standby",
    "messages,comments",
    "messages,messaging_postbacks,messaging_seen,message_reactions,standby",
    "messages"
  ]);

  try {
    result.listed = await listMetaAppWebhookSubscriptions();
  } catch (err: any) {
    logger.warn("[ensureMetaAppWebhookSubscriptions] Não listou subscriptions", {
      error: err?.message
    });
  }

  result.ok = !!(result.page?.ok && result.instagram?.ok);
  if (!result.ok) {
    result.error =
      (!result.instagram?.ok && result.instagram?.error) ||
      (!result.page?.ok && result.page?.error) ||
      "Falha ao assinar webhooks page/instagram no app Meta";
  }
  return result;
};

/**
 * Reinscreve Página + IG Business de todas as conexões Meta CONNECTED.
 * Necessário após Meta desativar webhooks por falha de entrega (Alert Inbox).
 */
export const repairAllConnectedMetaMessengerSubscriptions = async (): Promise<{
  connections: number;
  pageOk: number;
  igOk: number;
  app: MetaAppWebhookSubscribeResult;
}> => {
  const { Op } = await import("sequelize");
  const Whatsapp = (await import("../../models/Whatsapp")).default;
  const app = await ensureMetaAppWebhookSubscriptions();
  const rows = await Whatsapp.findAll({
    where: {
      status: "CONNECTED",
      channel: { [Op.in]: ["facebook", "instagram"] }
    }
  });

  let pageOk = 0;
  let igOk = 0;
  const seenPages = new Set<string>();
  const seenIg = new Set<string>();

  for (const row of rows) {
    const token = row.facebookUserToken;
    if (!token) continue;

    if (row.channel === "facebook" && row.facebookPageUserId) {
      const pageId = String(row.facebookPageUserId);
      if (!seenPages.has(pageId)) {
        seenPages.add(pageId);
        try {
          await subscribeApp(pageId, token, "page");
          pageOk += 1;
        } catch (err: any) {
          logger.warn("[repairAllConnectedMetaMessenger] page fail", {
            pageId,
            error: err?.message
          });
        }
      }
    }

    if (row.channel === "instagram" && row.facebookPageUserId) {
      const igId = String(row.facebookPageUserId);

      // Instagram Login: graph.instagram.com/me/subscribed_apps
      if (String(row.provider || "") === "instagram_login") {
        if (!seenIg.has(igId)) {
          seenIg.add(igId);
          try {
            const { subscribeInstagramLoginWebhooks } = await import(
              "./instagramLoginAPI"
            );
            const sub = await subscribeInstagramLoginWebhooks(token);
            if (sub.ok) igOk += 1;
            else {
              logger.warn("[repairAllConnectedMetaMessenger] ig login fail", {
                igId,
                error: sub.error
              });
            }
          } catch (err: any) {
            logger.warn("[repairAllConnectedMetaMessenger] ig login fail", {
              igId,
              error: err?.message
            });
          }
        }
        continue;
      }

      if (!seenIg.has(igId)) {
        seenIg.add(igId);
        try {
          await subscribeApp(igId, token, "instagram");
          igOk += 1;
        } catch (err: any) {
          logger.warn("[repairAllConnectedMetaMessenger] ig fail", {
            igId,
            error: err?.message
          });
        }
      }

      // Instagram Messaging via Messenger Platform também exige a Página inscrita.
      if (row.facebookUserId) {
        const sibling = rows.find(
          (r) =>
            r.channel === "facebook" &&
            r.facebookUserId === row.facebookUserId &&
            r.facebookPageUserId
        );
        if (sibling?.facebookPageUserId) {
          const pageId = String(sibling.facebookPageUserId);
          if (!seenPages.has(pageId)) {
            seenPages.add(pageId);
            try {
              await subscribeApp(pageId, token, "page");
              pageOk += 1;
            } catch (err: any) {
              logger.warn("[repairAllConnectedMetaMessenger] sibling page fail", {
                pageId,
                error: err?.message
              });
            }
          }
        }
      }
    }
  }

  logger.info("[repairAllConnectedMetaMessenger] Concluído", {
    connections: rows.length,
    pageOk,
    igOk,
    appOk: app.ok
  });

  return { connections: rows.length, pageOk, igOk, app };
};

export const getAccessTokenFromPage = async (
  token: string
): Promise<string> => {
  try {
    if (!token) throw new Error("ERR_FETCHING_FB_USER_TOKEN");

    const appId = getMetaAppId();
    const appSecret = getMetaAppSecret();
    logger.info("[getAccessTokenFromPage] Troca de token", {
      hasAppId: !!appId,
      hasSecret: !!appSecret
    });

    const response = await axios.get(
      "https://graph.facebook.com/v20.0/oauth/access_token",
      {
        params: {
          client_id: appId,
          client_secret: appSecret,
          grant_type: "fb_exchange_token",
          fb_exchange_token: token
        }
      }
    );

    const accessToken = response.data?.access_token;
    if (!accessToken) {
      logger.error("[getAccessTokenFromPage] Resposta sem access_token", { dataKeys: Object.keys(response.data || {}) });
      throw new Error("ERR_FETCHING_FB_USER_TOKEN");
    }
    return accessToken;
  } catch (error: any) {
    const status = error?.response?.status;
    const errData = error?.response?.data;
    logger.error("[getAccessTokenFromPage] Falha na troca de token", {
      message: error?.message,
      status,
      apiError: errData?.error?.message || errData?.error?.code,
      apiErrorType: errData?.error?.type
    });
    throw new Error("ERR_FETCHING_FB_USER_TOKEN");
  }
};

export const removeApplcation = async (
  id: string,
  token: string
): Promise<void> => {
  try {
    await axios.delete(`https://graph.facebook.com/v20.0/${id}/permissions`, {
      params: {
        access_token: token
      }
    });
  } catch (error) {
    logger.error("ERR_REMOVING_APP_FROM_PAGE");
  }
};
