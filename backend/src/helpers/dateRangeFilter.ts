/** Inclusive day range for YYYY-MM-DD filter params. */
export function toDateBetween(
  start?: string | null,
  end?: string | null
): [Date, Date] | null {
  const s = typeof start === "string" ? start.trim() : "";
  const e = typeof end === "string" ? end.trim() : "";
  if (!s || !e) return null;

  const from = new Date(`${s}T00:00:00.000`);
  const to = new Date(`${e}T23:59:59.999`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return [from, to];
}
