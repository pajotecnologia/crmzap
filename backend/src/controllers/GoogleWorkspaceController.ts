import { Request, Response } from "express";
import AppError from "../errors/AppError";
import GoogleWorkspaceConnection from "../models/GoogleWorkspaceConnection";
import {
  buildGoogleAuthorizeUrl,
  handleGoogleOAuthCallback
} from "../services/GoogleWorkspaceServices/googleOAuthService";
import {
  integrationKeyToService,
  SERVICE_TO_INTEGRATION_KEY
} from "../services/GoogleWorkspaceServices/googleOAuthConfig";
import { listGoogleCalendarEvents } from "../services/GoogleWorkspaceServices/googleCalendarEventsService";
import { getGoogleOAuthClientConfig } from "../services/GoogleWorkspaceServices/googleOAuthConfig";
import { handleGoogleLoginCallbackRedirect } from "./GoogleLoginController";

function frontendBase(): string {
  return (process.env.FRONTEND_URL || "http://localhost:5090").replace(/\/$/, "");
}

export const oauthStatus = async (
  _req: Request,
  res: Response
): Promise<Response> => {
  try {
    getGoogleOAuthClientConfig();
    return res.json({ configured: true });
  } catch (e: any) {
    return res.json({ configured: false, message: e?.message });
  }
};

export const authorize = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  const integrationKey = String(req.query.integrationKey || req.query.service || "");
  const service =
    integrationKeyToService(integrationKey) ||
    (String(req.query.service || "") as any);

  if (!service || !SERVICE_TO_INTEGRATION_KEY[service as keyof typeof SERVICE_TO_INTEGRATION_KEY]) {
    throw new AppError("Serviço Google inválido.", 400);
  }

  const url = buildGoogleAuthorizeUrl({
    companyId,
    userId: Number(userId),
    service: service as any
  });

  return res.json({ authorizeUrl: url, integrationKey: SERVICE_TO_INTEGRATION_KEY[service as keyof typeof SERVICE_TO_INTEGRATION_KEY] });
};

export const callback = async (
  req: Request,
  res: Response
): Promise<void> => {
  const handledLogin = await handleGoogleLoginCallbackRedirect(req, res);
  if (handledLogin) return;

  const { code, state, error } = req.query;
  const base = frontendBase();

  if (error) {
    res.redirect(
      `${base}/connections/google-oauth/callback?status=error&message=${encodeURIComponent(
        String(error)
      )}`
    );
    return;
  }

  try {
    const result = await handleGoogleOAuthCallback({
      code: String(code || ""),
      state: String(state || "")
    });
    res.redirect(
      `${base}/connections/google-oauth/callback?status=success&integrationKey=${encodeURIComponent(
        result.integrationKey
      )}&email=${encodeURIComponent(result.connection.accountEmail)}`
    );
  } catch (err: any) {
    res.redirect(
      `${base}/connections/google-oauth/callback?status=error&message=${encodeURIComponent(
        err?.message || "Falha na conexão Google"
      )}`
    );
  }
};

export const list = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const serviceFilter = req.query.service
    ? integrationKeyToService(String(req.query.service)) ||
      String(req.query.service)
  : undefined;

  const where: any = { companyId, isActive: true };
  if (serviceFilter) where.service = serviceFilter;

  const rows = await GoogleWorkspaceConnection.findAll({
    where,
    order: [["createdAt", "DESC"]]
  });

  return res.json({
    items: rows.map(r => ({
      id: r.id,
      service: r.service,
      integrationKey: SERVICE_TO_INTEGRATION_KEY[r.service],
      accountEmail: r.accountEmail,
      accountName: r.accountName,
      connectedAt: r.createdAt,
      updatedAt: r.updatedAt
    }))
  });
};

export const counts = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const rows = await GoogleWorkspaceConnection.findAll({
    where: { companyId, isActive: true },
    attributes: ["service"]
  });
  const tally: Record<string, number> = {
    "google-drive": 0,
    "google-sheets": 0,
    "google-calendar": 0
  };
  for (const r of rows) {
    const key = SERVICE_TO_INTEGRATION_KEY[r.service];
    if (key) tally[key] = (tally[key] || 0) + 1;
  }
  return res.json({ counts: tally });
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;
  const row = await GoogleWorkspaceConnection.findOne({
    where: { id, companyId }
  });
  if (!row) {
    throw new AppError("Conexão Google não encontrada.", 404);
  }
  await row.destroy();
  return res.status(200).json({ ok: true });
};

export const calendarEvents = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { connectionId } = req.params;
  const { timeMin, timeMax, maxResults } = req.query;

  const data = await listGoogleCalendarEvents({
    connectionId: Number(connectionId),
    companyId,
    timeMin: timeMin ? String(timeMin) : undefined,
    timeMax: timeMax ? String(timeMax) : undefined,
    maxResults: maxResults ? Number(maxResults) : undefined
  });

  return res.json(data);
};
