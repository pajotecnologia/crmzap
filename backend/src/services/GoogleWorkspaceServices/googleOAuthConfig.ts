import type { GoogleWorkspaceServiceId } from "../../models/GoogleWorkspaceConnection";

export const INTEGRATION_KEY_TO_SERVICE: Record<string, GoogleWorkspaceServiceId> = {
  "google-drive": "google_drive",
  "google-sheets": "google_sheets",
  "google-calendar": "google_calendar"
};

export const SERVICE_TO_INTEGRATION_KEY: Record<GoogleWorkspaceServiceId, string> = {
  google_drive: "google-drive",
  google_sheets: "google-sheets",
  google_calendar: "google-calendar"
};

const BASE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile"
];

export const SERVICE_SCOPES: Record<GoogleWorkspaceServiceId, string[]> = {
  google_drive: [
    ...BASE_SCOPES,
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive.file"
  ],
  google_sheets: [
    ...BASE_SCOPES,
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/spreadsheets.readonly"
  ],
  google_calendar: [
    ...BASE_SCOPES,
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events"
  ]
};

export function resolveGoogleOAuthRedirectUri(): string {
  const base = (
    process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    `${(process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3000}`).replace(
      /\/$/,
      ""
    )}/google/oauth/callback`
  ).trim();
  return base;
}

export function getGoogleOAuthClientConfig(): {
  clientId: string;
  clientSecret: string;
} {
  const clientId = (process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
  const clientSecret = (process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_OAUTH_CLIENT_ID e GOOGLE_OAUTH_CLIENT_SECRET não configurados no servidor."
    );
  }
  return { clientId, clientSecret };
}

export function integrationKeyToService(
  integrationKey: string
): GoogleWorkspaceServiceId | null {
  return INTEGRATION_KEY_TO_SERVICE[integrationKey] || null;
}
