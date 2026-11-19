import Whatsapp from "../../models/Whatsapp";
import logger from "../../utils/logger";
import GetWhatsappWbot from "../../helpers/GetWhatsappWbot";
import ShowTicketService from "../TicketServices/ShowTicketService";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import {
  resolveConnectionAgentFromWhatsapp,
  syntheticPromptIdForAnthropicAgent
} from "../../providers/anthropic/services/resolveConnectionAgent";
import { syncTicketConnectionAgentContext } from "../../helpers/syncTicketConnectionAgentContext";
import {
  runAgentOrchestrator,
  runProviderDirectReplyFallback,
  splitAgentReplyIntoSmartBlocks,
  applyAgentOrchestratorGuardrails
} from "./AgentOrchestratorService";
import { presentStepWithScriptCommands } from "./presentStepWithScriptCommands";
import { extractHashMediaSlugsFromScriptBlock } from "../../helpers/agentScriptInitialSendSlice";
import { processScriptMessage } from "../../helpers/processScriptMessage";
import { sendGeminiImagesToWhatsapp } from "../../providers/gemini/agents/geminiWhatsappMedia";
import { sanitizeAgentCustomerVisibleText } from "../../helpers/sanitizeAgentCustomerVisibleText";
import {
  buildSoftDeclineDeferralReply,
  userExpressesSoftDeclineOrDeferral
} from "../../helpers/assistantUserDeclineIntent";
import { userMessageLooksLikeInventoryQuery } from "../../helpers/inventoryInboundIntent";
import { tryHandleInventoryProductInbound } from "./tryHandleInventoryProductInbound";
import { sendInventoryReplyMedia } from "../../helpers/sendInventoryReplyMedia";
import {
  isAgentOutboundGuardEnabled,
  recordSentOutbound,
  shouldSendOutbound
} from "./AgentOutboundGuard";
import {
  classifyAgentOutbound,
  registerPendingIntents,
  shouldRunSmartActionTriggersForPrompt,
  filterIntentsToEnabledSmartActions
} from "./IntentTriggerEngine";
import { resolvePendingIntents } from "./PendingIntentResolver";
import { tryHandlePromptAttendanceFlowTurn } from "./AttendanceFlowTurnService";
import { markAgentProcessingFinished, markAgentProcessingStarted } from "./AgentProcessingStateService";
import type { AgentInboundJobData } from "./AgentInboundQueueService";
import { AGENT_OUTBOUND_BUBBLE_DELAY_MS, AGENT_OUTBOUND_BUBBLE_MAX_CHARS } from "../../config/openAiDefaults";
import { applyAgentOutboundHumanDelay } from "../../helpers/agentOutboundHumanDelay";
import { deliverTelegramAgentReply } from "../TelegramServices/deliverTelegramAgentReply";
import { deliverLinkedInAgentReply } from "../LinkedInServices/deliverLinkedInAgentReply";
import { deliverMetaAgentReply } from "../FacebookServices/deliverMetaAgentReply";
import { deliverWhatsAppOficialAgentReply } from "../WhatsAppOficial/deliverWhatsAppOficialAgentReply";
import { markTicketUnderAgentAttendance } from "../TicketServices/markTicketUnderAgentAttendance";

async function deliverOrchestratorReply(params: {
  wbot?: any;
  remoteJid?: string;
  ticket: any;
  contact: any;
  prompt: any;
  text: string;
  userText: string;
  retryDepth?: number;
  channel?: string;
  connection?: Whatsapp;
}): Promise<number> {
  if (params.channel === "linkedin" && params.connection) {
    return deliverLinkedInAgentReply({
      connection: params.connection,
      ticket: params.ticket,
      contact: params.contact,
      prompt: params.prompt,
      text: params.text
    });
  }

  if (
    (params.channel === "facebook" || params.channel === "instagram") &&
    params.connection
  ) {
    return deliverMetaAgentReply({
      connection: params.connection,
      ticket: params.ticket,
      contact: params.contact,
      prompt: params.prompt,
      text: params.text
    });
  }

  if (
    (params.channel === "telegram" || params.channel === "telegram_oficial") &&
    params.connection
  ) {
    return deliverTelegramAgentReply({
      connection: params.connection,
      ticket: params.ticket,
      contact: params.contact,
      prompt: params.prompt,
      text: params.text
    });
  }

  if (
    (params.channel === "whatsapp_oficial" ||
      params.channel === "whatsapp_oficial_api") &&
    params.connection
  ) {
    return deliverWhatsAppOficialAgentReply({
      connection: params.connection,
      ticket: params.ticket,
      contact: params.contact,
      prompt: params.prompt,
      text: params.text
    });
  }

  const wbot = params.wbot;
  const remoteJid = String(params.remoteJid || "").trim();
  if (!wbot || !remoteJid) return 0;
  const depth = Number(params.retryDepth || 0);
  const { verifyMessage, verifyMediaMessage, transferQueue } = await import("../WbotServices/wbotMessageListener");

  // Se a reply trouxer #slug de mídia, envia texto+mídia pelo mesmo pipeline do roteiro
  const mediaSlugs = extractHashMediaSlugsFromScriptBlock(String(params.text || ""));
  if (mediaSlugs.length) {
    let sentViaScript = 0;
    try {
      const meta = await presentStepWithScriptCommands({
        stepText: String(params.text || ""),
        stepAttachments: [],
        wbot,
        msg: { key: { remoteJid, id: `orch-${Date.now()}`, fromMe: false } } as any,
        ticket: params.ticket,
        contact: params.contact,
        ticketTraking: undefined,
        prompt: params.prompt,
        verifyMessage,
        verifyMediaMessage,
        sendStepTextBlocks: async (_vm, w, m, t, c, tt, text) => {
          const processed = processScriptMessage(String(text || ""), {
            contact: {
              name: c?.name,
              number: c?.number,
              email: c?.email,
              extraInfo: (c as any)?.extraInfo || null
            },
            ticket: { id: t?.id },
            agentName: params.prompt?.name || "",
            companyName: (t as any)?.company?.name || "",
            now: new Date()
          });
          const clean = applyAgentOrchestratorGuardrails(
            sanitizeAgentCustomerVisibleText(processed),
            { actionConfirmed: false, preserveScriptStructure: true }
          );
          if (!clean) return;
          for (const block of splitAgentReplyIntoSmartBlocks(clean, {
            preserveScriptStructure: true,
            maxBlocks: 20,
            forceSingleBubble: Boolean((params.ticket as any)?.__outboundForceSingleBubble)
          })) {
            const safeBlock = sanitizeAgentCustomerVisibleText(block);
            if (!safeBlock) continue;
            await applyAgentOutboundHumanDelay({
              wbot: w,
              remoteJid,
              prompt: params.prompt,
              text: safeBlock,
              skipResponseDelay: sentViaScript > 0
            });
            const sentMessage = await w.sendMessage(remoteJid, { text: `\u200e ${safeBlock}` });
            await verifyMessage(sentMessage!, t, c, tt, true, false, true);
            sentViaScript += 1;
            await new Promise((r) => setTimeout(r, AGENT_OUTBOUND_BUBBLE_DELAY_MS));
          }
        },
        transferQueue: transferQueue || (async () => undefined),
        deferAgendamentoUntilReply: true
      });
      sentViaScript += (meta.executedCommands || []).filter((c) => c.kind === "media").length;
    } catch (e) {
      logger.warn(`[AGENT-INBOUND-QUEUE] falha ao enviar mídia #slug ticket=${params.ticket.id}`, e as any);
    }
    if ((params.ticket as any)?.__outboundForceSingleBubble) {
      delete (params.ticket as any).__outboundForceSingleBubble;
    }
    if (sentViaScript > 0) {
      await markTicketUnderAgentAttendance(params.ticket);
      return sentViaScript;
    }
  }

  const blocks = splitAgentReplyIntoSmartBlocks(params.text, {
    maxChars: AGENT_OUTBOUND_BUBBLE_MAX_CHARS,
    maxBlocks: 12,
    preserveScriptStructure: true,
    forceSingleBubble: Boolean((params.ticket as any)?.__outboundForceSingleBubble)
  });
  if ((params.ticket as any)?.__outboundForceSingleBubble) {
    delete (params.ticket as any).__outboundForceSingleBubble;
  }
  let sent = 0;
  let blocked = 0;
  const blockedReasons: string[] = [];
  let appliedHumanDelay = false;

  for (const block of blocks) {
    const safeBlock = sanitizeAgentCustomerVisibleText(block);
    if (!safeBlock) continue;
    if (isAgentOutboundGuardEnabled()) {
      const guard = shouldSendOutbound(safeBlock, params.ticket, params.prompt.id);
      if (!guard.send) {
        blocked += 1;
        blockedReasons.push(guard.reason || "blocked");
        logger.info(`[AGENT-INBOUND-QUEUE] outbound guard (${guard.reason}) ticket=${params.ticket.id}`);
        continue;
      }
    }
    await applyAgentOutboundHumanDelay({
      wbot: params.wbot,
      remoteJid,
      prompt: params.prompt,
      text: appliedHumanDelay ? safeBlock : String(params.text || safeBlock),
      skipResponseDelay: appliedHumanDelay
    });
    appliedHumanDelay = true;
    const sentMessage = await params.wbot.sendMessage(params.remoteJid, {
      text: `\u200e ${safeBlock}`
    });
    // isPrivate=false: mensagem vai ao cliente; fromAgent=true pinta bolha azul e move p/ Atendendo
    await verifyMessage(sentMessage!, params.ticket, params.contact, undefined, false, false, true);
    if (isAgentOutboundGuardEnabled()) {
      await recordSentOutbound(safeBlock, params.ticket, params.prompt.id);
    }
    sent += 1;
    if (blocks.length > 1) {
      await new Promise((resolve) => setTimeout(resolve, AGENT_OUTBOUND_BUBBLE_DELAY_MS));
    }
  }

  if (sent === 0 && blocked > 0 && params.userText && depth < 1) {
    const reprocessed = await runAgentOrchestrator({
      prompt: params.prompt,
      ticket: params.ticket,
      contact: params.contact,
      userText: params.userText,
      blockedOutboundContext: {
        blockedReply: params.text,
        reasons: [...new Set(blockedReasons)]
      }
    });
    const llmReply = sanitizeAgentCustomerVisibleText(String(reprocessed.reply || ""));
    if (reprocessed.handled && llmReply) {
      return deliverOrchestratorReply({
        ...params,
        text: llmReply,
        retryDepth: depth + 1
      });
    }
  }

  // Fila inbound não passava por sendSmartAgentTextBlocks — sem isto o ticket
  // fica em Aguardando mesmo com o agente respondendo.
  if (sent > 0) {
    await markTicketUnderAgentAttendance(params.ticket);
  }

  return sent;
}

/**
 * Bull worker for `AgentInboundMessage` — executa o mesmo núcleo LLM-first do `handleOpenAi`
 * (orquestrador + envio + intents), após o listener ter atualizado memória conversacional e
 * enfileirado o job (dedupe por `jobId` / `wid`).
 */
export async function handleAgentInboundMessage(job: { id?: string | number; data: AgentInboundJobData }) {
  const d = job?.data;
  if (
    !d ||
    typeof d.ticketId !== "number" ||
    typeof d.companyId !== "number" ||
    typeof d.promptId !== "number" ||
    typeof d.contactId !== "number" ||
    typeof d.userText !== "string"
  ) {
    logger.warn(`[AGENT-INBOUND-QUEUE] job=${job?.id} ignorado: payload invalido`);
    return;
  }

  const userText = String(d.userText || "").trim();
  if (!userText) {
    logger.warn(`[AGENT-INBOUND-QUEUE] job=${job?.id} ticket=${d.ticketId} sem userText`);
    return;
  }

  let ticket: any;
  try {
    ticket = await ShowTicketService(d.ticketId, d.companyId);
  } catch {
    ticket = null;
  }
  if (!ticket) {
    logger.warn(`[AGENT-INBOUND-QUEUE] job=${job?.id} ticket=${d.ticketId} nao encontrado`);
    return;
  }

  if (ticket.status === "closed" || ticket.status === "nps") {
    logger.info(
      `[AGENT-INBOUND-QUEUE] job=${job?.id} ticket=${d.ticketId} status=${ticket.status}; ignorando`
    );
    return;
  }

  const contact = ticket.contact;
  if (!contact || Number(contact.id) !== Number(d.contactId)) {
    logger.warn(`[AGENT-INBOUND-QUEUE] job=${job?.id} contact inconsistente ticket=${d.ticketId}`);
    return;
  }
  if (contact.disableBot) {
    logger.info(`[AGENT-INBOUND-QUEUE] job=${job?.id} contact=${contact.id} disableBot; ignorando`);
    return;
  }

  const jobChannel = String(d.channel || ticket.channel || "whatsapp").toLowerCase();
  const isTelegram =
    jobChannel === "telegram" || jobChannel === "telegram_oficial";
  const isLinkedIn = jobChannel === "linkedin";
  const isMeta =
    jobChannel === "facebook" || jobChannel === "instagram";
  const isWhatsAppOficial =
    jobChannel === "whatsapp_oficial" ||
    jobChannel === "whatsapp_oficial_api";
  const isAlternateMessaging =
    isTelegram || isLinkedIn || isMeta || isWhatsAppOficial;

  const remoteJid = String(contact.remoteJid || "").trim();
  if (!isAlternateMessaging && !remoteJid) {
    logger.warn(`[AGENT-INBOUND-QUEUE] job=${job?.id} sem remoteJid contact=${contact.id}`);
    return;
  }

  const wa = await Whatsapp.findOne({ where: { id: d.whatsappId, companyId: d.companyId } });
  if (!wa) {
    logger.warn(`[AGENT-INBOUND-QUEUE] job=${job?.id} whatsapp=${d.whatsappId} nao encontrado`);
    return;
  }

  let prompt: any;
  let connectionRef: import("../../providers/anthropic/services/resolveConnectionAgent").ConnectionAgentRef;
  try {
    const whatsappConn = await ShowWhatsAppService(Number(wa.id), d.companyId);
    const resolved = await resolveConnectionAgentFromWhatsapp(whatsappConn, d.companyId);
    if (!resolved) {
      logger.warn(`[AGENT-INBOUND-QUEUE] job=${job?.id} conexao sem agente`);
      return;
    }
    prompt = resolved.prompt;
    connectionRef = resolved.ref;
    const linkedPromptId =
      connectionRef.kind === "anthropic"
        ? syntheticPromptIdForAnthropicAgent(connectionRef.anthropicMultiAgentId)
        : connectionRef.promptId;
    if (Number(linkedPromptId) !== Number(d.promptId)) {
      logger.warn(
        `[AGENT-INBOUND-QUEUE] job=${job?.id} prompt da conexao (${linkedPromptId}) != job (${d.promptId}); abortando`
      );
      return;
    }
  } catch (e: any) {
    logger.warn(`[AGENT-INBOUND-QUEUE] job=${job?.id} falha ao resolver agente: ${e?.message || e}`);
    return;
  }

  let wbot: any = null;
  if (!isAlternateMessaging) {
    try {
      wbot = await GetWhatsappWbot(wa);
    } catch (e: any) {
      logger.warn(`[AGENT-INBOUND-QUEUE] job=${job?.id} sem sessao wbot: ${e?.message || e}`);
      await markAgentProcessingFinished({
        ticket,
        promptId: prompt.id,
        wid: d.wid || null,
        ok: false,
        error: e
      });
      return;
    }
  }

  await syncTicketConnectionAgentContext(ticket, connectionRef);

  await markAgentProcessingStarted({
    ticket,
    promptId: prompt.id,
    wid: d.wid || null,
    userText
  });

  const queueStubMsg = {
    key: { remoteJid: remoteJid || `${contact.number}@telegram`, id: String(d.wid || ""), fromMe: false }
  } as any;

  const deliverParams = {
    channel: isAlternateMessaging ? jobChannel : "whatsapp",
    connection: isAlternateMessaging ? wa : undefined,
    wbot: isAlternateMessaging ? undefined : wbot,
    remoteJid: isAlternateMessaging ? undefined : remoteJid,
    ticket,
    contact,
    prompt
  };

  try {
    if (await shouldRunSmartActionTriggersForPrompt(prompt, ticket)) {
      try {
        const r = await resolvePendingIntents(ticket, contact, prompt, userText);
        if (r.handled) {
          const safeIntentMessage = sanitizeAgentCustomerVisibleText(String(r.message || ""));
          if (safeIntentMessage) {
            await deliverOrchestratorReply({
              ...deliverParams,
              text: safeIntentMessage,
              userText
            });
          }
          try {
            await ticket.reload();
          } catch {
            /* ignore */
          }
          await markAgentProcessingFinished({
            ticket,
            promptId: prompt.id,
            wid: d.wid || null,
            ok: true
          });
          return;
        }
      } catch (e) {
        logger.warn(`[AGENT-INBOUND-QUEUE] intent resolver ticket=${ticket.id}:`, e as any);
      }
    }

    // Inventário early (paridade handleOpenAi) — antes do roteiro
    try {
      const invEarly = await tryHandleInventoryProductInbound({
        prompt,
        ticket,
        contact,
        userText
      });
      if (invEarly.handled && invEarly.reply) {
        const sent = await deliverOrchestratorReply({
          ...deliverParams,
          text: invEarly.reply,
          userText
        });
        if (sent > 0) {
          if (
            !isAlternateMessaging &&
            wbot &&
            remoteJid &&
            (invEarly.media?.images?.length || invEarly.media?.documentUrl)
          ) {
            try {
              const { verifyMediaMessage } = await import(
                "../WbotServices/wbotMessageListener"
              );
              await sendInventoryReplyMedia({
                wbot,
                msg: queueStubMsg,
                ticket,
                contact,
                ticketTraking: undefined,
                verifyMediaMessage,
                images: invEarly.media?.images || [],
                documentUrl: invEarly.media?.documentUrl,
                documentName: invEarly.media?.documentName
              });
            } catch (e) {
              logger.warn(
                `[AGENT-INBOUND-QUEUE] inventory media ticket=${ticket.id}:`,
                e as any
              );
            }
          }
          if (
            isWhatsAppOficial &&
            deliverParams.connection &&
            (invEarly.media?.images?.length || invEarly.media?.documentUrl)
          ) {
            try {
              const {
                buildOficialAttendanceWbot,
                buildOficialStubMsg
              } = await import("../WhatsAppOficial/oficialAgentAttendanceStub");
              const ofcWbot = buildOficialAttendanceWbot({
                connection: deliverParams.connection,
                ticket,
                contact,
                inboundMessageId: String(d.wid || "")
              });
              await sendInventoryReplyMedia({
                wbot: ofcWbot as any,
                msg: buildOficialStubMsg(contact, String(d.wid || "")),
                ticket,
                contact,
                ticketTraking: undefined,
                verifyMediaMessage: async () => undefined,
                images: invEarly.media?.images || [],
                documentUrl: invEarly.media?.documentUrl,
                documentName: invEarly.media?.documentName
              });
            } catch (e) {
              logger.warn(
                `[AGENT-INBOUND-QUEUE] oficial inventory media ticket=${ticket.id}:`,
                e as any
              );
            }
          }
          await markTicketUnderAgentAttendance(ticket);
          await markAgentProcessingFinished({
            ticket,
            promptId: prompt.id,
            wid: d.wid || null,
            ok: true
          });
          return;
        }
      }
      if (userMessageLooksLikeInventoryQuery(userText)) {
        (ticket as any).__inventoryQueryDeferToLlm = true;
      }
    } catch (e) {
      logger.warn(`[AGENT-INBOUND-QUEUE] inventory-early ticket=${ticket.id}:`, e as any);
    }

    if (!isAlternateMessaging && wbot) {
      try {
        const flowEarly = await tryHandlePromptAttendanceFlowTurn({
          wbot,
          msg: queueStubMsg,
          ticket,
          contact,
          ticketTraking: undefined,
          prompt,
          bodyMessage: userText
        });
        if (flowEarly.handled && (flowEarly.sentCount > 0 || flowEarly.actionCount > 0)) {
          if (Number(flowEarly.sentCount) > 0) {
            await markTicketUnderAgentAttendance(ticket);
          }
          await markAgentProcessingFinished({
            ticket,
            promptId: prompt.id,
            wid: d.wid || null,
            ok: true
          });
          return;
        }
        if (flowEarly.consumedReply && flowEarly.allowLlmFallback) {
          logger.warn(
            `[AGENT-INBOUND-QUEUE] ticket ${ticket.id}: fluxo consumiu sem saída (${flowEarly.reason}); seguindo para orquestrador.`
          );
        }
        try {
          await ticket.reload();
        } catch {
          /* ignore */
        }
      } catch (e) {
        logger.warn(`[AGENT-INBOUND-QUEUE] attendance flow ticket=${ticket.id}:`, e as any);
      }
    } else if (isWhatsAppOficial && deliverParams.connection) {
      try {
        const {
          buildOficialAttendanceWbot,
          buildOficialStubMsg
        } = await import("../WhatsAppOficial/oficialAgentAttendanceStub");
        const ofcWbot = buildOficialAttendanceWbot({
          connection: deliverParams.connection,
          ticket,
          contact,
          inboundMessageId: String(d.wid || "")
        });
        const stubMsg = buildOficialStubMsg(contact, String(d.wid || ""));
        if (d.wid) {
          (ticket as any).__lastInboundWamid = String(d.wid);
        }
        const flowEarly = await tryHandlePromptAttendanceFlowTurn({
          wbot: ofcWbot as any,
          msg: stubMsg,
          ticket,
          contact,
          ticketTraking: undefined,
          prompt,
          bodyMessage: userText
        });
        if (
          flowEarly.handled &&
          (Number(flowEarly.sentCount) > 0 || Number(flowEarly.actionCount) > 0)
        ) {
          if (Number(flowEarly.sentCount) > 0) {
            await markTicketUnderAgentAttendance(ticket);
          }
          await markAgentProcessingFinished({
            ticket,
            promptId: prompt.id,
            wid: d.wid || null,
            ok: true
          });
          return;
        }
        if (
          flowEarly.reason === "dedup_inbound" ||
          (flowEarly.consumedReply && flowEarly.allowLlmFallback === false)
        ) {
          await markAgentProcessingFinished({
            ticket,
            promptId: prompt.id,
            wid: d.wid || null,
            ok: true
          });
          return;
        }
        try {
          await ticket.reload();
        } catch {
          /* ignore */
        }
        const { restoreOficialRoteiroLlmFlagsAfterReload } = await import(
          "../WhatsAppOficial/oficialRoteiroParity"
        );
        restoreOficialRoteiroLlmFlagsAfterReload({
          ticket,
          promptId: prompt.id,
          bodyMessage: userText,
          flowEarly
        });
      } catch (e) {
        logger.warn(
          `[AGENT-INBOUND-QUEUE] oficial attendance flow ticket=${ticket.id}:`,
          e as any
        );
      }
    }

    const orchestrated = await runAgentOrchestrator({
      prompt,
      ticket,
      contact,
      userText
    });

    if (orchestrated.handled) {
      let reply = sanitizeAgentCustomerVisibleText(String(orchestrated.reply || ""));
      if (!reply && userExpressesSoftDeclineOrDeferral(userText)) {
        reply = buildSoftDeclineDeferralReply(userText);
        logger.warn(
          `[AGENT-INBOUND-QUEUE] ticket ${ticket.id}: reply vazia após recusa — enviando fallback contextual`
        );
      }
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
            logger.warn(`[AGENT-INBOUND-QUEUE] intent classifier ticket=${ticket.id}:`, e as any);
          }
        }
        await deliverOrchestratorReply({
          ...deliverParams,
          text: reply,
          userText
        });
      }
      if (
        (prompt as any).__llmProvider === "gemini" &&
        orchestrated.geminiImages?.length
      ) {
        if (wbot && !isTelegram && !isWhatsAppOficial) {
          await sendGeminiImagesToWhatsapp({
            wbot,
            msg: queueStubMsg,
            ticket,
            contact,
            companyId: ticket.companyId,
            images: orchestrated.geminiImages,
            caption: reply || undefined
          });
        } else if (isWhatsAppOficial && deliverParams.connection) {
          try {
            const {
              buildOficialAttendanceWbot,
              buildOficialStubMsg
            } = await import("../WhatsAppOficial/oficialAgentAttendanceStub");
            const ofcWbot = buildOficialAttendanceWbot({
              connection: deliverParams.connection,
              ticket,
              contact,
              inboundMessageId: String(d.wid || "")
            });
            await sendGeminiImagesToWhatsapp({
              wbot: ofcWbot as any,
              msg: buildOficialStubMsg(contact, String(d.wid || "")),
              ticket,
              contact,
              companyId: ticket.companyId,
              images: orchestrated.geminiImages,
              caption: reply || undefined
            });
          } catch (e) {
            logger.warn(
              `[AGENT-INBOUND-QUEUE] oficial gemini images ticket=${ticket.id}:`,
              e as any
            );
          }
        }
      }
      await markAgentProcessingFinished({
        ticket,
        promptId: prompt.id,
        wid: d.wid || null,
        ok: true
      });
      return;
    }

    if (
      userExpressesSoftDeclineOrDeferral(userText)
    ) {
      const soft = buildSoftDeclineDeferralReply(userText);
      await deliverOrchestratorReply({
        ...deliverParams,
        text: soft,
        userText
      });
      await markAgentProcessingFinished({
        ticket,
        promptId: prompt.id,
        wid: d.wid || null,
        ok: true
      });
      return;
    }

    if (userMessageLooksLikeInventoryQuery(userText)) {
      try {
        const invLate = await tryHandleInventoryProductInbound({
          prompt,
          ticket,
          contact,
          userText
        });
        const text =
          invLate.reply ||
          "Posso te passar o preço e a disponibilidade. Qual produto você quer consultar?";
        await deliverOrchestratorReply({
          ...deliverParams,
          text,
          userText
        });
        await markTicketUnderAgentAttendance(ticket);
        await markAgentProcessingFinished({
          ticket,
          promptId: prompt.id,
          wid: d.wid || null,
          ok: true
        });
        return;
      } catch (e) {
        logger.warn(`[AGENT-INBOUND-QUEUE] inventory-late ticket=${ticket.id}:`, e as any);
      }
    }

    if (orchestrated.fallbackReason) {
      logger.info(`[AGENT-INBOUND-QUEUE] orchestrator nao assumiu ticket=${ticket.id} reason=${orchestrated.fallbackReason}`);
    }

    if (
      (prompt as any).__llmProvider === "gemini" ||
      (prompt as any).__llmProvider === "anthropic" ||
      (prompt as any).__llmProvider === "grok"
    ) {
      const direct = await runProviderDirectReplyFallback({
        prompt,
        ticket,
        contact,
        userText
      });
      if (direct.handled) {
        const directReply = sanitizeAgentCustomerVisibleText(String(direct.reply || ""));
        if (directReply) {
          await deliverOrchestratorReply({
            ...deliverParams,
            text: directReply,
            userText
          });
        }
        if (direct.geminiImages?.length) {
          if (wbot && !isTelegram && !isWhatsAppOficial) {
            await sendGeminiImagesToWhatsapp({
              wbot,
              msg: queueStubMsg,
              ticket,
              contact,
              companyId: ticket.companyId,
              images: direct.geminiImages,
              caption: directReply || undefined
            });
          } else if (isWhatsAppOficial && deliverParams.connection) {
            try {
              const {
                buildOficialAttendanceWbot,
                buildOficialStubMsg
              } = await import("../WhatsAppOficial/oficialAgentAttendanceStub");
              const ofcWbot = buildOficialAttendanceWbot({
                connection: deliverParams.connection,
                ticket,
                contact,
                inboundMessageId: String(d.wid || "")
              });
              await sendGeminiImagesToWhatsapp({
                wbot: ofcWbot as any,
                msg: buildOficialStubMsg(contact, String(d.wid || "")),
                ticket,
                contact,
                companyId: ticket.companyId,
                images: direct.geminiImages,
                caption: directReply || undefined
              });
            } catch (e) {
              logger.warn(
                `[AGENT-INBOUND-QUEUE] oficial gemini direct ticket=${ticket.id}:`,
                e as any
              );
            }
          }
        }
      }
    }

    await markAgentProcessingFinished({
      ticket,
      promptId: prompt.id,
      wid: d.wid || null,
      ok: true
    });
  } catch (e: any) {
    await markAgentProcessingFinished({
      ticket,
      promptId: prompt.id,
      wid: d.wid || null,
      ok: false,
      error: e
    });
    logger.warn(`[AGENT-INBOUND-QUEUE] erro ticket=${ticket.id}: ${e?.message || e}`);
  }
}
