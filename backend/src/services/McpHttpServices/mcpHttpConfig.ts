import type { Request } from "express";
import { resolvePublicBackendUrl } from "../../utils/appUrlUtils";

export const MCP_HTTP_PATH = "/mcp";

export function resolveMcpPublicBaseUrl(req?: Request): string {
  return resolvePublicBackendUrl(req);
}

export function resolveMcpServerUrl(req?: Request): URL {
  const base = resolveMcpPublicBaseUrl(req).replace(/\/+$/, "");
  return new URL(MCP_HTTP_PATH, `${base}/`);
}

export function resolveMcpIssuerUrl(req?: Request): URL {
  const base = resolveMcpPublicBaseUrl(req).replace(/\/+$/, "");
  const issuer = new URL(base);
  if (issuer.protocol === "http:" && issuer.hostname !== "localhost") {
    issuer.protocol = "https:";
  }
  return issuer;
}

export const MCP_OAUTH_SCOPES = [
  "crm:read",
  "crm:write",
  "tools:execute",
  "full"
];
