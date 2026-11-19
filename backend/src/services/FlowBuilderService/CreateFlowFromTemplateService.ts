import { Op } from "sequelize";
import AppError from "../../errors/AppError";
import { FlowBuilderModel } from "../../models/FlowBuilder";
import { FlowCampaignModel } from "../../models/FlowCampaign";
import Whatsapp from "../../models/Whatsapp";
import CreateFlowCampaignService from "../FlowCampaignService/CreateFlowCampaignService";
import {
  AutomationChannel,
  buildSimpleMessageFlow,
  getAutomationTemplate
} from "./automationTemplates";

interface Request {
  userId: number;
  companyId: number;
  templateId: string;
  message?: string;
  phrase?: string;
  connectionIds?: number[];
}

const WHATSAPP_CHANNELS = ["whatsapp", "whatsapp_oficial"];

const channelWhere = (channels: AutomationChannel[]) => {
  const values: string[] = [];
  channels.forEach(channel => {
    if (channel === "whatsapp") {
      values.push(...WHATSAPP_CHANNELS);
    } else {
      values.push(channel);
    }
  });
  return values;
};

const uniqueFlowName = async (
  baseName: string,
  companyId: number
): Promise<string> => {
  let name = baseName;
  let n = 2;
  while (
    (await FlowBuilderModel.findOne({
      where: { name, company_id: companyId }
    })) ||
    (await FlowCampaignModel.findOne({
      where: { name, companyId }
    }))
  ) {
    name = `${baseName} (${n})`;
    n += 1;
  }
  return name;
};

const CreateFlowFromTemplateService = async ({
  userId,
  companyId,
  templateId,
  message,
  phrase,
  connectionIds
}: Request) => {
  const template = getAutomationTemplate(templateId);
  if (!template) {
    throw new AppError("Modelo de automação não encontrado", 404);
  }

  const messageText = (message || template.defaultMessage || "").trim();
  if (!messageText) {
    throw new AppError("A mensagem da automação é obrigatória", 400);
  }

  if (template.bind === "keyword" || template.bind === "ig_comment_dm") {
    const keyword = (phrase || template.defaultPhrase || "").trim();
    if (!keyword) {
      throw new AppError("Informe a palavra-chave que dispara a automação", 400);
    }
  }

  const channelValues = channelWhere(template.channels);
  const available = await Whatsapp.findAll({
    where: {
      companyId,
      channel: { [Op.in]: channelValues }
    }
  });

  let selectedIds =
    Array.isArray(connectionIds) && connectionIds.length
      ? connectionIds.map(Number).filter(id => Number.isFinite(id))
      : available.map(item => item.id);

  selectedIds = selectedIds.filter(id => available.some(item => item.id === id));

  const igKeyword =
    template.bind === "ig_comment_dm" || template.bind === "ig_comment_reply"
      ? (phrase || template.defaultPhrase || "").trim()
      : "";

  const flowJson = buildSimpleMessageFlow(messageText, {
    useAi: Boolean(template.useAi),
    igCommentKeyword: igKeyword || undefined
  });
  const flowName = await uniqueFlowName(template.name, companyId);

  const flow = await FlowBuilderModel.create({
    user_id: userId,
    company_id: companyId,
    name: flowName,
    active: true,
    flow: flowJson
  });

  let campaign = null;

  if (selectedIds.length > 0) {
    if (template.bind === "welcome") {
      await Whatsapp.update(
        { flowIdWelcome: flow.id },
        {
          where: {
            id: selectedIds,
            companyId
          }
        }
      );
    } else if (template.bind === "ig_comment_reply") {
      await Whatsapp.update(
        { flowIdIgCommentReply: flow.id },
        {
          where: {
            id: selectedIds,
            companyId,
            channel: "instagram"
          }
        }
      );
    } else if (template.bind === "ig_comment_dm") {
      await Whatsapp.update(
        { flowIdIgCommentDm: flow.id },
        {
          where: {
            id: selectedIds,
            companyId,
            channel: "instagram"
          }
        }
      );
    } else {
      const keyword = (phrase || template.defaultPhrase || "").trim();
      campaign = await CreateFlowCampaignService({
        userId,
        companyId,
        name: flowName,
        flowId: flow.id,
        phrases: [{ text: keyword, type: "partial" }],
        whatsappIds: selectedIds,
        status: true
      });
    }
  }

  return {
    flow,
    campaign,
    templateId: template.id,
    bind: template.bind,
    boundConnectionIds: selectedIds,
    unboundReason:
      selectedIds.length === 0
        ? "Fluxo salvo. Conecte o canal em Integrações para a automação disparar."
        : null
  };
};

export default CreateFlowFromTemplateService;
