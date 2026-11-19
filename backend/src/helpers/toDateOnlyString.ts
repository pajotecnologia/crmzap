/**
 * Normaliza qualquer valor de data (Date, ISO, DATEONLY) para `YYYY-MM-DD`.
 * Evita o bug clássico de `String(date).slice(0, 10)` → `"Sun Mar 01"` (exibe como 2001).
 */
export function toDateOnlyString(value: unknown): string | null {
  if (value == null || value === "") return null;

  if (typeof value === "string") {
    const iso = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    const embedded = value.match(/(\d{4}-\d{2}-\d{2})/);
    if (embedded) return embedded[1];
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const asDate = new Date(value as any);
  if (!Number.isNaN(asDate.getTime())) {
    const y = asDate.getFullYear();
    const m = String(asDate.getMonth() + 1).padStart(2, "0");
    const d = String(asDate.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return null;
}
