// Ajustes de tipagem e dependências para evitar erros de compilação
declare const process: any;
declare module "crypto";
const cryptoMod: any = (() => {
  try {
    // carrega crypto de forma dinâmica, evitando erro de tipagem em ambientes sem @types/node
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("crypto");
  } catch {
    return null;
  }
})();
import Whatsapp from "../models/Whatsapp";
import { handleMessage } from "../services/FacebookServices/facebookMessageListener";
import {
  handleInstagramCommentAutomation,
  parseInstagramCommentChange
} from "../services/FacebookServices/HandleInstagramCommentAutomationService";
import { handleMessage as handleWhatsAppOficialWebhook } from "./MetaController";
import { verifyMetaWebhookSignature } from "../helpers/verifyMetaWebhookSignature";
import logger from "../utils/logger";

export const index = async (req: any, res: any): Promise<any> => {
  // O Meta chama este endpoint para validar o webhook.
  // Em alguns deployments, o VERIFY_TOKEN no painel pode não ser exatamente
  // o padrão do projeto (ex.: "whaticket-vbs-2025").
  // Para evitar travar a integração, aceitamos alguns tokens legados.
  const verifyTokenFromEnv = process.env.VERIFY_TOKEN;
  const legacyTokens = ["whaticket", "whaticket-vbs-2025"].filter(Boolean);
  const allowedTokens = [verifyTokenFromEnv, ...legacyTokens].filter(
    (t) => typeof t === "string" && t.length > 0
  );

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && allowedTokens.includes(String(token))) {
      return res.status(200).send(challenge);
    }
  }

  return res.status(403).json({
    message: "Forbidden"
  });
};

export const webHook = async (
  req: any,
  res: any
): Promise<any> => {
  try {
    // Debug forte: confirmar se o endpoint está sendo atingido pelo Meta
    try {
      logger.info("[MetaWebhook][ENTRY]", {
        method: req.method,
        path: req.path,
        hasBody: !!req.body,
        bodyObject: req?.body?.object,
        sigHeaderPresent: !!req.headers?.["x-hub-signature-256"],
        rawBodyType: typeof (req as any).rawBody,
        hasAppSecret: !!process.env.FACEBOOK_APP_SECRET
      });
    } catch {
      // ignore
    }

    const sig = verifyMetaWebhookSignature(req);
    if (!sig.ok) {
      logger.error(
        `[MetaWebhook] Assinatura rejeitada (${sig.reason}) path=${req.path} — defina FACEBOOK_APP_SECRET correto nas variáveis do servidor ou META_WEBHOOK_STRICT_SIGNATURE=false.`
      );
      return res.status(403).json({
        message: "Invalid signature",
        hint: "FACEBOOK_APP_SECRET incorreto no servidor"
      });
    }
    if (sig.skipped && sig.reason) {
      const level =
        sig.reason === "signature_mismatch_lenient" ? "warn" : "info";
      const msg = `[MetaWebhook] Assinatura ignorada: ${sig.reason}`;
      if (level === "warn") {
        logger.warn(
          `${msg} — processando mesmo assim. Corrija FACEBOOK_APP_SECRET nas variáveis do servidor.`
        );
      } else {
        logger.info(msg);
      }
    }

    const { body } = req;

    if (body?.object === "whatsapp_business_account") {
      return handleWhatsAppOficialWebhook(req, res);
    }

    // Se a Meta estiver chamando um callback que inclui `:companyId/:connectionId`,
    // usamos a conexão diretamente (evita falha quando o payload usa um ID diferente
    // do `facebookPageUserId` salvo).
    const companyIdFromParams = req?.params?.companyId
      ? Number(req.params.companyId)
      : null;
    const connectionIdFromParams = req?.params?.connectionId
      ? Number(req.params.connectionId)
      : null;
    const connectionFromParams = connectionIdFromParams
      ? await Whatsapp.findByPk(connectionIdFromParams)
      : null;

    // Debug básico para confirmar se o webhook Meta está chegando
    try {
      const obj = body?.object;
      const entryIds = Array.isArray(body?.entry) ? body.entry.map((e: any) => e?.id).slice(0, 5) : [];
      logger.info("[MetaWebhook]", { object: obj, entryIds });
    } catch {
      // ignore
    }
    if (body.object === "page" || body.object === "instagram") {
      let channel: string = body.object === "page" ? "facebook" : "instagram";

      const findConnectionByEntryId = async (
        entryId: string,
        preferredChannel: string
      ) => {
        const id = String(entryId || "").trim();
        if (!id) return null;

        // Instagram: prioriza sempre a conexão channel=instagram.
        if (preferredChannel === "instagram" || body.object === "instagram") {
          const igExact =
            (connectionFromParams?.channel === "instagram" &&
            String(connectionFromParams.facebookPageUserId || "") === id
              ? connectionFromParams
              : null) ||
            (await (Whatsapp as any).findOne({
              where: {
                facebookPageUserId: id,
                channel: "instagram"
              }
            }));
          if (igExact) return igExact;

          // Às vezes salvamos o IG id em facebookUserId (OAuth short.user_id).
          const byUserId = await (Whatsapp as any).findOne({
            where: {
              facebookUserId: id,
              channel: "instagram",
              status: "CONNECTED"
            }
          });
          if (byUserId) return byUserId;

          // entry.id = Page ID → pega IG irmã pelo facebookUserId da Página.
          const pageSibling = await (Whatsapp as any).findOne({
            where: {
              facebookPageUserId: id,
              channel: "facebook",
              status: "CONNECTED"
            }
          });
          if (pageSibling?.facebookUserId) {
            const igSibling = await (Whatsapp as any).findOne({
              where: {
                facebookUserId: pageSibling.facebookUserId,
                channel: "instagram",
                status: "CONNECTED",
                companyId: pageSibling.companyId
              }
            });
            if (igSibling) return igSibling;
          }

          if (companyIdFromParams) {
            const companyIg = await (Whatsapp as any).findOne({
              where: {
                channel: "instagram",
                status: "CONNECTED",
                companyId: companyIdFromParams
              }
            });
            if (companyIg) return companyIg;
          }

          const igConnections = await (Whatsapp as any).findAll({
            where: { channel: "instagram", status: "CONNECTED" }
          });
          if (igConnections?.length === 1) return igConnections[0];
        }

        let found =
          (connectionFromParams &&
          (connectionFromParams.channel === preferredChannel ||
            (preferredChannel === "instagram" &&
              connectionFromParams.channel === "instagram")) &&
          String(connectionFromParams.facebookPageUserId || "") === id
            ? connectionFromParams
            : null) ||
          (await (Whatsapp as any).findOne({
            where: {
              facebookPageUserId: id,
              channel: preferredChannel
            }
          }));

        if (!found) {
          found = await (Whatsapp as any).findOne({
            where: { facebookPageUserId: id }
          });
        }

        // Nunca use a conexão Facebook para object=instagram.
        if (
          found &&
          body.object === "instagram" &&
          found.channel === "facebook"
        ) {
          found = null;
        }

        if (!found && preferredChannel === "facebook") {
          const pageConn = await (Whatsapp as any).findOne({
            where: { facebookPageUserId: id, channel: "facebook" }
          });
          if (pageConn) return pageConn;

          const pageRow = await (Whatsapp as any).findOne({
            where: { facebookPageUserId: id }
          });
          if (pageRow) return pageRow;
        }

        return found;
      };

      for (const entry of body.entry || []) {
        // Resolve conexão: canal esperado, depois qualquer canal com o mesmo ID (IG/Page).
        let getTokenPage = await findConnectionByEntryId(
          String(entry?.id || ""),
          channel
        );

        if (getTokenPage?.channel) {
          if (body.object === "instagram") {
            channel = "instagram";
            // Se ainda veio facebook, tenta IG irmã.
            if (getTokenPage.channel === "facebook") {
              const igFix =
                (await (Whatsapp as any).findOne({
                  where: {
                    facebookUserId: getTokenPage.facebookUserId,
                    channel: "instagram",
                    status: "CONNECTED",
                    companyId: getTokenPage.companyId
                  }
                })) ||
                (await (Whatsapp as any).findOne({
                  where: {
                    channel: "instagram",
                    status: "CONNECTED",
                    companyId: getTokenPage.companyId
                  }
                }));
              if (igFix) getTokenPage = igFix;
            }
          } else if (getTokenPage.channel === "instagram") {
            channel = "instagram";
          } else {
            channel = getTokenPage.channel;
          }
        }

        // Instagram: se o entry.id for o Page ID, pega a conexão IG irmã pelo facebookUserId.
        if (
          (!getTokenPage || getTokenPage.channel !== "instagram") &&
          body.object === "instagram" &&
          entry?.id
        ) {
          const pageSibling = await (Whatsapp as any).findOne({
            where: {
              facebookPageUserId: String(entry.id),
              channel: "facebook",
              status: "CONNECTED"
            }
          });
          if (pageSibling?.facebookUserId) {
            const igSibling = await (Whatsapp as any).findOne({
              where: {
                facebookUserId: pageSibling.facebookUserId,
                channel: "instagram",
                status: "CONNECTED",
                companyId: pageSibling.companyId
              }
            });
            if (igSibling) {
              getTokenPage = igSibling;
              channel = "instagram";
            }
          }
        }

        // Último recurso: única IG CONNECTED da empresa do evento page/ig.
        if (
          body.object === "instagram" &&
          (!getTokenPage || getTokenPage.channel !== "instagram")
        ) {
          const igOnly = await (Whatsapp as any).findAll({
            where: { channel: "instagram", status: "CONNECTED" }
          });
          if (igOnly?.length === 1) {
            getTokenPage = igOnly[0];
            channel = "instagram";
          }
        }

        if (getTokenPage) {
          logger.info("[MetaWebhook][RESOLVED]", {
            entryId: entry?.id,
            object: body.object,
            whatsappId: getTokenPage.id,
            channel: getTokenPage.channel,
            provider: getTokenPage.provider,
            facebookPageUserId: getTokenPage.facebookPageUserId
          });
        }

        const processedMids = new Set<string>();

        const dispatchMessaging = async (data: any, source: string) => {
          const mid = data?.message?.mid ? String(data.message.mid) : null;
          if (mid && processedMids.has(mid)) {
            return;
          }
          if (mid) processedMids.add(mid);

          if (!getTokenPage) {
            logger.warn("[MetaWebhook][TOKEN_NOT_FOUND]", {
              entryId: entry?.id,
              channel,
              object: body.object,
              source,
              companyIdFromParams,
              connectionIdFromParams
            });
            return;
          }

          try {
            await handleMessage(
              getTokenPage,
              data,
              channel,
              getTokenPage.companyId
            );
          } catch (err: any) {
            logger.error("[MetaWebhook] handleMessage falhou", {
              source,
              channel,
              entryId: entry?.id,
              mid,
              error: err?.message || String(err)
            });
          }
        };

        if (Array.isArray(entry.messaging)) {
          for (const data of entry.messaging) {
            await dispatchMessaging(data, "messaging");
          }
        }

        // Standby só se o mid ainda não veio em messaging (evita ticket duplicado).
        if (Array.isArray(entry.standby)) {
          for (const data of entry.standby) {
            await dispatchMessaging(data, "standby");
          }
        }

        // Instagram: messages + comments em entry.changes[]
        if (
          (channel === "instagram" ||
            body.object === "instagram" ||
            Array.isArray(entry.changes)) &&
          Array.isArray(entry.changes)
        ) {
          const findTokenByIds = async (candidateId: string | undefined) => {
            if (!candidateId) return null;

            const tokenInstagram = await (Whatsapp as any).findOne({
              where: {
                facebookPageUserId: String(candidateId),
                channel: "instagram"
              }
            });
            if (tokenInstagram) return tokenInstagram;

            const tokenFacebook = await (Whatsapp as any).findOne({
              where: {
                facebookPageUserId: String(candidateId),
                channel: "facebook"
              }
            });
            if (tokenFacebook) return tokenFacebook;

            return null;
          };

          for (const chg of entry.changes) {
            const commentEvent = parseInstagramCommentChange(chg);
            if (commentEvent) {
              try {
                let igConn =
                  (getTokenPage?.channel === "instagram" ? getTokenPage : null) ||
                  (connectionFromParams?.channel === "instagram"
                    ? connectionFromParams
                    : null) ||
                  (await findTokenByIds(entry?.id));

                if (igConn?.channel !== "instagram") {
                  igConn = await (Whatsapp as any).findOne({
                    where: {
                      facebookPageUserId: String(entry?.id || ""),
                      channel: "instagram"
                    }
                  });
                }

                if (!igConn && companyIdFromParams) {
                  igConn = await (Whatsapp as any).findOne({
                    where: {
                      channel: "instagram",
                      status: "CONNECTED",
                      companyId: companyIdFromParams
                    }
                  });
                }

                if (igConn?.channel === "instagram") {
                  logger.info("[MetaWebhook][IG_COMMENT]", {
                    entryId: entry?.id,
                    commentId: commentEvent.commentId,
                    whatsappId: igConn.id
                  });
                  await handleInstagramCommentAutomation(igConn, commentEvent);
                } else {
                  logger.warn("[MetaWebhook][IG_COMMENT] Sem conexão Instagram", {
                    entryId: entry?.id,
                    commentId: commentEvent.commentId
                  });
                }
              } catch (err: any) {
                logger.error("[MetaWebhook][IG_COMMENT] Falha", {
                  entryId: entry?.id,
                  error: err?.message || String(err)
                });
              }
              continue;
            }

            if (
              (channel !== "instagram" && body.object !== "instagram") ||
              chg?.field !== "messages" ||
              !chg?.value
            ) {
              continue;
            }

            const v = chg.value;
            const messageItems: any[] = Array.isArray(v?.messages)
              ? v.messages
              : [v];

            for (const item of messageItems) {
              const senderId = item?.sender?.id || item?.from?.id || item?.from;
              const recipientId =
                item?.recipient?.id || item?.to?.id || item?.to;
              const timestamp = item?.timestamp;
              const messageObj = item?.message || item?.messages || item;
              const mid =
                messageObj?.mid ||
                messageObj?.id ||
                item?.id ||
                null;

              if (mid && processedMids.has(String(mid))) {
                continue;
              }
              if (mid) processedMids.add(String(mid));

              const token =
                getTokenPage ||
                (connectionFromParams &&
                connectionFromParams.channel === "instagram"
                  ? connectionFromParams
                  : null) ||
                (await findTokenByIds(recipientId)) ||
                (await findTokenByIds(senderId)) ||
                (await findTokenByIds(entry?.id));

              if (!token) {
                logger.warn("[InstagramWebhook][TOKEN_NOT_FOUND]", {
                  entryId: entry?.id,
                  senderId,
                  recipientId,
                  companyIdFromParams,
                  connectionIdFromParams
                });
                continue;
              }

              const normalized = {
                sender: { id: senderId },
                recipient: { id: recipientId },
                timestamp,
                message: {
                  ...(typeof messageObj === "object" && messageObj
                    ? messageObj
                    : { text: messageObj }),
                  mid: mid || messageObj?.mid
                }
              };

              try {
                const textPreview =
                  typeof normalized.message?.text === "string"
                    ? normalized.message.text.slice(0, 60)
                    : null;
                logger.info("[InstagramWebhook]", {
                  entryId: entry?.id,
                  channel: "instagram",
                  senderId,
                  recipientId,
                  tokenFacebookPageUserId: token?.facebookPageUserId,
                  tokenChannel: token?.channel,
                  messageHasText: !!textPreview,
                  messageTextPreview: textPreview
                });
              } catch {
                // ignore
              }

              try {
                await handleMessage(
                  token,
                  normalized,
                  "instagram",
                  companyIdFromParams ?? token.companyId
                );
              } catch (err: any) {
                logger.error("[InstagramWebhook] handleMessage falhou", {
                  entryId: entry?.id,
                  error: err?.message || String(err)
                });
              }
            }
          }
        }
      }

      return res.status(200).json({
        message: "EVENT_RECEIVED"
      });
    }

    return res.status(404).json({
      message: body
    });
  } catch (error) {
    return res.status(500).json({
      message: error
    });
  }
};
