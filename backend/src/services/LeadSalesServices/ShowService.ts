import LeadSale from "../../models/LeadSale";
import Contact from "../../models/Contact";
import User from "../../models/User";
import { attachTicketListsToContacts } from "../../helpers/attachTicketListsToContacts";
import { attachLeadPipelineStageToContacts } from "../../helpers/attachLeadPipelineStageToContacts";
const ShowService = async (id: number | string): Promise<LeadSale> => {
  const record = await LeadSale.findByPk(id as any, {
    include: [
      { model: Contact, attributes: ["id", "name", "number", "profilePicUrl"] },
      { model: User, attributes: ["id", "name"] }
    ]
  });
  if (!record) {
    throw new Error("Lead sale not found");
  }

  if (record.contact && record.companyId) {
    await attachTicketListsToContacts([record.contact], record.companyId);
    await attachLeadPipelineStageToContacts([record.contact], record.companyId);
  }

  const plain = record.get({ plain: true }) as any;
  const lists = (record.contact as any)?.ticketLists || [];
  const stage = (record.contact as any)?.pipelineStage || null;
  plain.ticketLists = lists;
  plain.pipelineStage = stage;
  if (plain.contact) {
    plain.contact.ticketLists = lists;
    plain.contact.pipelineStage = stage;
  }

  return plain as LeadSale;
};

export default ShowService;
