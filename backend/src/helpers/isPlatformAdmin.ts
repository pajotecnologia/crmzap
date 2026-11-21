/** Admin plataforma VB — assinaturas globais, empresas, etc. */
export function isPlatformAdminEmail(email?: string | null): boolean {
  const e = String(email || "").trim().toLowerCase();
  return (
    e === "admin@admin" ||
    e === "admin@admin.com" ||
    e === "admin@local.dev"
  );
}
