import { google } from "googleapis";
import AppError from "../../errors/AppError";
import GoogleWorkspaceConnection, {
  GoogleWorkspaceServiceId
} from "../../models/GoogleWorkspaceConnection";
import {
  getGoogleOAuthClientConfig,
  resolveGoogleOAuthRedirectUri,
  SERVICE_SCOPES,
  SERVICE_TO_INTEGRATION_KEY
} from "./googleOAuthConfig";
import { signGoogleOAuthState, verifyGoogleOAuthState } from "./googleOAuthState";

export function createGoogleOAuthClient() {
  const { clientId, clientSecret } = getGoogleOAuthClientConfig();
  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    resolveGoogleOAuthRedirectUri()
  );
}

export function buildGoogleAuthorizeUrl(params: {
  companyId: number;
  userId: number;
  service: GoogleWorkspaceServiceId;
}): string {
  const oauth2 = createGoogleOAuthClient();
  const scopes = SERVICE_SCOPES[params.service];
  const state = signGoogleOAuthState({
    companyId: params.companyId,
    userId: params.userId,
    service: params.service,
    ts: Date.now()
  });
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: scopes,
    state,
    include_granted_scopes: true
  });
}

export async function handleGoogleOAuthCallback(params: {
  code: string;
  state: string;
}): Promise<{
  connection: GoogleWorkspaceConnection;
  integrationKey: string;
}> {
  const parsed = verifyGoogleOAuthState(params.state);
  if (!parsed) {
    throw new AppError("Estado OAuth inválido ou expirado.", 400);
  }

  const oauth2 = createGoogleOAuthClient();
  const { tokens } = await oauth2.getToken(params.code);
  if (!tokens.refresh_token && !tokens.access_token) {
    throw new AppError(
      "Google não retornou tokens. Revogue o acesso em myaccount.google.com/permissions e tente de novo.",
      400
    );
  }

  oauth2.setCredentials(tokens);
  const oauth2Api = google.oauth2({ version: "v2", auth: oauth2 });
  const { data: profile } = await oauth2Api.userinfo.get();
  const accountEmail = String(profile.email || "").trim();
  const accountName =
    String(profile.name || profile.given_name || accountEmail).trim() ||
    accountEmail;

  if (!accountEmail) {
    throw new AppError("Não foi possível obter o e-mail da conta Google.", 400);
  }

  const service = parsed.service;
  const companyId = parsed.companyId;

  let connection = await GoogleWorkspaceConnection.findOne({
    where: { companyId, service, accountEmail }
  });

  if (!connection) {
    connection = await GoogleWorkspaceConnection.create({
      companyId,
      service,
      accountEmail,
      accountName,
      scopes: (SERVICE_SCOPES[service] || []).join(" "),
      isActive: true
    } as any);
  }

  if (tokens.refresh_token) {
    connection.refreshToken = tokens.refresh_token;
  }
  if (tokens.access_token) {
    connection.accessToken = tokens.access_token;
  }
  if (tokens.expiry_date) {
    connection.accessTokenExpiresAt = new Date(tokens.expiry_date);
  }
  await connection.update({
    accountName,
    scopes: (SERVICE_SCOPES[service] || []).join(" "),
    isActive: true,
    refreshTokenEnc: connection.refreshTokenEnc,
    accessTokenEnc: connection.accessTokenEnc,
    accessTokenExpiresAt: connection.accessTokenExpiresAt
  });

  return {
    connection: await connection.reload(),
    integrationKey: SERVICE_TO_INTEGRATION_KEY[service]
  };
}

export async function getAuthorizedGoogleClient(
  connection: GoogleWorkspaceConnection
) {
  const oauth2 = createGoogleOAuthClient();
  const refresh = connection.refreshToken;
  const access = connection.accessToken;
  if (!refresh && !access) {
    throw new AppError("Conexão Google sem tokens. Reconecte a conta.", 400);
  }
  oauth2.setCredentials({
    refresh_token: refresh || undefined,
    access_token: access || undefined,
    expiry_date: connection.accessTokenExpiresAt
      ? new Date(connection.accessTokenExpiresAt).getTime()
      : undefined
  });

  oauth2.on("tokens", async tokens => {
    if (tokens.access_token) {
      connection.accessToken = tokens.access_token;
    }
    if (tokens.refresh_token) {
      connection.refreshToken = tokens.refresh_token;
    }
    if (tokens.expiry_date) {
      connection.accessTokenExpiresAt = new Date(tokens.expiry_date);
    }
    await connection.update({
      accessTokenEnc: connection.accessTokenEnc,
      refreshTokenEnc: connection.refreshTokenEnc,
      accessTokenExpiresAt: connection.accessTokenExpiresAt
    });
  });

  return oauth2;
}
