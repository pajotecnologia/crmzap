import crypto from "crypto";
import { Op, Sequelize } from "sequelize";
import AppError from "../../errors/AppError";
import CreateCompanyService from "../CompanyService/CreateCompanyService";
import AuthUserService from "../UserServices/AuthUserService";
import Plan from "../../models/Plan";
import Subscriptions from "../../models/Subscriptions";
import User from "../../models/User";
import Company from "../../models/Company";
import FreeTrialIpSignup from "../../models/FreeTrialIpSignup";
import sequelize from "../../database";
import { getCompanyOptionalColumns } from "../../helpers/companyOptionalColumns";
import {
  FREE_TRIAL_ACCOUNT_TYPE,
  FREE_TRIAL_PROVIDER_SUB_ID,
  FREE_TRIAL_RECURRENCE,
  FREE_TRIAL_SIGNUP_SOURCE,
  computeTrialWindow,
  defaultOnboardingProgress,
  getFreeTrialHours
} from "../../helpers/freeTrial";
import {
  CODIGO_FONTE_INSTALL_URL,
  FREE_TRIAL_IP_LIMIT,
  validateFreeTrialEmail,
  validateFreeTrialPhone
} from "../../helpers/freeTrialSignupValidation";
import SeedFreeTrialDemoDataService from "./SeedFreeTrialDemoDataService";
import executeFreeTrialAutomation from "./FreeTrialAutomationService";

export {
  CODIGO_FONTE_INSTALL_URL,
  FREE_TRIAL_IP_LIMIT,
  validateFreeTrialEmail,
  validateFreeTrialPhone
};

export type FreeTrialSignupInput = {
  email: string;
  password: string;
  phone: string;
  name?: string;
  companyName?: string;
  clientIp?: string;
  userAgent?: string;
};

function hashValue(value?: string): string | null {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function validatePassword(password: string): void {
  if (!password || String(password).length < 5) {
    throw new AppError(
      "A senha deve ter no mínimo 5 caracteres.",
      400,
      "PASSWORD_INVALID"
    );
  }
}

async function assertEmailAvailable(email: string): Promise<void> {
  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    throw new AppError(
      "EMAIL_ALREADY_EXISTS",
      409,
      "EMAIL_ALREADY_EXISTS"
    );
  }
  const existingCompany = await Company.findOne({
    where: Sequelize.where(
      Sequelize.fn("lower", Sequelize.col("email")),
      email
    )
  });
  if (existingCompany) {
    throw new AppError(
      "EMAIL_ALREADY_EXISTS",
      409,
      "EMAIL_ALREADY_EXISTS"
    );
  }
}

async function assertPhoneAvailable(phone: string): Promise<void> {
  const local = phone.startsWith("55") ? phone.slice(2) : phone;
  const variants = Array.from(new Set([phone, local, `+${phone}`]));
  try {
    const [rows] = await sequelize.query(
      `SELECT id FROM "Companies"
       WHERE regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') IN (:phone, :local)
       LIMIT 1`,
      { replacements: { phone, local } }
    );
    if (Array.isArray(rows) && rows.length > 0) {
      throw new AppError(
        "PHONE_ALREADY_EXISTS",
        409,
        "PHONE_ALREADY_EXISTS"
      );
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    const existing = await Company.findOne({
      where: { phone: { [Op.in]: variants } },
      attributes: ["id"]
    });
    if (existing) {
      throw new AppError(
        "PHONE_ALREADY_EXISTS",
        409,
        "PHONE_ALREADY_EXISTS"
      );
    }
  }
}

async function countCompletedByIpHash(ipHash: string): Promise<number> {
  const now = new Date();
  const fromTable = await FreeTrialIpSignup.count({
    where: {
      ipHash,
      [Op.or]: [
        { status: "completed" },
        {
          status: "reserved",
          expiresAt: { [Op.gt]: now }
        }
      ]
    }
  });

  // Conta histórico em signupMetadata (cadastros anteriores ao novo controle)
  let fromLegacy = 0;
  try {
    const legacy = await Company.findAll({
      where: {
        [Op.or]: [
          { accountType: FREE_TRIAL_ACCOUNT_TYPE },
          { recurrence: FREE_TRIAL_RECURRENCE }
        ]
      },
      attributes: ["id", "signupMetadata"]
    });
    const alreadyTracked = new Set(
      (
        await FreeTrialIpSignup.findAll({
          where: { ipHash, status: "completed", companyId: { [Op.ne]: null as any } },
          attributes: ["companyId"]
        })
      )
        .map(row => Number(row.companyId))
        .filter(Boolean)
    );
    for (const company of legacy) {
      const meta = (company as any)?.signupMetadata || {};
      if (meta.ipHash === ipHash && !alreadyTracked.has(Number(company.id))) {
        fromLegacy += 1;
      }
    }
  } catch {
    /* coluna/metadata pode não existir em ambientes antigos */
  }

  return fromTable + fromLegacy;
}

async function withIpLock<T>(
  ipHash: string,
  fn: (transaction: any) => Promise<T>
): Promise<T> {
  return sequelize.transaction(async transaction => {
    try {
      await sequelize.query("SELECT pg_advisory_xact_lock(hashtext(:ipHash))", {
        replacements: { ipHash },
        transaction
      });
    } catch {
      /* MySQL/SQLite: segue sem advisory lock */
    }
    return fn(transaction);
  });
}

const CreateFreeTrialSignupService = async (input: FreeTrialSignupInput) => {
  if (process.env.DEMO === "ON") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const email = validateFreeTrialEmail(input.email);
  const phone = validateFreeTrialPhone(input.phone);
  validatePassword(input.password);

  await assertEmailAvailable(email);
  await assertPhoneAvailable(phone);

  const ipHash = hashValue(input.clientIp);
  if (!ipHash) {
    throw new AppError(
      "Não foi possível identificar a origem do cadastro. Tente novamente.",
      400,
      "IP_UNAVAILABLE"
    );
  }

  let reservation: FreeTrialIpSignup | null = null;

  try {
    await withIpLock(ipHash, async transaction => {
      const used = await countCompletedByIpHash(ipHash);
      if (used >= FREE_TRIAL_IP_LIMIT) {
        throw new AppError(
          "IP_SIGNUP_LIMIT_REACHED",
          429,
          "IP_SIGNUP_LIMIT_REACHED"
        );
      }
      reservation = await FreeTrialIpSignup.create(
        {
          ipHash,
          status: "reserved",
          companyId: null,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        } as any,
        { transaction }
      );
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      "Não foi possível validar o limite de cadastros. Tente novamente.",
      503,
      "IP_QUOTA_UNAVAILABLE"
    );
  }

  let plan =
    (await Plan.findOne({
      where: { name: "Free Trial 12h" },
      order: [["id", "ASC"]]
    })) ||
    (await Plan.findOne({
      where: { name: "Free Trial 24h" },
      order: [["id", "ASC"]]
    })) ||
    (await Plan.findOne({
      where: { trial: true, isPublic: true },
      order: [["id", "ASC"]]
    }));

  if (!plan) {
    if (reservation) {
      await reservation.update({ status: "released" } as any);
    }
    throw new AppError("ERR_FREE_TRIAL_PLAN_NOT_CONFIGURED", 503);
  }

  const { trialStartedAt, trialExpiresAt, dueDate } = computeTrialWindow();
  const displayName =
    (input.name && String(input.name).trim()) ||
    email.split("@")[0] ||
    "Usuário Teste";
  const companyName =
    (input.companyName && String(input.companyName).trim()) ||
    `Teste ${displayName}`;

  let company: Company;
  try {
    company = await CreateCompanyService({
      name: companyName,
      email,
      phone,
      planId: plan.id,
      status: true,
      dueDate,
      recurrence: FREE_TRIAL_RECURRENCE,
      document: "",
      paymentMethod: "",
      password: input.password,
      companyUserName: displayName,
      skipExternalCnpjValidation: true,
      allHistoric: "enabled",
      allTicket: "enable",
      allUserChat: "enabled",
      viewMessagesPending: "enabled",
      closePendingTicket: "enabled",
      campaigns: "enabled",
      contacts: "enabled",
      dashboard: "enabled",
      connections: "enabled",
      flow: "enabled",
      useWhatsappOfficial: true
    } as any);
  } catch (createErr: any) {
    if (reservation) {
      await reservation.update({ status: "released" } as any);
    }
    const msg = String(createErr?.message || "");
    if (
      createErr?.name === "SequelizeUniqueConstraintError" ||
      /unique|duplicate|email/i.test(msg)
    ) {
      if (/phone|telefone/i.test(msg)) {
        throw new AppError(
          "PHONE_ALREADY_EXISTS",
          409,
          "PHONE_ALREADY_EXISTS"
        );
      }
      throw new AppError(
        "EMAIL_ALREADY_EXISTS",
        409,
        "EMAIL_ALREADY_EXISTS"
      );
    }
    if (createErr instanceof AppError) throw createErr;
    throw new AppError(
      "Não foi possível criar a conta. Tente novamente em instantes.",
      400,
      "SIGNUP_FAILED"
    );
  }

  const cols = await getCompanyOptionalColumns();
  const updatePayload: Record<string, unknown> = {
    recurrence: FREE_TRIAL_RECURRENCE
  };

  if (cols.accountType) {
    updatePayload.accountType = FREE_TRIAL_ACCOUNT_TYPE;
  }
  if (cols.trialStartedAt) {
    updatePayload.trialStartedAt = trialStartedAt;
  }
  if (cols.trialExpiresAt) {
    updatePayload.trialExpiresAt = trialExpiresAt;
  }
  if (cols.trialStatus) {
    updatePayload.trialStatus = "active";
  }
  if (cols.onboardingProgress) {
    updatePayload.onboardingProgress = {
      ...defaultOnboardingProgress(),
      onboarding_started: true
    };
  }
  if (cols.signupMetadata) {
    updatePayload.signupMetadata = {
      signupSource: FREE_TRIAL_SIGNUP_SOURCE,
      accountType: FREE_TRIAL_ACCOUNT_TYPE,
      trialHours: getFreeTrialHours(),
      // Mantém IP para contagem; fingerprint/UA deixam de bloquear novos cadastros
      ipHash,
      userAgentHash: hashValue(input.userAgent)
    };
  }
  if (cols.allowOrgManualVisualIdentity) {
    updatePayload.allowOrgManualVisualIdentity = true;
  }

  try {
    await company.update(updatePayload as any);
  } catch (e) {
    console.warn("free_trial company update:", e);
  }

  if (reservation) {
    await reservation.update({
      status: "completed",
      companyId: company.id,
      expiresAt: null
    } as any);
  }

  try {
    await Subscriptions.create({
      companyId: company.id,
      isActive: true,
      expiresAt: trialExpiresAt,
      providerSubscriptionId: FREE_TRIAL_PROVIDER_SUB_ID
    } as any);
  } catch (subErr) {
    console.warn("Subscriptions free_trial record:", subErr);
  }

  try {
    const adminUser = await User.findOne({
      where: { companyId: company.id, profile: "admin" },
      order: [["id", "ASC"]]
    });
    if (adminUser) {
      await SeedFreeTrialDemoDataService({
        companyId: company.id,
        userId: adminUser.id
      });
    }
  } catch (seedErr) {
    console.warn(
      "free_trial demo seed:",
      seedErr instanceof Error ? seedErr.message : seedErr
    );
  }

  executeFreeTrialAutomation({
    name: displayName,
    email,
    phone,
    companyId: company.id
  }).catch(err => {
    console.error("[CreateFreeTrialSignupService] automação pós-teste:", err);
  });

  const adminUser = await User.findOne({
    where: { companyId: company.id, profile: "admin" },
    order: [["id", "ASC"]]
  });
  if (adminUser && (adminUser as any).defaultMenu === "closed") {
    try {
      await adminUser.update({ defaultMenu: "open" } as any);
    } catch {
      /* ignore */
    }
  }

  const { token, serializedUser, refreshToken } = await AuthUserService({
    email,
    password: input.password
  });

  return {
    token,
    refreshToken,
    user: serializedUser,
    company: {
      id: company.id,
      name: company.name,
      accountType: FREE_TRIAL_ACCOUNT_TYPE,
      trialStartedAt,
      trialExpiresAt,
      trialStatus: "active",
      trialHours: getFreeTrialHours()
    }
  };
};

export default CreateFreeTrialSignupService;
