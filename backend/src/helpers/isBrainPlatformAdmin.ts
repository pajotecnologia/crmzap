/** Conta plataforma VB — acesso global a logs/custos Brain.AI */
export function isBrainPlatformAdminEmail(email?: string | null): boolean {
  const e = String(email || "").trim().toLowerCase();
  return e === "admin@admin" || e === "admin@admin.com";
}

export function assertBrainPlatformAdminEmail(email?: string | null): void {
  if (!isBrainPlatformAdminEmail(email)) {
    throw new Error("ERR_BRAIN_PLATFORM_ADMIN_ONLY");
  }
}
