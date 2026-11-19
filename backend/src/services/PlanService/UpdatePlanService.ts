import { Op, Sequelize } from "sequelize";
import AppError from "../../errors/AppError";
import Plan from "../../models/Plan";
import { normalizePlanAmount } from "./CreatePlanService";

interface PlanData {
  name: string;
  id?: number | string;
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
  useOpenAi?: boolean;
  useIntegrations?: boolean;
  isPublic?: boolean;
  useWhatsappOfficial?: boolean;
  trial?: boolean;
  trialDays?: number;
  recurrence?: string;
  wavoip?: boolean;
}

const UpdatePlanService = async (planData: PlanData): Promise<Plan> => {
  const { id, createdAt, updatedAt, ...changes } = planData as PlanData & {
    createdAt?: unknown;
    updatedAt?: unknown;
  };

  const plan = await Plan.findByPk(id);

  if (!plan) {
    throw new AppError("ERR_NO_PLAN_FOUND", 404);
  }

  if (changes.name !== undefined) {
    changes.name = String(changes.name || "").trim();
    const clash = await Plan.findOne({
      where: {
        [Op.and]: [
          Sequelize.where(
            Sequelize.fn("lower", Sequelize.col("name")),
            changes.name.toLowerCase()
          ),
          { id: { [Op.ne]: plan.id } }
        ]
      }
    });
    if (clash) {
      throw new AppError("ERR_PLAN_NAME_ALREADY_EXISTS");
    }
  }

  if (changes.amount !== undefined) {
    changes.amount = normalizePlanAmount(changes.amount);
  }

  await plan.update(changes);

  return plan;
};

export default UpdatePlanService;
