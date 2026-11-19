/**
 * Paridade Baileys ↔ WhatsApp Oficial (Cloud API).
 * Espelha os passos de handleOpenAi que faltavam no pipeline oficial:
 * inventário early/late, soft-decline, agendamento e imagens Gemini.
 */
import { format } from "date-fns";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";
import Message from "../../models/Message";
import logger from "../../utils/logger";
import { sanitizeAgentCustomerVisibleText } from "../../helpers/sanitizeAgentCustomerVisibleText";
import {
  buildSoftDeclineDeferralReply,
  userExpressesSoftDeclineOrDeferral
} from "../../helpers/assistantUserDeclineIntent";
import { userMessageLooksLikeInventoryQuery } from "../../helpers/inventoryInboundIntent";
import { tryHandleInventoryProductInbound } from "../PromptServices/tryHandleInventoryProductInbound";
import { sendInventoryReplyMedia } from "../../helpers/sendInventoryReplyMedia";
import { deliverWhatsAppOficialAgentReply } from "./deliverWhatsAppOficialAgentReply";
import {
  buildOficialAttendanceWbot,
  buildOficialStubMsg
} from "./oficialAgentAttendanceStub";
import { markTicketUnderAgentAttendance } from "../TicketServices/markTicketUnderAgentAttendance";
import { normalizeTicketDataWebhook } from "../AgentProactiveServices/agentProactiveTicketState";
import { normalizeAttendanceFlowMemory } from "../../helpers/agentAttendanceFlowMemory";
import { buildWhereForConnectionAgentHistory } from "../../helpers/connectionAiMessageHistory";
import { sendGeminiImagesToWhatsapp } from "../../providers/gemini/agents/geminiWhatsappMedia";
import type { GeminiParsedImage } from "../../providers/gemini/utils/parseGeminiResponse";

export type OficialParityCtx = {
  connection: Whatsapp;
  ticket: Ticket;
  contact: Contact;
  prompt: any;
  userText: string;
  messageWid: string;
};

async function noopVerifyMediaMessage(..._args: any[]): Promise<any> {
  return undefined;
}

function buildOficialWbot(ctx: OficialParityCtx) {
  return buildOficialAttendanceWbot({
    connection: ctx.connection,
    ticket: ctx.ticket,
    contact: ctx.contact,
    inboundMessageId: ctx.messageWid
  });
}

function buildStub(ctx: OficialParityCtx) {
  return buildOficialStubMsg(ctx.contact, ctx.messageWid);
}

export async function tryOficialInventoryEarly(
  ctx: OficialParityCtx
): Promise<{ handled: boolean; replied: boolean }> {
  const userText = String(ctx.userText || "").trim();
  if (!userText) return { handled: false, replied: false };

  try {
    const invEarly = await tryHandleInventoryProductInbound({
      prompt: ctx.prompt,
      ticket: ctx.ticket,
      contact: ctx.contact,
      userText
    });

    if (invEarly.handled && invEarly.reply) {
      const n = await deliverWhatsAppOficialAgentReply({
        connection: ctx.connection,
        ticket: ctx.ticket,
        contact: ctx.contact,
        prompt: ctx.prompt,
        text: invEarly.reply
      });
      let delivered = n > 0;
      if (!delivered) {
        const safe = sanitizeAgentCustomerVisibleText(invEarly.reply);
        if (safe) {
          const ofc = buildOficialWbot(ctx);
          const stub = buildStub(ctx);
          await ofc.sendMessage(stub.key.remoteJid!, { text: `\u200e ${safe}` });
          delivered = true;
        }
      }
      if (delivered) {
        try {
          await sendInventoryReplyMedia({
            wbot: buildOficialWbot(ctx) as any,
            msg: buildStub(ctx),
            ticket: ctx.ticket,
            contact: ctx.contact,
            ticketTraking: undefined,
            verifyMediaMessage: noopVerifyMediaMessage,
            images: invEarly.media?.images || [],
            documentUrl: invEarly.media?.documentUrl,
            documentName: invEarly.media?.documentName
          });
        } catch (e) {
          logger.warn(
            `[WA-OFICIAL-AGENT] inventory media early ticket=${ctx.ticket.id}:`,
            e as any
          );
        }
        await markTicketUnderAgentAttendance(ctx.ticket);
        logger.info(
          `[WA-OFICIAL-AGENT] inventory-early ticket=${ctx.ticket.id} reason=${invEarly.reason}`
        );
        return { handled: true, replied: true };
      }
    }

    if (userMessageLooksLikeInventoryQuery(userText)) {
      (ctx.ticket as any).__inventoryQueryDeferToLlm = true;
      logger.info(
        `[WA-OFICIAL-AGENT] inventory query sem saída imediata — cede ao LLM ticket=${ctx.ticket.id}`
      );
    }
  } catch (e) {
    logger.warn(
      `[WA-OFICIAL-AGENT] inventory-early ticket=${ctx.ticket.id}:`,
      e as any
    );
  }

  return { handled: false, replied: false };
}

export async function tryOficialSoftDeclineFallback(
  ctx: OficialParityCtx
): Promise<{ handled: boolean; replied: boolean }> {
  const userText = String(ctx.userText || "").trim();
  if (!userText || !userExpressesSoftDeclineOrDeferral(userText)) {
    return { handled: false, replied: false };
  }
  const soft = buildSoftDeclineDeferralReply(userText);
  const n = await deliverWhatsAppOficialAgentReply({
    connection: ctx.connection,
    ticket: ctx.ticket,
    contact: ctx.contact,
    prompt: ctx.prompt,
    text: soft
  });
  if (n > 0) {
    logger.warn(
      `[WA-OFICIAL-AGENT] soft-decline fallback ticket=${ctx.ticket.id}`
    );
    return { handled: true, replied: true };
  }
  return { handled: true, replied: false };
}

export async function tryOficialInventoryLate(
  ctx: OficialParityCtx
): Promise<{ handled: boolean; replied: boolean }> {
  const userText = String(ctx.userText || "").trim();
  if (!userText || !userMessageLooksLikeInventoryQuery(userText)) {
    return { handled: false, replied: false };
  }

  try {
    const invLate = await tryHandleInventoryProductInbound({
      prompt: ctx.prompt,
      ticket: ctx.ticket,
      contact: ctx.contact,
      userText
    });
    const text =
      invLate.reply ||
      "Posso te passar o preço e a disponibilidade. Qual produto você quer consultar?";
    const n = await deliverWhatsAppOficialAgentReply({
      connection: ctx.connection,
      ticket: ctx.ticket,
      contact: ctx.contact,
      prompt: ctx.prompt,
      text
    });
    let delivered = n > 0;
    if (!delivered) {
      const safe = sanitizeAgentCustomerVisibleText(text);
      if (safe) {
        const ofc = buildOficialWbot(ctx);
        const stub = buildStub(ctx);
        await ofc.sendMessage(stub.key.remoteJid!, { text: `\u200e ${safe}` });
        delivered = true;
      }
    }
    if (delivered) {
      try {
        await sendInventoryReplyMedia({
          wbot: buildOficialWbot(ctx) as any,
          msg: buildStub(ctx),
          ticket: ctx.ticket,
          contact: ctx.contact,
          ticketTraking: undefined,
          verifyMediaMessage: noopVerifyMediaMessage,
          images: invLate.media?.images || [],
          documentUrl: invLate.media?.documentUrl,
          documentName: invLate.media?.documentName
        });
      } catch {
        /* ignore */
      }
      await markTicketUnderAgentAttendance(ctx.ticket);
      logger.info(
        `[WA-OFICIAL-AGENT] inventory-late ticket=${ctx.ticket.id}`
      );
      return { handled: true, replied: true };
    }
  } catch (e) {
    logger.warn(
      `[WA-OFICIAL-AGENT] inventory-late ticket=${ctx.ticket.id}:`,
      e as any
    );
  }

  return { handled: false, replied: false };
}

export async function tryOficialScheduleMeeting(
  ctx: OficialParityCtx
): Promise<{ handled: boolean; replied: boolean }> {
  const userText = String(ctx.userText || "").trim();
  if (!userText) return { handled: false, replied: false };

  try {
    const { tryScheduleMeeting } = await import(
      "../IntegrationsServices/OpenAiService"
    );
    const pastForSchedule = await Message.findAll({
      where: buildWhereForConnectionAgentHistory(ctx.ticket, ctx.prompt.id),
      order: [["createdAt", "ASC"]],
      limit: 80
    });
    const scheduleAttempt = await tryScheduleMeeting(
      userText,
      ctx.ticket,
      ctx.contact,
      pastForSchedule
    );
    if (!scheduleAttempt.handled || !scheduleAttempt.when) {
      return { handled: false, replied: false };
    }

    const when = scheduleAttempt.when;
    const text = `Reunião agendada com sucesso para ${format(
      when,
      "dd/MM/yyyy"
    )} às ${format(when, "HH:mm")}.`;
    const n = await deliverWhatsAppOficialAgentReply({
      connection: ctx.connection,
      ticket: ctx.ticket,
      contact: ctx.contact,
      prompt: ctx.prompt,
      text
    });

    try {
      const flowSteps = [
        ...(((ctx.prompt as any)?.attendanceFlowSteps || []) as any[])
      ].filter((s: any) => s && Number(s.stepNumber) > 0);
      let cargo: any = (ctx.prompt as any)?.cargo;
      if (typeof cargo === "string") {
        try {
          cargo = JSON.parse(cargo);
        } catch {
          cargo = {};
        }
      }
      const fluxoOff = (cargo as any)?.sectionFlags?.fluxoEnabled === false;
      if (flowSteps.length > 0 && !fluxoOff) {
        const base = normalizeTicketDataWebhook(
          (ctx.ticket as any).dataWebhook
        ) as Record<string, unknown>;
        const afPrev = normalizeAttendanceFlowMemory(
          base.attendanceFlow,
          ctx.prompt.id
        );
        const stepNums = flowSteps
          .map((s: any) => Number(s.stepNumber))
          .filter((x: number) => Number.isFinite(x) && x > 0);
        const maxStep = stepNums.length ? Math.max(...stepNums) : 1;
        const completed = stepNums.length
          ? [...new Set(stepNums)].sort((a, b) => a - b)
          : Array.from({ length: maxStep }, (_, i) => i + 1);
        const nextAf = normalizeAttendanceFlowMemory(
          {
            ...afPrev,
            promptId: ctx.prompt.id,
            flowPhase: "completed",
            awaitingUserReply: false,
            lastPresentedStep: maxStep,
            completedSteps: completed,
            answersByStep: {
              ...(afPrev.answersByStep || {}),
              [String(maxStep)]: userText.slice(0, 220)
            }
          },
          ctx.prompt.id
        );
        const nextDw = { ...base, attendanceFlow: nextAf } as Record<
          string,
          unknown
        >;
        await ctx.ticket.update({ dataWebhook: nextDw as any });
        ctx.ticket.setDataValue("dataWebhook", nextDw);
      }
    } catch (e) {
      logger.warn(
        `[WA-OFICIAL-AGENT] sync attendance após schedule ticket=${ctx.ticket.id}`,
        e as any
      );
    }

    if (n > 0) {
      await markTicketUnderAgentAttendance(ctx.ticket);
    }
    logger.info(
      `[WA-OFICIAL-AGENT] reunião agendada ticket=${ctx.ticket.id} ok=${n > 0}`
    );
    return { handled: true, replied: n > 0 };
  } catch (e) {
    logger.warn(
      `[WA-OFICIAL-AGENT] tryScheduleMeeting ticket=${ctx.ticket.id}:`,
      e as any
    );
    return { handled: false, replied: false };
  }
}

export async function tryOficialSendGeminiImages(params: {
  ctx: OficialParityCtx;
  images?: GeminiParsedImage[];
  caption?: string;
}): Promise<number> {
  const images = params.images || [];
  if (!images.length) return 0;
  if (String((params.ctx.prompt as any)?.__llmProvider || "") !== "gemini") {
    return 0;
  }
  try {
    const ofc = buildOficialWbot(params.ctx);
    const stub = buildStub(params.ctx);
    const sent = await sendGeminiImagesToWhatsapp({
      wbot: ofc as any,
      msg: stub,
      ticket: params.ctx.ticket,
      contact: params.ctx.contact,
      companyId: params.ctx.ticket.companyId,
      images,
      caption: params.caption
    });
    if (sent > 0) {
      await markTicketUnderAgentAttendance(params.ctx.ticket);
    }
    return sent;
  } catch (e) {
    logger.warn(
      `[WA-OFICIAL-AGENT] gemini images ticket=${params.ctx.ticket.id}:`,
      e as any
    );
    return 0;
  }
}

/** Soft-decline quando o orquestrador devolve reply vazia (igual handleOpenAi). */
export function softDeclineReplyIfNeeded(
  userText: string,
  reply: string
): string {
  const clean = sanitizeAgentCustomerVisibleText(String(reply || ""));
  if (clean) return clean;
  if (userExpressesSoftDeclineOrDeferral(userText)) {
    return buildSoftDeclineDeferralReply(userText);
  }
  return "";
}
