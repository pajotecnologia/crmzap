import cache from "../../libs/cache";
import logger from "../../utils/logger";

const memoryLocks = new Map<string, number>();

/**
 * Claim exclusivo do agente Oficial por wamid — DEPOIS do ticket criado.
 * Evita HTTP+socket / retry Meta / multi-instância duplicarem a resposta.
 */
export async function tryClaimOficialAgentInbound(
  companyId: number,
  wamid: string
): Promise<boolean> {
  const wid = String(wamid || "").trim();
  if (!wid) return true;

  const key = `waofc:agent:${companyId}:${wid}`;
  const now = Date.now();

  const memUntil = memoryLocks.get(key) || 0;
  if (memUntil > now) {
    logger.info(`[WA-OFICIAL] agent claim memória skip wid=${wid}`);
    return false;
  }
  memoryLocks.set(key, now + 180_000);
  if (memoryLocks.size > 5000) {
    for (const [k, exp] of memoryLocks) {
      if (exp <= now) memoryLocks.delete(k);
    }
  }

  try {
    const redis = cache.getRedisInstance();
    // ioredis: SET key value EX seconds NX → "OK" | null
    const ok = await redis.set(key, "1", "EX", 180, "NX");
    if (ok === null) {
      logger.info(`[WA-OFICIAL] agent claim redis skip wid=${wid}`);
      return false;
    }
  } catch (e: any) {
    logger.warn(
      `[WA-OFICIAL] agent claim redis falhou (usa memória): ${e?.message || e}`
    );
  }

  return true;
}
