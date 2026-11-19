/** ID de chat/usuário Telegram (preserva sinal negativo em grupos). */
export function normalizeTelegramContactNumber(number: string): string {
  const raw = String(number || "").trim();
  if (!raw) return "";
  const withoutSuffix = raw.split("@")[0].trim();
  if (/^-?\d+$/.test(withoutSuffix)) {
    return withoutSuffix;
  }
  return withoutSuffix.replace(/\D/g, "") || withoutSuffix;
}
