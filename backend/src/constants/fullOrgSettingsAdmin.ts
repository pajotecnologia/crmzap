/** Contas admin de organização dedicada com a mesma UI de Configurações do admin principal. */
export const FULL_ORG_SETTINGS_ADMIN_EMAILS: readonly string[] = [];

export function isFullOrgSettingsAdminEmail(email?: string | null): boolean {
  const e = String(email || "").trim().toLowerCase();
  return FULL_ORG_SETTINGS_ADMIN_EMAILS.includes(e);
}
