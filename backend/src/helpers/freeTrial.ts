/**
 * FREE_TRIAL helpers — regras de conta de teste grátis (validação no backend).
 * Duração padrão: 12 horas (configurável via FREE_TRIAL_HOURS).
 */

export const FREE_TRIAL_ACCOUNT_TYPE = "FREE_TRIAL";
export const FREE_TRIAL_RECURRENCE = "free_trial";
export const FREE_TRIAL_PROVIDER_SUB_ID = "free_trial_signup";
export const FREE_TRIAL_SIGNUP_SOURCE = "free_trial";

/** Horas de duração do teste. Default 12. */
export function getFreeTrialHours(): number {
  const raw = process.env.FREE_TRIAL_HOURS;
  const n = raw ? Number(raw) : 12;
  return Number.isFinite(n) && n > 0 ? n : 12;
}

export function computeTrialWindow(now: Date = new Date()): {
  trialStartedAt: Date;
  trialExpiresAt: Date;
  dueDate: string;
} {
  const trialStartedAt = new Date(now.getTime());
  const trialExpiresAt = new Date(
    trialStartedAt.getTime() + getFreeTrialHours() * 60 * 60 * 1000
  );
  const dueDate = trialExpiresAt.toISOString().split("T")[0];
  return { trialStartedAt, trialExpiresAt, dueDate };
}

export function isFreeTrialCompany(company: {
  accountType?: string | null;
  recurrence?: string | null;
  signupMetadata?: Record<string, unknown> | null;
} | null | undefined): boolean {
  if (!company) return false;
  if (String(company.accountType || "") === FREE_TRIAL_ACCOUNT_TYPE) return true;
  if (String(company.recurrence || "") === FREE_TRIAL_RECURRENCE) return true;
  const meta = company.signupMetadata;
  if (meta && typeof meta === "object") {
    const src = String((meta as any).signupSource || (meta as any).accountType || "");
    if (src === FREE_TRIAL_SIGNUP_SOURCE || src === FREE_TRIAL_ACCOUNT_TYPE) {
      return true;
    }
  }
  return false;
}

export function isFreeTrialExpired(
  company: {
    accountType?: string | null;
    recurrence?: string | null;
    signupMetadata?: Record<string, unknown> | null;
    trialExpiresAt?: Date | string | null;
    dueDate?: string | null;
  } | null | undefined,
  now: Date = new Date()
): boolean {
  if (!isFreeTrialCompany(company)) return false;
  const expires = company?.trialExpiresAt
    ? new Date(company.trialExpiresAt)
    : null;
  if (expires && !Number.isNaN(expires.getTime())) {
    return now.getTime() >= expires.getTime();
  }
  // Fallback: dueDate fim do dia (compatibilidade)
  if (company?.dueDate) {
    const end = new Date(`${company.dueDate}T23:59:59.999Z`);
    return now.getTime() >= end.getTime();
  }
  return false;
}

export function getTrialRemainingMs(
  company: { trialExpiresAt?: Date | string | null } | null | undefined,
  now: Date = new Date()
): number {
  if (!company?.trialExpiresAt) return 0;
  const expires = new Date(company.trialExpiresAt);
  if (Number.isNaN(expires.getTime())) return 0;
  return Math.max(0, expires.getTime() - now.getTime());
}

export function formatTrialRemaining(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}min`;
}

export type OnboardingProgress = {
  onboarding_started: boolean;
  current_step: number;
  completed_steps: number[];
  onboarding_completed: boolean;
  skipped: boolean;
  updatedAt?: string;
};

export const ONBOARDING_STEPS = [
  { id: 1, key: "visual_identity", label: "Identidade Visual", route: "/settings" },
  { id: 2, key: "integrations", label: "Integrações", route: "/connections" },
  { id: 3, key: "ai_providers", label: "Inteligência Artificial", route: "/connections" },
  { id: 4, key: "ai_agent", label: "Agente de IA", route: "/prompts" },
  { id: 5, key: "tickets", label: "Multiatendimento", route: "/tickets" },
  { id: 6, key: "leads", label: "Leads", route: "/leads-sales" },
  { id: 7, key: "sales", label: "Vendas", route: "/leads-sales" },
  { id: 8, key: "activities", label: "Atividades", route: "/activities" },
  { id: 9, key: "projects", label: "Projetos", route: "/projects" },
  { id: 10, key: "inventory", label: "Inventário", route: "/inventory" },
  { id: 11, key: "calendar", label: "Calendário", route: "/schedules" },
  { id: 12, key: "conclusion", label: "Conclusão", route: "/" }
] as const;

export const ONBOARDING_TOTAL_STEPS = ONBOARDING_STEPS.length;

export function defaultOnboardingProgress(): OnboardingProgress {
  return {
    onboarding_started: false,
    current_step: 1,
    completed_steps: [],
    onboarding_completed: false,
    skipped: false
  };
}

export function mergeOnboardingProgress(
  current: Partial<OnboardingProgress> | null | undefined,
  patch: Partial<OnboardingProgress>
): OnboardingProgress {
  const base = { ...defaultOnboardingProgress(), ...(current || {}) };
  const next: OnboardingProgress = {
    ...base,
    ...patch,
    completed_steps: Array.isArray(patch.completed_steps)
      ? [...new Set(patch.completed_steps.map(Number).filter(n => n > 0))]
      : base.completed_steps,
    updatedAt: new Date().toISOString()
  };
  if (typeof next.current_step === "number") {
    next.current_step = Math.min(
      Math.max(1, next.current_step),
      ONBOARDING_TOTAL_STEPS
    );
  }
  return next;
}
