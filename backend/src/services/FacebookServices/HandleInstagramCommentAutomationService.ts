import Mustache from "mustache";
import OpenAI from "openai";
import { FlowBuilderModel } from "../../models/FlowBuilder";
import Whatsapp from "../../models/Whatsapp";
import { resolveOpenAiApiKey } from "../AiBrainServices/openAiBrainCredentials";
import logger from "../../utils/logger";
import {
  replyToInstagramComment,
  sendInstagramPrivateReply
} from "./graphAPI";
import { INSTAGRAM_LOGIN_PROVIDER } from "./instagramLoginAPI";

export type InstagramCommentEvent = {
  commentId: string;
  text: string;
  fromId?: string;
  fromUsername?: string;
  mediaId?: string;
  parentId?: string;
};

const processedCommentIds = new Set<string>();
const MAX_DEDUP = 5000;

const rememberComment = (id: string): boolean => {
  const key = String(id || "").trim();
  if (!key) return false;
  if (processedCommentIds.has(key)) return false;
  processedCommentIds.add(key);
  if (processedCommentIds.size > MAX_DEDUP) {
    const first = processedCommentIds.values().next().value;
    if (first) processedCommentIds.delete(first);
  }
  return true;
};

const extractFirstMessageText = (flowData: any): string => {
  const nodes = Array.isArray(flowData?.nodes) ? flowData.nodes : [];
  const messageNode = nodes.find(
    (n: any) => n?.type === "message" && String(n?.data?.label || "").trim()
  );
  return String(messageNode?.data?.label || "").trim();
};

const extractIgCommentKeyword = (flowData: any): string =>
  String(flowData?.meta?.igCommentKeyword || "").trim();

const textMatchesKeyword = (text: string, keyword: string): boolean => {
  const needle = String(keyword || "").trim().toLowerCase();
  if (!needle) return true;
  return String(text || "")
    .toLowerCase()
    .includes(needle);
};

const renderTemplate = (
  template: string,
  vars: Record<string, string>
): string => {
  try {
    return Mustache.render(template, vars);
  } catch {
    return template
      .replace(/\{\{\s*comment\s*\}\}/gi, vars.comment || "")
      .replace(/\{\{\s*username\s*\}\}/gi, vars.username || "")
      .replace(/\{\{\s*name\s*\}\}/gi, vars.name || "");
  }
};

const generateAiReply = async (
  companyId: number,
  systemPrompt: string,
  commentText: string,
  username: string
): Promise<string | null> => {
  try {
    const apiKey = await resolveOpenAiApiKey(companyId);
    if (!apiKey) {
      logger.warn("[IgCommentAutomation] Sem API key OpenAI; usa texto do fluxo");
      return null;
    }
    const openai = new OpenAI({ apiKey });
    const chat = await openai.chat.completions.create({
      model: process.env.OPENAI_COMMENT_MODEL || "gpt-4o-mini",
      temperature: 0.6,
      max_tokens: 280,
      messages: [
        {
          role: "system",
          content:
            systemPrompt ||
            "Você responde comentários públicos do Instagram pela marca. Seja breve, cordial e em português do Brasil. Não invente promoções."
        },
        {
          role: "user",
          content: `Usuário: @${username || "cliente"}\nComentário: ${commentText}`
        }
      ]
    });
    const out = String(chat.choices?.[0]?.message?.content || "").trim();
    return out || null;
  } catch (err: any) {
    logger.error("[IgCommentAutomation] Falha OpenAI", {
      error: err?.message || String(err)
    });
    return null;
  }
};

const loadFlow = async (
  connection: Whatsapp,
  flowId: number
): Promise<{ flowData: any; flow: FlowBuilderModel } | null> => {
  const flow = await FlowBuilderModel.findOne({
    where: { id: flowId, company_id: connection.companyId, active: true }
  });
  if (!flow) {
    logger.warn("[IgCommentAutomation] Fluxo não encontrado", { flowId });
    return null;
  }
  return { flow, flowData: (flow as any).flow || {} };
};

const resolveOutboundText = async (
  connection: Whatsapp,
  flowData: any,
  event: InstagramCommentEvent
): Promise<{ text: string; useAi: boolean } | null> => {
  const useAi = Boolean(flowData?.meta?.igCommentUseAi);
  const template = extractFirstMessageText(flowData);
  const vars = {
    comment: event.text || "",
    username: event.fromUsername || "",
    name: event.fromUsername || "cliente"
  };

  if (useAi) {
    const ai = await generateAiReply(
      connection.companyId,
      template,
      event.text,
      event.fromUsername || ""
    );
    if (ai) return { text: ai, useAi: true };
  }

  const text = renderTemplate(
    template || "Obrigada pelo comentário! Já te respondo por aqui.",
    vars
  );
  return { text, useAi };
};

const metaSendOpts = (connection: Whatsapp) => ({
  provider: connection.provider || null,
  igUserId: connection.facebookPageUserId || "me"
});

/**
 * Dispara automações de comentário Instagram ligadas à conexão.
 * - flowIdIgCommentReply → resposta pública
 * - flowIdIgCommentDm → private reply (DM)
 *
 * Palavra-chave (meta.igCommentKeyword): case-insensitive contains.
 * Se o fluxo de DM tem keyword e o comentário bate, a resposta pública
 * sem keyword é pulada (screencast: GUIA → só DM; outro texto → só reply).
 */
export const handleInstagramCommentAutomation = async (
  connection: Whatsapp,
  event: InstagramCommentEvent
): Promise<void> => {
  if (!connection || connection.channel !== "instagram") return;
  if (!event?.commentId) return;

  // Ignora respostas aninhadas (reply-to-reply) — só comentários de topo.
  if (event.parentId) {
    logger.info("[IgCommentAutomation] Ignora reply aninhado", {
      commentId: event.commentId,
      parentId: event.parentId
    });
    return;
  }

  // Ignora respostas da própria página (evita loop).
  if (
    event.fromId &&
    String(event.fromId) === String(connection.facebookPageUserId || "")
  ) {
    return;
  }

  if (!rememberComment(event.commentId)) {
    logger.info("[IgCommentAutomation] Comentário já processado", {
      commentId: event.commentId
    });
    return;
  }

  const token = connection.facebookUserToken;
  if (!token) {
    logger.warn("[IgCommentAutomation] Sem token na conexão", {
      whatsappId: connection.id
    });
    return;
  }

  const opts = metaSendOpts(connection);
  const isIgLogin = String(connection.provider || "") === INSTAGRAM_LOGIN_PROVIDER;

  const dmFlow = connection.flowIdIgCommentDm
    ? await loadFlow(connection, connection.flowIdIgCommentDm)
    : null;
  const replyFlow = connection.flowIdIgCommentReply
    ? await loadFlow(connection, connection.flowIdIgCommentReply)
    : null;

  const dmKeyword = dmFlow ? extractIgCommentKeyword(dmFlow.flowData) : "";
  const replyKeyword = replyFlow
    ? extractIgCommentKeyword(replyFlow.flowData)
    : "";

  const dmKeywordMatch =
    Boolean(dmFlow) && textMatchesKeyword(event.text, dmKeyword);
  const replyKeywordMatch =
    Boolean(replyFlow) && textMatchesKeyword(event.text, replyKeyword);

  // GUIA (DM com keyword) não deve disparar reply público sem keyword.
  const skipReplyForDmKeyword =
    Boolean(dmKeyword) && dmKeywordMatch && !replyKeyword;

  // DM sem keyword: dispara sempre (compat). DM com keyword: só se match.
  const runDm = Boolean(dmFlow) && (dmKeyword ? dmKeywordMatch : true);

  const runReply =
    Boolean(replyFlow) &&
    (replyKeyword ? replyKeywordMatch : true) &&
    !skipReplyForDmKeyword;

  logger.info("[IgCommentAutomation] Evento", {
    whatsappId: connection.id,
    commentId: event.commentId,
    hasReplyFlow: !!replyFlow,
    hasDmFlow: !!dmFlow,
    dmKeyword: dmKeyword || null,
    replyKeyword: replyKeyword || null,
    runDm,
    runReply,
    provider: connection.provider,
    isIgLogin,
    textPreview: String(event.text || "").slice(0, 80)
  });

  if (runReply && replyFlow) {
    try {
      const resolved = await resolveOutboundText(
        connection,
        replyFlow.flowData,
        event
      );
      if (resolved?.text) {
        await replyToInstagramComment(
          event.commentId,
          resolved.text,
          token,
          opts
        );
        logger.info("[IgCommentAutomation] Resposta pública enviada", {
          commentId: event.commentId,
          useAi: resolved.useAi
        });
      }
    } catch (err: any) {
      logger.error("[IgCommentAutomation] Falha resposta pública", {
        commentId: event.commentId,
        error: err?.response?.data || err?.message || String(err)
      });
    }
  }

  if (runDm && dmFlow) {
    try {
      const resolved = await resolveOutboundText(
        connection,
        dmFlow.flowData,
        event
      );
      if (resolved?.text) {
        await sendInstagramPrivateReply(
          event.commentId,
          resolved.text,
          token,
          opts
        );
        logger.info("[IgCommentAutomation] Private reply (DM) enviada", {
          commentId: event.commentId,
          useAi: resolved.useAi
        });
      }
    } catch (err: any) {
      logger.error("[IgCommentAutomation] Falha private reply", {
        commentId: event.commentId,
        error: err?.response?.data || err?.message || String(err)
      });
    }
  }
};

export const parseInstagramCommentChange = (
  change: any
): InstagramCommentEvent | null => {
  if (!change) return null;
  const field = String(change.field || "").toLowerCase();
  if (field !== "comments" && field !== "comment") return null;

  const v = change.value || {};
  const commentId = String(v.id || v.comment_id || "").trim();
  if (!commentId) return null;

  const text = String(v.text || v.message || "").trim();
  const from = v.from || {};
  const media = v.media || {};

  return {
    commentId,
    text,
    fromId: from.id ? String(from.id) : undefined,
    fromUsername: from.username ? String(from.username) : undefined,
    mediaId: media.id ? String(media.id) : undefined,
    parentId: v.parent_id ? String(v.parent_id) : undefined
  };
};

export default handleInstagramCommentAutomation;
