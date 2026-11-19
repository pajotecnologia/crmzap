import { Op } from "sequelize";
import LeadSale from "../../models/LeadSale";
import Contact from "../../models/Contact";
import User from "../../models/User";
import LeadPipeline from "../../models/LeadPipeline";
import { toDateBetween } from "../../helpers/dateRangeFilter";
import {
  buildClosedStatusWhere,
  loadWonStatusKeysForCompany,
  mergeWhereWithWonFilter
} from "../../utils/leadSaleWonStatus";
import { attachTicketListsToContacts } from "../../helpers/attachTicketListsToContacts";
import { attachLeadPipelineStageToContacts } from "../../helpers/attachLeadPipelineStageToContacts";

interface Request {
  searchParam?: string;
  pageNumber?: string | number;
  status?: string;
  pipelineId?: string | number;
  responsibleId?: number | string;
  contactId?: number | string;
  dateStart?: string;
  dateEnd?: string;
  createdAtStart?: string;
  createdAtEnd?: string;
  closedAtStart?: string;
  closedAtEnd?: string;
  companyId: number;
}

interface Response {
  leads: LeadSale[];
  count: number;
  hasMore: boolean;
}

const ListService = async ({
  searchParam = "",
  pageNumber = 1,
  status,
  pipelineId,
  responsibleId,
  contactId,
  dateStart,
  dateEnd,
  createdAtStart,
  createdAtEnd,
  closedAtStart,
  closedAtEnd,
  companyId
}: Request): Promise<Response> => {
  const limit = 20;
  const offset = limit * (+pageNumber - 1);

  let where: any = { companyId };

  if (searchParam) {
    const like = `%${searchParam}%`;
    where[Op.or] = [
      { name: { [Op.iLike]: like } },
      { description: { [Op.iLike]: like } },
      { companyName: { [Op.iLike]: like } },
      { phone: { [Op.iLike]: like } }
    ];
  }
  if (status) where.status = status;
  if (pipelineId) {
    const pid = Number(pipelineId);
    if (Number.isFinite(pid)) {
      // Include legacy records (NULL pipeline) only when requesting the first/default pipeline of the company
      const first = await LeadPipeline.findOne({ where: { companyId }, order: [["id", "ASC"]] });
      if (first && Number(first.id) === pid) {
        where[Op.or] = [{ pipelineId: pid }, { pipelineId: { [Op.is]: null } }];
      } else {
        where.pipelineId = pid;
      }
    }
  }
  if (responsibleId) where.responsibleId = responsibleId;
  if (contactId) where.contactId = contactId;

  const entryRange = toDateBetween(dateStart, dateEnd);
  if (entryRange) {
    where.date = { [Op.between]: entryRange };
  }

  const createdRange = toDateBetween(createdAtStart, createdAtEnd);
  if (createdRange) {
    where.createdAt = { [Op.between]: createdRange };
  }

  const closedRange = toDateBetween(closedAtStart, closedAtEnd);
  if (closedRange) {
    const wonStatusKeys = await loadWonStatusKeysForCompany(companyId, pipelineId);
    const closedFilter = buildClosedStatusWhere(wonStatusKeys);
    where = mergeWhereWithWonFilter(where, closedFilter);
    where.updatedAt = { [Op.between]: closedRange };
  }

  const { count, rows } = await LeadSale.findAndCountAll({
    where,
    limit,
    offset,
    order: [["createdAt", "DESC"]],
    include: [
      { model: Contact, attributes: ["id", "name", "number", "profilePicUrl"] },
      { model: User, attributes: ["id", "name"] }
    ]
  });

  // Listas/etapa no Model Sequelize; depois crmSource (plain) e reanexo
  const contactModels = rows.map((r) => r.contact).filter(Boolean) as Contact[];
  await attachTicketListsToContacts(contactModels, companyId);
  await attachLeadPipelineStageToContacts(contactModels, companyId);

  const listsByContactId = new Map<number, any[]>();
  const stageByContactId = new Map<number, any>();
  for (const c of contactModels as any[]) {
    const id = Number(c.id);
    listsByContactId.set(id, c.ticketLists || []);
    stageByContactId.set(id, c.pipelineStage || null);
  }

  const leads = rows.map((r) => r.get({ plain: true }));

  for (const lead of leads as any[]) {
    const cid = Number(lead.contactId || lead.contact?.id || 0);
    const lists = listsByContactId.get(cid) || lead.contact?.ticketLists || [];
    const stage = stageByContactId.get(cid) || lead.contact?.pipelineStage || null;
    lead.ticketLists = lists;
    lead.pipelineStage = stage;
    if (lead.contact) {
      lead.contact.ticketLists = lists;
      lead.contact.pipelineStage = stage;
    }
  }

  return {
    leads: leads as unknown as LeadSale[],
    count,
    hasMore: count > offset + rows.length
  };
};

export default ListService;
