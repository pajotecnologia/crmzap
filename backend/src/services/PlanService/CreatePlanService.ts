import * as Yup from "yup";
import { Sequelize } from "sequelize";
import AppError from "../../errors/AppError";
import Plan from "../../models/Plan";

/** Aceita "1.234,56", "1234.56" ou número e devolve string decimal "1234.56". */
export const normalizePlanAmount = (value?: string | number | null): string => {
  if (value === null || value === undefined || value === "") return "0";
  let s = String(value).replace(/[^\d.,-]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? n.toFixed(2) : "0";
};

interface PlanData {
  name: string;
  users?: number;
  connections?: number;
  queues?: number;
  amount?: string;
  useWhatsapp?: boolean;
  useFacebook?: boolean;
  useInstagram?: boolean;
  useCampaigns?: boolean;
  useSchedules?: boolean;
  useInternalChat?: boolean;
  useExternalApi?: boolean;
  useKanban?: boolean;
  trial?: boolean;
  trialDays?: number;
  recurrence?: string;
  useOpenAi?: boolean;
  useIntegrations?: boolean;
  isPublic?: boolean;
  useWhatsappOfficial?: boolean;
  wavoip?: boolean;
}

const CreatePlanService = async (planData: PlanData): Promise<Plan> => {
  const name = String(planData.name || "").trim();

  const planSchema = Yup.object().shape({
    name: Yup.string()
      .min(2, "ERR_PLAN_INVALID_NAME")
      .required("ERR_PLAN_INVALID_NAME")
      .test(
        "Check-unique-name",
        "ERR_PLAN_NAME_ALREADY_EXISTS",
        async value => {
          if (value) {
            const planWithSameName = await Plan.findOne({
              where: Sequelize.where(
                Sequelize.fn("lower", Sequelize.col("name")),
                value.toLowerCase()
              )
            });

            return !planWithSameName;
          }
          return false;
        }
      )
  });

  try {
    await planSchema.validate({ name });
  } catch (err) {
    throw new AppError(err.message);
  }

  const plan = await Plan.create({
    ...planData,
    name,
    amount: normalizePlanAmount(planData.amount)
  });

  return plan;
};

export default CreatePlanService;
