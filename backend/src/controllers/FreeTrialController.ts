import { Request, Response } from "express";
import CreateFreeTrialSignupService from "../services/FreeTrialServices/CreateFreeTrialSignupService";
import { CODIGO_FONTE_INSTALL_URL } from "../helpers/freeTrialSignupValidation";
import SeedFreeTrialDemoDataService from "../services/FreeTrialServices/SeedFreeTrialDemoDataService";
import {
  getOnboardingProgress,
  updateOnboardingProgress
} from "../services/FreeTrialServices/OnboardingProgressService";
import { SendRefreshToken } from "../helpers/SendRefreshToken";
import { getClientIp } from "../helpers/clientIp";
import Company from "../models/Company";
import DemoDataRecord from "../models/DemoDataRecord";
import AppError from "../errors/AppError";
import {
  FREE_TRIAL_ACCOUNT_TYPE,
  formatTrialRemaining,
  getTrialRemainingMs,
  isFreeTrialCompany,
  isFreeTrialExpired,
  ONBOARDING_STEPS
} from "../helpers/freeTrial";
import {
  FREE_TRIAL_ALLOWED_INTEGRATION_KEYS,
  filterIntegrationsForFreeTrial,
  isIntegrationAllowedForFreeTrial
} from "../helpers/trialIntegrationPolicy";
import { INTEGRATION_CATALOG_KEYS } from "../helpers/trialIntegrationCatalogKeys";

export const register = async (req: Request, res: Response): Promise<Response> => {
  const {
    email,
    password,
    passwordConfirm,
    phone,
    name,
    companyName,
    userAgent
  } = req.body;

  if (passwordConfirm !== undefined && password !== passwordConfirm) {
    throw new AppError("As senhas não coincidem.", 400, "PASSWORD_MISMATCH");
  }

  const result = await CreateFreeTrialSignupService({
    email,
    password,
    phone,
    name,
    companyName,
    clientIp: getClientIp(req),
    userAgent: userAgent || req.headers["user-agent"] || ""
  });

  SendRefreshToken(res, result.refreshToken);

  return res.status(200).json({
    token: result.token,
    user: result.user,
    company: result.company
  });
};

export const status = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const company = await Company.findByPk(companyId, {
    attributes: [
      "id",
      "name",
      "accountType",
      "recurrence",
      "signupMetadata",
      "trialStartedAt",
      "trialExpiresAt",
      "trialStatus",
      "dueDate",
      "onboardingProgress"
    ]
  });
  if (!company) throw new AppError("ERR_NO_COMPANY", 404);

  const freeTrial = isFreeTrialCompany(company as any);
  const expired = isFreeTrialExpired(company as any);
  const remainingMs = freeTrial ? getTrialRemainingMs(company as any) : null;

  if (freeTrial && expired && (company as any).trialStatus !== "expired") {
    try {
      await company.update({ trialStatus: "expired" } as any);
    } catch {
      /* ignore */
    }
  }

  return res.json({
    accountType: freeTrial ? FREE_TRIAL_ACCOUNT_TYPE : "STANDARD",
    isFreeTrial: freeTrial,
    trialStatus: expired ? "expired" : (company as any).trialStatus || (freeTrial ? "active" : null),
    trialStartedAt: (company as any).trialStartedAt || null,
    trialExpiresAt: (company as any).trialExpiresAt || null,
    expired,
    remainingMs,
    remainingLabel: remainingMs != null ? formatTrialRemaining(remainingMs) : null,
    nearExpiry: remainingMs != null && remainingMs > 0 && remainingMs < 2 * 60 * 60 * 1000,
    codigoFonteUrl: CODIGO_FONTE_INSTALL_URL,
    onboarding: (company as any).onboardingProgress || null
  });
};

export const integrations = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const company = await Company.findByPk(companyId, {
    attributes: ["id", "accountType", "recurrence", "signupMetadata"]
  });
  if (!company) throw new AppError("ERR_NO_COMPANY", 404);

  const freeTrial = isFreeTrialCompany(company as any);
  const catalog = INTEGRATION_CATALOG_KEYS.map(key => ({
    key,
    allowed: freeTrial ? isIntegrationAllowedForFreeTrial(key) : true
  }));

  const allowed = freeTrial
    ? filterIntegrationsForFreeTrial(catalog.map(c => ({ key: c.key }))).map(c => c.key)
    : catalog.map(c => c.key);

  return res.json({
    isFreeTrial: freeTrial,
    allowedKeys: freeTrial ? [...FREE_TRIAL_ALLOWED_INTEGRATION_KEYS] : allowed,
    integrations: freeTrial
      ? catalog.filter(c => c.allowed)
      : catalog
  });
};

export const onboardingGet = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const progress = await getOnboardingProgress(companyId);
  return res.json({ progress, steps: ONBOARDING_STEPS });
};

export const onboardingPost = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const progress = await updateOnboardingProgress(companyId, req.body || {});
  return res.json({ progress, steps: ONBOARDING_STEPS });
};

export const seedDemo = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  const company = await Company.findByPk(companyId, {
    attributes: ["id", "accountType", "recurrence", "signupMetadata"]
  });
  if (!company || !isFreeTrialCompany(company as any)) {
    throw new AppError("ERR_FREE_TRIAL_ONLY", 403);
  }
  const result = await SeedFreeTrialDemoDataService({
    companyId: Number(companyId),
    userId: Number(userId)
  });
  return res.json(result);
};

export const listDemoRecords = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const rows = await DemoDataRecord.findAll({
    where: { companyId, isDemoData: true },
    attributes: ["id", "entityType", "entityId", "isDemoData", "meta", "createdAt"]
  });
  return res.json({ records: rows });
};
