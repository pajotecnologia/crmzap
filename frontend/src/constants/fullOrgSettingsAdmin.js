/** Contas admin de organização dedicada — mesma UI de Configurações que admin@admin.com, dados só da própria org. */
export const FULL_ORG_SETTINGS_ADMIN_EMAILS = [];

export function isFullOrgSettingsAdminEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  return FULL_ORG_SETTINGS_ADMIN_EMAILS.includes(e);
}

export function isFullOrgSettingsAdmin(user) {
  if (!user) return false;
  return isFullOrgSettingsAdminEmail(user.email);
}

export function isPlatformAdminEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  return e === "admin@admin" || e === "admin@admin.com";
}

/** Conta admin que gerencia planos (aba Configurações → Planos). Manter igual a backend/src/helpers/isPlansAdmin.ts. */
export const PLANS_ADMIN_EMAIL = "admin@local.dev";

export function isPlansAdminEmail(email) {
  return String(email || "").trim().toLowerCase() === PLANS_ADMIN_EMAIL;
}

/** UI de Configurações completa (Identidade Visual, Assinaturas, Planos, Logs, opções super). */
export function hasFullSettingsUi(user) {
  if (!user) return false;
  if (user.super) return true;
  if (isPlatformAdminEmail(user.email)) return true;
  return isFullOrgSettingsAdmin(user);
}
