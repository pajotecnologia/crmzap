import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import ShowPromptService from "../PromptServices/ShowPromptService";
import {
  resolveConnectionAgentFromWhatsapp,
  whatsappHasConnectionAgent,
  isSyntheticAnthropicPromptId
} from "../../providers/anthropic/services/resolveConnectionAgent";
import { isHumanAttendantTicket } from "../../helpers/ticketHumanAccept";
import { onAgentUserInboundText } from "../AgentProactiveServices/onUserInboundAgent";
import { syncTicketConnectionAiContext } from "../../helpers/syncTicketConnectionAiContext";
import { updateAgentConversationalMemory } from "../../helpers/agentConversationalMemory";
import {
  runAgentOrchestrator,
  runProviderDirectReplyFallback
} from "../PromptServices/AgentOrchestratorService";
import {
  markAgentProcessingFinished,
  markAgentProcessingStarted
} from "../PromptServices/AgentProcessingStateService";
import {
  classifyAgentOutbound,
  filterIntentsToEnabledSmartActions,
  registerPendingIntents,
  shouldRunSmartActionTriggersForPrompt
} from "../PromptServices/IntentTriggerEngine";
import { resolvePendingIntents } from "../PromptServices/PendingIntentResolver";
import { sanitizeAgentCustomerVisibleText } from "../../helpers/sanitizeAgentCustomerVisibleText";
import { tryHandlePromptAttendanceFlowTurn } from "../PromptServices/AttendanceFlowTurnService";
import { loadRuntimeFlowStepsForAgent } from "../../helpers/loadRuntimeFlowStepsForAgent";
import { stripAgentFlowScriptTrainingMarkers } from "../../helpers/stripAgentFlowScriptTrainingMarkers";
import { normalizeAttendanceFlowMemory } from "../../helpers/agentAttendanceFlowMemory";
import { normalizeTicketDataWebhook } from "../AgentProactiveServices/agentProactiveTicketState";
import { deliverMetaAgentReply } from "./deliverMetaAgentReply";
import { sendFacebookMessage } from "./sendFacebookMessage";
import { markTicketUnderAgentAttendance } from "../TicketServices/markTicketUnderAgentAttendance";
import Message from "../../models/Message";
import logger from "../../utils/logger";
import OpenAI from "openai";

/** Stub Baileys-like: roteiro visual envia via Graph (IG/FB) e verifyMessage persiste a bolha. */
function buildMetaAttendanceWbot(params: {
  connection: Whatsapp;
  ticket: Ticket;
  contact: Contact;
}) {
  return {
    presenceSubscribe: async () => undefined,
    sendPresenceUpdate: async () => undefined,
    sendMessage: async (_jid: string, content: any) => {
      const raw = String(content?.text || "")
        .replace(/\u200e/g, "")
        .trim();
      const remoteJid = String(params.contact.number || "");
      if (!raw) {
        return {
          key: {
            id: `meta_empty_${Date.now()}`,
            fromMe: true,
            remoteJid
          },
          message: { conversation: "" },
          messageTimestamp: Math.floor(Date.now() / 1000),
          status: 2
        };
      }
      (params.ticket as any).whatsapp = params.connection;
      (params.ticket as any).contact = params.contact;
      const sendResult = await sendFacebookMessage({
        body: raw,
        ticket: params.ticket,
        skipWindowCheck: true
      });
      const mid = String(
        sendResult?.mid ||
          sendResult?.message_id ||
          sendResult?.id ||
          `meta_flow_${Date.now()}_${params.ticket.id}`
      );
      return {
        key: { id: mid, fromMe: true, remoteJid },
        message: { conversation: raw },
        messageTimestamp: Math.floor(Date.now() / 1000),
        status: 2
      };
    }
  };
}

function buildMetaStubMsg(contact: Contact, messageWid: string) {
  return {
    key: {
      remoteJid: String(contact.number || ""),
      id: String(messageWid || `meta_${Date.now()}`),
      fromMe: false
    },
    message: { conversation: "" },
    messageTimestamp: Math.floor(Date.now() / 1000)
  } as any;
}

function buildAgentSystemPrompt(prompt: any): string {
  const parts = [
    String(prompt.prompt || "").trim(),
    String(prompt.attendanceScript || "").trim(),
    String(prompt.role || prompt.cargo || "").trim()
  ].filter(Boolean);
  if (!parts.length) {
    return "Você é um assistente de atendimento. Siga o roteiro e as regras do agente. Responda em português do Brasil.";
  }
  return [
    "Você é o agente de atendimento configurado no CRM.",
    "Siga OBRIGATORIAMENTE o roteiro (etapas), regras gerais e objetivo abaixo.",
    "Não invente identidade genérica ('assistente virtual'). Use o texto/persona do roteiro.",
    "Responda só a etapa atual; não avance várias etapas na mesma mensagem.",
    "",
    parts.join("\n\n")
  ].join("\n");
}

async function runOpenAiMetaDirectReply(params: {
  prompt: any;
  ticket: Ticket;
  contact: Contact;
  userText: string;
}): Promise<string> {
  const apiKey = String(params.prompt?.apiKey || "").trim();
  if (!apiKey) {
    logger.warn(
      `[META-AGENT] OpenAI direct sem apiKey promptId=${params.prompt?.id}`
    );
    return "";
  }
  const openai = new OpenAI({ apiKey });
  const maxMessages = Math.min(Number(params.prompt.maxMessages) || 10, 20);
  const history = await Message.findAll({
    where: { ticketId: params.ticket.id, companyId: params.ticket.companyId },
    order: [["createdAt", "DESC"]],
    limit: maxMessages
  });
  const messagesOpenAi: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [{ role: "system", content: buildAgentSystemPrompt(params.prompt) }];
  for (const message of [...history].reverse()) {
    const line = String(message.body || "")
      .replace(/\u200e/g, "")
      .trim();
    if (!line) continue;
    messagesOpenAi.push({
      role: message.fromMe ? "assistant" : "user",
      content: line
    });
  }
  messagesOpenAi.push({ role: "user", content: params.userText });

  const chat = await openai.chat.completions.create({
    model: String(params.prompt.model || "gpt-4o-mini"),
    messages: messagesOpenAi,
    max_tokens: Number(params.prompt.maxTokens) || 800,
    temperature:
      typeof params.prompt.temperature === "number"
        ? params.prompt.temperature
        : 0.7
  });
  return String(chat?.choices?.[0]?.message?.content || "").trim();
}

/** Último recurso: texto da etapa atual do roteiro (nunca saudação genérica). */
async function replyFromAttendanceScriptStep(params: {
  prompt: any;
  ticket: Ticket;
}): Promise<string> {
  try {
    const steps = await loadRuntimeFlowStepsForAgent({
      fullPrompt: params.prompt,
      promptId: Number(params.prompt.id),
      companyId: params.ticket.companyId
    });
    if (!steps.length) return "";

    const dw = normalizeTicketDataWebhook(
      (params.ticket as any).dataWebhook
    ) as Record<string, any>;
    const af = normalizeAttendanceFlowMemory(
      dw?.attendanceFlow,
      Number(params.prompt.id)
    );
    const stepNum = Math.max(1, Number(af.lastPresentedStep || 0) || 1);
    const step =
      steps.find(s => Number(s.stepNumber) === stepNum) || steps[0];
    const visible = stripAgentFlowScriptTrainingMarkers(
      String(step?.agentPrompt || "")
    );
    return sanitizeAgentCustomerVisibleText(visible);
  } catch (e: any) {
    logger.warn(
      `[META-AGENT] fallback roteiro ticket=${params.ticket.id}: ${e?.message || e}`
    );
    return "";
  }
}

async function generateMetaAgentReplyText(params: {
  prompt: any;
  ticket: Ticket;
  contact: Contact;
  userText: string;
}): Promise<string> {
  const { prompt, ticket, contact, userText } = params;
  const provider = String((prompt as any).__llmProvider || "openai");
  let reply = "";

  try {
    const orchestrated = await runAgentOrchestrator({
      prompt,
      ticket,
      contact,
      userText,
      systemPrompt: buildAgentSystemPrompt(prompt)
    });
    reply = sanitizeAgentCustomerVisibleText(String(orchestrated.reply || ""));
    if (reply) {
      logger.info(
        `[META-AGENT] reply via orchestrator ticket=${ticket.id} provider=${provider}`
      );
      return reply;
    }
    logger.info(
      `[META-AGENT] orchestrator vazio ticket=${ticket.id} reason=${
        orchestrated.fallbackReason || "empty"
      }`
    );
  } catch (e: any) {
    logger.warn(
      `[META-AGENT] orchestrator erro ticket=${ticket.id}: ${e?.message || e}`
    );
  }

  try {
    const direct = await runProviderDirectReplyFallback({
      prompt,
      ticket,
      contact,
      userText,
      systemPrompt: buildAgentSystemPrompt(prompt)
    });
    reply = sanitizeAgentCustomerVisibleText(String(direct.reply || ""));
    if (reply) {
      logger.info(
        `[META-AGENT] reply via direct ${provider} ticket=${ticket.id}`
      );
      return reply;
    }
  } catch (e: any) {
    logger.warn(
      `[META-AGENT] direct ${provider} ticket=${ticket.id}: ${e?.message || e}`
    );
  }

  // OpenAI chat legado (e também quando provider openai sem orquestrador)
  try {
    const openAiReply = await runOpenAiMetaDirectReply({
      prompt,
      ticket,
      contact,
      userText
    });
    reply = sanitizeAgentCustomerVisibleText(openAiReply);
    if (reply) {
      logger.info(`[META-AGENT] reply via openai chat ticket=${ticket.id}`);
      return reply;
    }
  } catch (e: any) {
    logger.warn(
      `[META-AGENT] openai chat ticket=${ticket.id}: ${e?.message || e}`
    );
  }

  const fromScript = await replyFromAttendanceScriptStep({ prompt, ticket });
  if (fromScript) {
    logger.warn(
      `[META-AGENT] usando texto do roteiro (etapa) ticket=${ticket.id}`
    );
    return fromScript;
  }

  logger.error(
    `[META-AGENT] sem resposta LLM nem roteiro ticket=${ticket.id} promptId=${prompt.id}`
  );
  return "";
}

function isAgentProcessingActive(ticket: Ticket): boolean {
  try {
    const dw = normalizeTicketDataWebhook(
      (ticket as any).dataWebhook
    ) as Record<string, any>;
    const processing = dw?.agentState?.processing;
    return processing?.active === true || processing?.status === "processing";
  } catch {
    return false;
  }
}

/**
 * Agente de IA Facebook/Instagram — mesmo roteiro/config de /prompts (igual WhatsApp).
 */
export async function processMetaAgentInbound(params: {
  connection: Whatsapp;
  ticket: Ticket;
  contact: Contact;
  body: string;
  messageWid: string;
  channel?: string;
}): Promise<boolean> {
  const bodyMessage = String(params.body || "").trim();
  const messageWid = String(params.messageWid || "").trim();

  if (!bodyMessage) {
    logger.info(`[META-AGENT] skip sem texto ticket=${params.ticket?.id}`);
    return false;
  }

  let ticket =
    (await Ticket.findByPk(params.ticket.id)) || params.ticket;
  let contact =
    (await Contact.findByPk(params.contact.id)) || params.contact;

  if (contact?.disableBot) {
    logger.info(`[META-AGENT] skip disableBot contact=${contact.id}`);
    return false;
  }
  if (isHumanAttendantTicket(ticket)) {
    logger.info(
      `[META-AGENT] skip humano ticket=${ticket.id} userId=${ticket.userId}`
    );
    return false;
  }

  const status = String(ticket.status || "");
  if (!["pending", "open", "chatbot"].includes(status)) {
    logger.info(`[META-AGENT] skip status=${status} ticket=${ticket.id}`);
    return false;
  }

  if (isAgentProcessingActive(ticket)) {
    logger.info(
      `[META-AGENT] já processando ticket=${ticket.id} — evita duplicar`
    );
    return false;
  }

  let whatsappConn: Whatsapp = params.connection;
  try {
    whatsappConn = await ShowWhatsAppService(
      params.connection.id,
      ticket.companyId
    );
  } catch (e: any) {
    logger.warn(
      `[META-AGENT] ShowWhatsAppService falhou id=${params.connection.id}: ${e?.message}`
    );
    whatsappConn =
      (await Whatsapp.findByPk(params.connection.id)) || params.connection;
  }

  if (!whatsappHasConnectionAgent(whatsappConn)) {
    logger.info(
      `[META-AGENT] conexão sem agente whatsappId=${whatsappConn.id}`
    );
    return false;
  }

  let prompt: any;
  let llmProvider = "openai";
  try {
    const resolved = await resolveConnectionAgentFromWhatsapp(
      whatsappConn,
      ticket.companyId
    );
    if (!resolved?.prompt) {
      logger.warn(`[META-AGENT] resolve sem prompt ticket=${ticket.id}`);
      return false;
    }
    llmProvider =
      resolved.llmProvider ||
      (resolved.prompt as any).__llmProvider ||
      "openai";

    // Prompt completo do editor (roteiro/etapas/regras) + apiKey/provider do resolve.
    // Agentes Claude multi-agent usam id sintético — não buscar em Prompts.
    if (!isSyntheticAnthropicPromptId(Number(resolved.prompt.id))) {
      try {
        const full = await ShowPromptService({
          promptId: resolved.prompt.id,
          companyId: ticket.companyId
        });
        const plain =
          typeof (full as any).get === "function"
            ? (full as any).get({ plain: true })
            : { ...(full as any) };
        prompt = {
          ...plain,
          apiKey: resolved.prompt.apiKey || plain.apiKey,
          model: resolved.prompt.model || plain.model,
          __llmProvider: llmProvider,
          __anthropicMultiAgentId: (resolved.prompt as any)
            .__anthropicMultiAgentId
        };
      } catch {
        prompt = {
          ...resolved.prompt,
          __llmProvider: llmProvider
        };
      }
    } else {
      prompt = {
        ...resolved.prompt,
        __llmProvider: llmProvider
      };
    }
  } catch (e: any) {
    logger.error(
      `[META-AGENT] resolve agente ticket=${ticket.id}: ${e?.message || e}`
    );
    return false;
  }

  try {
    await ticket.update({
      status:
        status === "pending" || status === "chatbot" ? "open" : ticket.status,
      useIntegration: true,
      isBot: true,
      queueId: null,
      userId: null,
      whatsappId: ticket.whatsappId || whatsappConn.id
    });
    await ticket.reload();
  } catch (e: any) {
    logger.warn(
      `[META-AGENT] ticket state ticket=${ticket.id}: ${e?.message || e}`
    );
  }

  (ticket as any).whatsapp = whatsappConn;
  (ticket as any).contact = contact;
  (ticket as any).promptId = prompt.id;
  (ticket as any).__agentOutboundPrompt = prompt;

  try {
    await onAgentUserInboundText(ticket, bodyMessage);
  } catch {
    /* ignore */
  }

  try {
    await syncTicketConnectionAiContext(ticket, prompt.id);
  } catch (e: any) {
    logger.warn(
      `[META-AGENT] sync context ticket=${ticket.id}: ${e?.message || e}`
    );
  }

  try {
    await updateAgentConversationalMemory({
      ticket,
      promptId: prompt.id,
      userText: bodyMessage
    });
  } catch (e) {
    logger.warn(
      `[META-AGENT] memória conversacional ticket=${ticket.id}:`,
      e as any
    );
  }

  const channel = String(
    params.channel || whatsappConn.channel || ticket.channel || "instagram"
  ).toLowerCase();

  logger.info(
    `[META-AGENT] processando ticket=${ticket.id} channel=${channel} promptId=${prompt.id} provider=${llmProvider} recipient=${contact.number} hasScript=${Boolean(
      String(prompt.attendanceScript || "").trim() ||
        (Array.isArray(prompt.attendanceFlowSteps) &&
          prompt.attendanceFlowSteps.length)
    )}`
  );

  await markAgentProcessingStarted({
    ticket,
    promptId: prompt.id,
    wid: messageWid || null,
    userText: bodyMessage
  });

  let replied = false;
  try {
    if (await shouldRunSmartActionTriggersForPrompt(prompt, ticket)) {
      try {
        const r = await resolvePendingIntents(
          ticket,
          contact,
          prompt,
          bodyMessage
        );
        if (r.handled) {
          const safeIntentMessage = sanitizeAgentCustomerVisibleText(
            String(r.message || "")
          );
          if (safeIntentMessage) {
            const n = await deliverMetaAgentReply({
              connection: whatsappConn,
              ticket,
              contact,
              prompt,
              text: safeIntentMessage
            });
            replied = n > 0;
            await markAgentProcessingFinished({
              ticket,
              promptId: prompt.id,
              wid: messageWid || null,
              ok: replied
            });
            return replied;
          }
          logger.warn(
            `[META-AGENT] intent handled sem texto ticket=${ticket.id} — segue roteiro/LLM`
          );
        }
      } catch (e) {
        logger.warn(`[META-AGENT] intents ticket=${ticket.id}:`, e as any);
      }
    }

    // 1) Roteiro visual (mesmas etapas do editor /prompts) — igual WhatsApp.
    try {
      const metaWbot = buildMetaAttendanceWbot({
        connection: whatsappConn,
        ticket,
        contact
      });
      const stubMsg = buildMetaStubMsg(contact, messageWid);
      const flowEarly = await tryHandlePromptAttendanceFlowTurn({
        wbot: metaWbot as any,
        msg: stubMsg,
        ticket,
        contact,
        ticketTraking: undefined,
        prompt,
        bodyMessage
      });
      if (
        flowEarly.handled &&
        (Number(flowEarly.sentCount) > 0 || Number(flowEarly.actionCount) > 0)
      ) {
        if (Number(flowEarly.sentCount) > 0) {
          await markTicketUnderAgentAttendance(ticket);
        }
        logger.info(
          `[META-AGENT] roteiro enviou ticket=${ticket.id} sent=${flowEarly.sentCount} reason=${flowEarly.reason}`
        );
        await markAgentProcessingFinished({
          ticket,
          promptId: prompt.id,
          wid: messageWid || null,
          ok: true
        });
        return true;
      }
      if (flowEarly.consumedReply && flowEarly.allowLlmFallback) {
        logger.info(
          `[META-AGENT] roteiro cedeu ao LLM ticket=${ticket.id} reason=${flowEarly.reason}`
        );
      }
      try {
        await ticket.reload();
      } catch {
        /* ignore */
      }
    } catch (flowErr: any) {
      logger.warn(
        `[META-AGENT] attendance flow ticket=${ticket.id}: ${
          flowErr?.message || flowErr
        }`
      );
    }

    // 2) LLM (OpenAI/Claude/Gemini/Grok) com system = config do agente.
    const reply = await generateMetaAgentReplyText({
      prompt,
      ticket,
      contact,
      userText: bodyMessage
    });

    if (reply) {
      if (await shouldRunSmartActionTriggersForPrompt(prompt, ticket)) {
        try {
          const cls = await classifyAgentOutbound(reply, prompt, ticket);
          const enabledIntents = await filterIntentsToEnabledSmartActions(
            cls.intents,
            prompt,
            ticket.companyId
          );
          if (enabledIntents.length) {
            await registerPendingIntents(ticket, enabledIntents);
          }
        } catch (e) {
          logger.warn(`[META-AGENT] classifier ticket=${ticket.id}:`, e as any);
        }
      }

      const n = await deliverMetaAgentReply({
        connection: whatsappConn,
        ticket,
        contact,
        prompt,
        text: reply
      });
      replied = n > 0;
      logger.info(
        `[META-AGENT] enviado ticket=${ticket.id} bubbles=${n} channel=${channel}`
      );
    }

    await markAgentProcessingFinished({
      ticket,
      promptId: prompt.id,
      wid: messageWid || null,
      ok: replied
    });
  } catch (e: any) {
    await markAgentProcessingFinished({
      ticket,
      promptId: prompt.id,
      wid: messageWid || null,
      ok: false,
      error: e
    });
    logger.error(`[META-AGENT] erro ticket=${ticket.id}: ${e?.message || e}`);
  }

  return replied;
}
