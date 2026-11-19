import { normalizeTicketDataWebhook } from "../AgentProactiveServices/agentProactiveTicketState";
import { normalizeAttendanceFlowMemory } from "../../helpers/agentAttendanceFlowMemory";

/**
 * Após ticket.reload no caminho Oficial: restaura flags de side-quest/contexto
 * do roteiro (igual processWhatsAppOficialAgentInbound ↔ Baileys attendance flow).
 */
export function restoreOficialRoteiroLlmFlagsAfterReload(params: {
  ticket: any;
  promptId: number;
  bodyMessage: string;
  flowEarly: {
    allowLlmFallback?: boolean;
    reason?: string;
  } | null;
}): void {
  const { ticket, promptId, bodyMessage, flowEarly } = params;
  if (
    flowEarly?.allowLlmFallback &&
    (flowEarly.reason === "side_quest_llm_fallback" ||
      flowEarly.reason === "script_context_yield_llm" ||
      flowEarly.reason === "script_context_block_start" ||
      flowEarly.reason === "implausible_reply_llm_fallback" ||
      flowEarly.reason === "soft_decline_llm_fallback")
  ) {
    ticket.__sideQuestDeferToLlm = true;
    ticket.__lastUserText = bodyMessage;
    return;
  }
  try {
    const dw = normalizeTicketDataWebhook(ticket.dataWebhook) as any;
    const af = normalizeAttendanceFlowMemory(dw?.attendanceFlow, promptId);
    if (af.pausedForSideQuest) {
      ticket.__sideQuestDeferToLlm = true;
      ticket.__lastUserText = bodyMessage;
      if (af.sideQuestKind) {
        ticket.__pausedSideQuestKind = af.sideQuestKind;
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * Ordem do pipeline Oficial deve espelhar handleOpenAi (Baileys):
 * intents → inventário → roteiro → fila/LLM → soft-decline → inventário late → schedule
 */
export const OFICIAL_AGENT_PIPELINE_ORDER = [
  "intents",
  "inventory_early",
  "attendance_flow",
  "queue_or_llm",
  "soft_decline",
  "inventory_late",
  "schedule_meeting"
] as const;

export function oficialPipelineMatchesBaileys(order: string[]): boolean {
  return (
    order.length === OFICIAL_AGENT_PIPELINE_ORDER.length &&
    order.every((step, i) => step === OFICIAL_AGENT_PIPELINE_ORDER[i])
  );
}
