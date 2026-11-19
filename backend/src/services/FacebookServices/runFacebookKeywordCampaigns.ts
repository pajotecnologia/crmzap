import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import { FlowBuilderModel } from "../../models/FlowBuilder";
import { FlowCampaignModel } from "../../models/FlowCampaign";
import { IConnections, INodes } from "../WebhookService/DispatchWebHookService";
import { ActionsWebhookFacebookService } from "./WebhookFacebookServices/ActionsWebhookFacebookService";

interface RunArgs {
  ticket: Ticket;
  companyId: number;
  getSession: Whatsapp;
  contact: Contact;
  messageBody?: string;
}

const mountContact = (contact: Contact) => ({
  number: contact.number,
  name: contact.name,
  email: contact.email
});

const runFlow = async (
  getSession: Whatsapp,
  flowId: number,
  companyId: number,
  ticket: Ticket,
  contact: Contact
): Promise<boolean> => {
  if (!flowId) return false;

  const flow = await FlowBuilderModel.findOne({
    where: {
      id: flowId,
      company_id: companyId
    }
  });

  if (!flow?.flow) return false;

  const nodes: INodes[] = flow.flow["nodes"];
  const connections: IConnections[] = flow.flow["connections"];

  if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
    return false;
  }

  await ticket.update({
    flowWebhook: true,
    lastFlowId: null,
    dataWebhook: { status: "process" },
    isBot: true,
    status: ticket.status === "open" ? "open" : "pending"
  });
  await ticket.reload();

  await ActionsWebhookFacebookService(
    getSession,
    flowId,
    companyId,
    nodes,
    connections,
    nodes[0].id,
    null,
    "",
    "",
    null,
    ticket.id,
    mountContact(contact)
  );

  return true;
};

export const runFacebookKeywordCampaigns = async ({
  ticket,
  companyId,
  getSession,
  contact,
  messageBody
}: RunArgs): Promise<boolean> => {
  if (!messageBody) {
    return false;
  }

  if (ticket.status === "open" && ticket.userId) {
    return false;
  }

  if (ticket.flowWebhook && ticket.lastFlowId) {
    return false;
  }

  const activeCampaigns = await FlowCampaignModel.findAll({
    where: {
      companyId,
      status: true
    }
  });

  const matchingCampaign = activeCampaigns.find(campaign => {
    try {
      return campaign.matchesMessage(messageBody, getSession.id);
    } catch {
      return false;
    }
  });

  if (!matchingCampaign) {
    return false;
  }

  return runFlow(
    getSession,
    matchingCampaign.flowId,
    companyId,
    ticket,
    contact
  );
};
