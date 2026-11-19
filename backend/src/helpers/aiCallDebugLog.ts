import logger from "../utils/logger";
import Ticket from "../models/Ticket";

/**
 * Rastreio de chamadas ao modelo: `__line` não existe em Node/TS; use `source` estável (arquivo:função).
 */
export function logAiCallDebug(
  source: string,
  ticket: Ticket | null | undefined,
  systemPromptUsed: unknown
): void {
  logger.info(
    `[AI_CALL] source=${source} ticketId=${ticket?.id ?? "n/a"} prompt=${JSON.stringify(systemPromptUsed).slice(0, 200)}`
  );
}
