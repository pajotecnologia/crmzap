/**
 * Resposta ao cliente: preserva quebras de linha e não corta cedo demais.
 * Usado pelo orquestrador / FAQ / roteiro antes do split em bolhas WhatsApp.
 */
export function truncateCustomerReply(value: unknown, max = 8000): string {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  const window = text.slice(0, max);
  const para = window.lastIndexOf("\n\n");
  const space = window.lastIndexOf(" ");
  const cut = para > max * 0.5 ? para : space > max * 0.6 ? space : max;
  return text.slice(0, cut).trim();
}
