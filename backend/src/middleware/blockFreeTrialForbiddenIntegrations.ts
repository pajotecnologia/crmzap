import { Request, Response, NextFunction } from "express";
import Company from "../models/Company";
import AppError from "../errors/AppError";
import { isFreeTrialCompany } from "../helpers/freeTrial";
import { isIntegrationBlockedForFreeTrial } from "../helpers/trialIntegrationPolicy";

/**
 * Bloqueia no backend integrações proibidas para FREE_TRIAL
 * (Google, API Pajo).
 */
export const blockFreeTrialForbiddenIntegrations = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.companyId) return next();

    const company = await Company.findByPk(req.user.companyId, {
      attributes: ["id", "accountType", "recurrence", "signupMetadata"]
    });
    if (!company || !isFreeTrialCompany(company as any)) {
      return next();
    }

    const provider =
      req.params.provider ||
      req.params.connectionId ||
      (req.body && (req.body.provider || req.body.integrationKey)) ||
      "";

    const path = `${req.baseUrl || ""}${req.path || ""}`.toLowerCase();

    if (
      path.includes("/google") ||
      path.includes("platform-api") ||
      path.includes("vbsolution-api")
    ) {
      throw new AppError("ERR_FREE_TRIAL_INTEGRATION_FORBIDDEN", 403);
    }

    if (provider && isIntegrationBlockedForFreeTrial(String(provider))) {
      throw new AppError("ERR_FREE_TRIAL_INTEGRATION_FORBIDDEN", 403);
    }

    return next();
  } catch (err) {
    return next(err);
  }
};

export default blockFreeTrialForbiddenIntegrations;
