/**
 * Política de integrações para contas FREE_TRIAL.
 * Bloqueados: Google*, API Pajo.
 * Permitidos (canais demo): WhatsApp Web, WhatsApp Oficial, Telegram, Facebook, Instagram
 * + provedores de IA (GPT/Claude/Gemini/Grok) para o onboarding.
 */

export const FREE_TRIAL_ALLOWED_INTEGRATION_KEYS = [
  "whatsapp-web",
  "whatsapp-oficial",
  "telegram-bot",
  "telegram-oficial",
  "telegram",
  "facebook",
  "instagram",
  "openai",
  "claude",
  "gemini",
  "grok"
] as const;

export const FREE_TRIAL_BLOCKED_INTEGRATION_KEYS = [
  "google-drive",
  "google-sheets",
  "google-calendar",
  "google",
  "gmail",
  "vbsolution-api",
  "platform-api"
] as const;

const BLOCKED_SET = new Set(
  FREE_TRIAL_BLOCKED_INTEGRATION_KEYS.map(k => k.toLowerCase())
);
const ALLOWED_SET = new Set(
  FREE_TRIAL_ALLOWED_INTEGRATION_KEYS.map(k => k.toLowerCase())
);

export function normalizeIntegrationKey(key: string): string {
  return String(key || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}

export function isIntegrationBlockedForFreeTrial(key: string): boolean {
  const k = normalizeIntegrationKey(key);
  if (!k) return true;
  if (k.startsWith("google")) return true;
  if (BLOCKED_SET.has(k)) return true;
  if (k.includes("vbsolution-api") || k.includes("platform-api")) return true;
  return false;
}

export function isIntegrationAllowedForFreeTrial(key: string): boolean {
  const k = normalizeIntegrationKey(key);
  if (isIntegrationBlockedForFreeTrial(k)) return false;
  return ALLOWED_SET.has(k);
}

export function filterIntegrationsForFreeTrial<T extends { key?: string; id?: string; provider?: string }>(
  items: T[]
): T[] {
  return (items || []).filter(item => {
    const key = item.key || item.id || item.provider || "";
    return isIntegrationAllowedForFreeTrial(String(key));
  });
}

export function assertIntegrationAllowedForFreeTrial(key: string): void {
  if (isIntegrationBlockedForFreeTrial(key) || !isIntegrationAllowedForFreeTrial(key)) {
    const err: any = new Error("ERR_FREE_TRIAL_INTEGRATION_FORBIDDEN");
    err.statusCode = 403;
    throw err;
  }
}
