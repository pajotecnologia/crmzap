import { Request, Response, NextFunction } from "express";
import moment from "moment";
import Company from "../models/Company";
import AppError from "../errors/AppError";
import {
  isFreeTrialCompany,
  isFreeTrialExpired
} from "../helpers/freeTrial";
import { getCompanyOptionalColumns } from "../helpers/companyOptionalColumns";

/** Full path for mounted routers (e.g. /auth/me). */
function fullPath(req: Request): string {
  return `${req.baseUrl || ""}${req.path || ""}`.split("?")[0];
}

/**
 * Blocks API usage when company license (dueDate) has passed.
 * FREE_TRIAL: uses trialExpiresAt when column exists (server-side).
 */
const requireActiveSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.user) {
    return next();
  }

  const { companyId } = req.user;
  if (companyId === 1) {
    return next();
  }

  if (process.env.SUBSCRIPTION_ENFORCE === "false") {
    return next();
  }

  const p = fullPath(req);
  if (req.baseUrl === "/auth" && (req.path === "/me" || req.path === "/me/")) {
    return next();
  }
  if (req.baseUrl === "/auth" && /\/confirm\/[^/]+\/acknowledge\/?$/.test(p)) {
    return next();
  }

  const exemptPrefixes = [
    "/subscription",
    "/invoices",
    "/companies/listPlan",
    "/companiesPlan",
    "/free-trial/status",
    "/free-trial/onboarding"
  ];
  if (exemptPrefixes.some(prefix => p.startsWith(prefix))) {
    return next();
  }
  if (p === "/companies/list") {
    return next();
  }

  try {
    const cols = await getCompanyOptionalColumns();
    const attributes = ["id", "dueDate", "status", "recurrence"];
    if (cols.accountType) attributes.push("accountType");
    if (cols.signupMetadata) attributes.push("signupMetadata");
    if (cols.trialExpiresAt) attributes.push("trialExpiresAt");
    if (cols.trialStatus) attributes.push("trialStatus");

    const company = await Company.findByPk(companyId, { attributes });
    if (!company) {
      throw new AppError("ERR_NO_PERMISSION", 403);
    }
    if (company.status === false) {
      throw new AppError("ERR_COMPANY_SUSPENDED", 403);
    }

    if (cols.trialExpiresAt && isFreeTrialCompany(company as any)) {
      if (isFreeTrialExpired(company as any)) {
        if (cols.trialStatus && (company as any).trialStatus !== "expired") {
          try {
            await company.update({ trialStatus: "expired" } as any);
          } catch {
            /* ignore */
          }
        }
        throw new AppError("ERR_FREE_TRIAL_EXPIRED", 402);
      }
      return next();
    }

    const rawDue = company.dueDate;
    if (!rawDue || !moment(rawDue).isValid()) {
      return next();
    }

    const today = moment().startOf("day");
    const due = moment(rawDue).startOf("day");
    if (today.isAfter(due)) {
      throw new AppError("ERR_SUBSCRIPTION_EXPIRED", 402);
    }

    return next();
  } catch (err) {
    return next(err);
  }
};

export default requireActiveSubscription;
