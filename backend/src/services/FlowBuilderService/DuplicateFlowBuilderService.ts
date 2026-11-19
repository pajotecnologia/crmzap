import { FlowBuilderModel } from "../../models/FlowBuilder";
import { WebhookModel } from "../../models/Webhook";
import { randomString } from "../../utils/randomCode";

interface Request {
  id: number;
}

const DuplicateFlowBuilderService = async ({
  id
}: Request): Promise<FlowBuilderModel> => {
  try {
    const flow = await FlowBuilderModel.findOne({
      where: {
        id: id
      }
    });

    if (!flow) {
      throw new Error("Fluxo não encontrado");
    }

    const duplicate = await FlowBuilderModel.create({
      name: `${flow.name} - Cópia`,
      flow: flow.flow,
      user_id: flow.user_id,
      company_id: flow.company_id,
      active: true
    });

    return duplicate;
  } catch (error) {
    console.error("Erro ao duplicar o fluxo:", error);
    throw error;
  }
};

export default DuplicateFlowBuilderService;
