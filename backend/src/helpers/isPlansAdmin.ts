/** Conta admin que gerencia planos (Configurações → Planos). Manter igual ao frontend (constants/fullOrgSettingsAdmin.js). */
export const PLANS_ADMIN_EMAIL = "admin@local.dev";

export function isPlansAdminEmail(email?: string | null): boolean {
  return String(email || "").trim().toLowerCase() === PLANS_ADMIN_EMAIL;
}
