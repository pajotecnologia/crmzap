import Company from "../../models/Company";
import AppError from "../../errors/AppError";
import {
  OnboardingProgress,
  defaultOnboardingProgress,
  mergeOnboardingProgress,
  isFreeTrialCompany
} from "../../helpers/freeTrial";

export async function getOnboardingProgress(
  companyId: number
): Promise<OnboardingProgress> {
  const company = await Company.findByPk(companyId, {
    attributes: ["id", "onboardingProgress", "accountType", "recurrence", "signupMetadata"]
  });
  if (!company) throw new AppError("ERR_NO_COMPANY", 404);
  const raw = (company as any).onboardingProgress;
  if (raw && typeof raw === "object") {
    return { ...defaultOnboardingProgress(), ...raw };
  }
  return defaultOnboardingProgress();
}

export async function updateOnboardingProgress(
  companyId: number,
  patch: Partial<OnboardingProgress>
): Promise<OnboardingProgress> {
  const company = await Company.findByPk(companyId);
  if (!company) throw new AppError("ERR_NO_COMPANY", 404);

  const current = (company as any).onboardingProgress;
  const next = mergeOnboardingProgress(current, patch);

  await company.update({ onboardingProgress: next } as any);
  return next;
}

export async function shouldAutoStartOnboarding(
  companyId: number
): Promise<boolean> {
  const company = await Company.findByPk(companyId, {
    attributes: [
      "id",
      "accountType",
      "recurrence",
      "signupMetadata",
      "onboardingProgress"
    ]
  });
  if (!company || !isFreeTrialCompany(company as any)) return false;
  const progress = (company as any).onboardingProgress as OnboardingProgress | null;
  if (!progress) return true;
  if (progress.onboarding_completed || progress.skipped) return false;
  return true;
}
