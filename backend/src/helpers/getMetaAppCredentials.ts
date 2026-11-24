/**
 * Credenciais do app Meta (FACEBOOK_APP_ID / FACEBOOK_APP_SECRET).
 * Também encontra variáveis com whitespace/TAB no nome (bug comum em painéis de hospedagem).
 *
 * Instagram Login (instagram_business_*) exige INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET
 * do produto "Instagram → API setup with Instagram login" — NÃO o App ID do Facebook.
 * Usar o Facebook App ID no oauth do Instagram gera "Invalid platform app".
 */
export function getMetaAppId(): string {
  const direct = (process.env.FACEBOOK_APP_ID || process.env.META_APP_ID || "").trim();
  if (direct) return direct;

  for (const [key, value] of Object.entries(process.env)) {
    const normalized = key.replace(/[\t\r\n ]+/g, "");
    if (normalized === "FACEBOOK_APP_ID" || normalized === "META_APP_ID") {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return "1694035698920340";
}

export function getMetaAppSecret(): string {
  const direct = (
    process.env.FACEBOOK_APP_SECRET ||
    process.env.META_APP_SECRET ||
    ""
  ).trim();
  if (direct) return direct;

  for (const [key, value] of Object.entries(process.env)) {
    const normalized = key.replace(/[\t\r\n ]+/g, "");
    if (normalized === "FACEBOOK_APP_SECRET" || normalized === "META_APP_SECRET") {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return "";
}

/** Instagram App ID do produto Instagram Login (dashboard Meta). */
export function getInstagramAppId(): string {
  const direct = (
    process.env.INSTAGRAM_APP_ID ||
    process.env.INSTAGRAM_CLIENT_ID ||
    ""
  ).trim();
  if (direct) return direct;

  for (const [key, value] of Object.entries(process.env)) {
    const normalized = key.replace(/[\t\r\n ]+/g, "");
    if (normalized === "INSTAGRAM_APP_ID" || normalized === "INSTAGRAM_CLIENT_ID") {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return "";
}

/** Instagram App Secret do produto Instagram Login. */
export function getInstagramAppSecret(): string {
  const direct = (
    process.env.INSTAGRAM_APP_SECRET ||
    process.env.INSTAGRAM_CLIENT_SECRET ||
    ""
  ).trim();
  if (direct) return direct;

  for (const [key, value] of Object.entries(process.env)) {
    const normalized = key.replace(/[\t\r\n ]+/g, "");
    if (
      normalized === "INSTAGRAM_APP_SECRET" ||
      normalized === "INSTAGRAM_CLIENT_SECRET"
    ) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return "";
}
