/**
 * Delay configurável + presença "digitando…" antes do envio das respostas do Agente de IA.
 *
 * Fluxo:
 * 1) Aguarda `prompt.responseDelay` segundos (processamento / espera humanizada).
 * 2) Exibe composing no WhatsApp por tempo proporcional ao tamanho da resposta.
 * 3) Pausa a presença e o caller envia a mensagem.
 */

import delay from "../utils/delay";
import logger from "../utils/logger";

const MAX_RESPONSE_DELAY_MS = 120_000;
const MIN_TYPING_MS = 1_200;
const MAX_TYPING_MS = 8_000;
/** ~38 caracteres/segundo — ritmo natural de digitação no celular. */
const TYPING_CHARS_PER_SEC = 38;

export function resolveAgentResponseDelayMs(prompt: { responseDelay?: number | null } | null | undefined): number {
  const sec = Number(prompt?.responseDelay);
  if (!Number.isFinite(sec) || sec <= 0) return 0;
  return Math.min(Math.floor(sec * 1000), MAX_RESPONSE_DELAY_MS);
}

/** Duração do status "digitando…" proporcional ao tamanho do texto. */
export function computeTypingDurationMs(text: string): number {
  const len = String(text || "").replace(/\u200e/g, "").trim().length;
  if (len <= 0) return MIN_TYPING_MS;
  const ms = Math.round((len / TYPING_CHARS_PER_SEC) * 1000);
  return Math.min(MAX_TYPING_MS, Math.max(MIN_TYPING_MS, ms));
}

export type AgentOutboundHumanDelayParams = {
  wbot: {
    presenceSubscribe?: (jid: string) => Promise<unknown> | unknown;
    sendPresenceUpdate?: (presence: string, jid: string) => Promise<unknown> | unknown;
  };
  remoteJid: string;
  prompt?: { responseDelay?: number | null } | null;
  /** Texto completo (ou bloco) que será enviado — define o tempo de typing. */
  text: string;
  /** Se true, não aplica o delay configurado (ex.: bolhas seguintes). */
  skipResponseDelay?: boolean;
  /** Se true, não exibe composing (apenas delay configurado). */
  skipTyping?: boolean;
};

/**
 * Aguarda o delay do agente e simula digitação no WhatsApp antes do envio.
 */
export async function applyAgentOutboundHumanDelay(
  params: AgentOutboundHumanDelayParams
): Promise<void> {
  const remoteJid = String(params.remoteJid || "").trim();
  if (!remoteJid || !params.wbot) return;

  if (!params.skipResponseDelay) {
    const waitMs = resolveAgentResponseDelayMs(params.prompt);
    if (waitMs > 0) {
      await delay(waitMs);
    }
  }

  if (params.skipTyping) return;

  const typingMs = computeTypingDurationMs(params.text);
  try {
    if (typeof params.wbot.presenceSubscribe === "function") {
      await params.wbot.presenceSubscribe(remoteJid);
    }
  } catch (e: any) {
    logger.debug?.(
      `[AGENT-OUTBOUND-DELAY] presenceSubscribe falhou jid=${remoteJid}: ${e?.message || e}`
    );
  }

  try {
    if (typeof params.wbot.sendPresenceUpdate === "function") {
      await params.wbot.sendPresenceUpdate("composing", remoteJid);
    }
  } catch (e: any) {
    logger.debug?.(
      `[AGENT-OUTBOUND-DELAY] composing falhou jid=${remoteJid}: ${e?.message || e}`
    );
  }

  await delay(typingMs);

  try {
    if (typeof params.wbot.sendPresenceUpdate === "function") {
      await params.wbot.sendPresenceUpdate("paused", remoteJid);
    }
  } catch (e: any) {
    logger.debug?.(
      `[AGENT-OUTBOUND-DELAY] paused falhou jid=${remoteJid}: ${e?.message || e}`
    );
  }
}
