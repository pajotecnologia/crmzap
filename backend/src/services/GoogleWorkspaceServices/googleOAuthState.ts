import crypto from "crypto";
import type { GoogleWorkspaceServiceId } from "../../models/GoogleWorkspaceConnection";

type OAuthStatePayload = {
  companyId: number;
  userId: number;
  service: GoogleWorkspaceServiceId;
  ts: number;
};

function stateSecret(): string {
  return (
    process.env.JWT_SECRET ||
    process.env.GOOGLE_WORKSPACE_ENCRYPTION_SECRET ||
    "google-oauth-state"
  );
}

export function signGoogleOAuthState(payload: OAuthStatePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", stateSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

export function verifyGoogleOAuthState(
  state: string
): OAuthStatePayload | null {
  const raw = String(state || "").trim();
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = crypto
    .createHmac("sha256", stateSecret())
    .update(body)
    .digest("base64url");
  if (sig !== expected) return null;
  try {
    const json = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (
      !json ||
      typeof json.companyId !== "number" ||
      typeof json.userId !== "number" ||
      typeof json.service !== "string"
    ) {
      return null;
    }
    if (Date.now() - Number(json.ts || 0) > 15 * 60 * 1000) {
      return null;
    }
    return json as OAuthStatePayload;
  } catch {
    return null;
  }
}
