import Ticket from "../../models/Ticket";
import logger from "../../utils/logger";
import { normalizeTicketDataWebhook } from "../AgentProactiveServices/agentProactiveTicketState";

type ProcessingStatus = "processing" | "completed" | "failed";

/** Lock de processamento considerado órfão após este tempo (evita silêncio eterno). */
export const AGENT_PROCESSING_STALE_MS = 120_000;

function buildPatch(ticket: Ticket, patch: Record<string, unknown>): Record<string, unknown> {
  const base = normalizeTicketDataWebhook((ticket as any).dataWebhook) as Record<string, any>;
  const agentState = base.agentState && typeof base.agentState === "object" ? base.agentState : {};
  return {
    ...base,
    agentState: {
      ...agentState,
      processing: {
        ...(agentState.processing && typeof agentState.processing === "object"
          ? agentState.processing
          : {}),
        ...patch,
        updatedAt: new Date().toISOString()
      }
    }
  };
}

async function updateProcessing(ticket: Ticket, patch: Record<string, unknown>): Promise<void> {
  try {
    const next = buildPatch(ticket, patch);
    await ticket.update({ dataWebhook: next as any });
    ticket.setDataValue("dataWebhook", next as any);
  } catch (error: any) {
    logger.warn(
      `[AGENT-PROCESSING] falha ao atualizar estado ticket=${ticket.id}: ${
        error?.message || error
      }`
    );
  }
}

/**
 * True se há lock ativo e NÃO está stale.
 * Lock órfão (startedAt antigo) não bloqueia o próximo turno.
 */
export function isAgentProcessingLockActive(
  dataWebhook: unknown,
  opts?: { nowMs?: number; staleMs?: number }
): boolean {
  try {
    const dw = normalizeTicketDataWebhook(dataWebhook) as Record<string, any>;
    const processing = dw?.agentState?.processing;
    if (!processing) return false;
    const active =
      processing.active === true || processing.status === "processing";
    if (!active) return false;

    const staleMs = Number(opts?.staleMs ?? AGENT_PROCESSING_STALE_MS);
    const now = Number(opts?.nowMs ?? Date.now());
    const startedAt = Date.parse(
      String(processing.startedAt || processing.updatedAt || "")
    );
    if (!Number.isFinite(startedAt)) {
      // Sem timestamp: não trava o agente para sempre
      return false;
    }
    if (now - startedAt > staleMs) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Se o lock estiver stale, limpa active=false para o ticket voltar a responder. */
export async function clearStaleAgentProcessingLock(params: {
  ticket: Ticket;
  staleMs?: number;
}): Promise<boolean> {
  const dw = normalizeTicketDataWebhook((params.ticket as any).dataWebhook);
  const processing = (dw as any)?.agentState?.processing;
  const looksActive =
    processing?.active === true || processing?.status === "processing";
  if (!looksActive) return false;

  if (
    isAgentProcessingLockActive(dw, {
      staleMs: params.staleMs
    })
  ) {
    return false;
  }

  await updateProcessing(params.ticket, {
    active: false,
    status: "failed" as ProcessingStatus,
    error: "stale_processing_lock_cleared",
    finishedAt: new Date().toISOString()
  });
  logger.warn(
    `[AGENT-PROCESSING] lock stale limpo ticket=${params.ticket.id}`
  );
  return true;
}

export async function markAgentProcessingStarted(params: {
  ticket: Ticket;
  promptId: number;
  wid?: string | null;
  userText?: string;
}): Promise<void> {
  await updateProcessing(params.ticket, {
    active: true,
    status: "processing" as ProcessingStatus,
    promptId: params.promptId,
    wid: params.wid || null,
    startedAt: new Date().toISOString(),
    lastUserTextPreview: String(params.userText || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 220),
    error: null
  });
}

export async function markAgentProcessingFinished(params: {
  ticket: Ticket;
  promptId: number;
  wid?: string | null;
  ok: boolean;
  error?: unknown;
}): Promise<void> {
  await updateProcessing(params.ticket, {
    active: false,
    status: (params.ok ? "completed" : "failed") as ProcessingStatus,
    promptId: params.promptId,
    wid: params.wid || null,
    finishedAt: new Date().toISOString(),
    error: params.ok
      ? null
      : String(
          (params.error as any)?.message ||
            params.error ||
            "agent_processing_failed"
        ).slice(0, 500)
  });
}
