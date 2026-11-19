import { Request } from "express";

/**
 * IP do cliente. Usa req.ip (respeita trust proxy) e só lê X-Forwarded-For
 * quando TRUST_PROXY estiver habilitado no servidor.
 */
export function getClientIp(req: Request): string {
  const strip = (value: string) =>
    String(value || "")
      .trim()
      .replace(/^::ffff:/i, "")
      .split("%")[0];

  const fromExpress = strip(String(req.ip || ""));
  if (fromExpress && fromExpress !== "::1") {
    return fromExpress;
  }

  const trust = String(process.env.TRUST_PROXY || "").trim().toLowerCase();
  const trustEnabled =
    trust === "1" || trust === "true" || (/^\d+$/.test(trust) && Number(trust) > 0);

  if (trustEnabled) {
    const xf = req.headers["x-forwarded-for"];
    const first = Array.isArray(xf)
      ? xf[0]
      : String(xf || "")
          .split(",")[0]
          .trim();
    const fromHeader = strip(first);
    if (fromHeader) return fromHeader;
  }

  return strip(String(req.socket?.remoteAddress || fromExpress || ""));
}
