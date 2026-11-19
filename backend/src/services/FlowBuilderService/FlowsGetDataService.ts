import { WebhookModel } from "../../models/Webhook";
import User from "../../models/User";
import { FlowBuilderModel } from "../../models/FlowBuilder";

interface Request {
  companyId: number;
  idFlow: number
}

interface Response {
  flow: FlowBuilderModel
}

const FlowsGetDataService = async ({
  companyId,
  idFlow
}: Request): Promise<Response> => {
  try {
    let flow = await FlowBuilderModel.findOne({
      where: {
        company_id: companyId,
        id: idFlow
      }
    });

    if (!flow) {
      flow = await FlowBuilderModel.findOne({
        where: { id: idFlow }
      });
    }

    return {
      flow: flow as FlowBuilderModel
    };
  } catch (error) {
    console.error("Erro ao consultar Fluxo:", error);
    throw error;
  }
};

export default FlowsGetDataService;
