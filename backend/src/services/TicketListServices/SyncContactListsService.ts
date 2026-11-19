import AppError from "../../errors/AppError";
import Contact from "../../models/Contact";
import TicketList from "../../models/TicketList";
import TicketListContact from "../../models/TicketListContact";
import ListByContactService from "./ListByContactService";

interface Request {
  contactId: number;
  companyId: number;
  listIds: number[];
}

const SyncContactListsService = async ({
  contactId,
  companyId,
  listIds
}: Request): Promise<TicketList[]> => {
  const contact = await Contact.findOne({
    where: { id: contactId, companyId }
  });
  if (!contact) {
    throw new AppError("ERR_NO_CONTACT_FOUND", 404);
  }

  const uniqueIds = Array.from(
    new Set(
      (Array.isArray(listIds) ? listIds : [])
        .map(Number)
        .filter(id => Number.isFinite(id) && id > 0)
    )
  );

  const validLists = uniqueIds.length
    ? await TicketList.findAll({
        where: { companyId, id: uniqueIds },
        attributes: ["id"]
      })
    : [];

  const validIds = validLists.map(item => item.id);

  const current = await TicketListContact.findAll({
    where: { contactId, companyId }
  });

  const currentIds = current.map(item => item.ticketListId);
  const toAdd = validIds.filter(id => !currentIds.includes(id));
  const toRemove = current.filter(item => !validIds.includes(item.ticketListId));

  if (toRemove.length) {
    await TicketListContact.destroy({
      where: {
        id: toRemove.map(item => item.id)
      }
    });
  }

  if (toAdd.length) {
    const now = new Date();
    await TicketListContact.bulkCreate(
      toAdd.map(ticketListId => ({
        ticketListId,
        contactId,
        companyId,
        createdAt: now,
        updatedAt: now
      }))
    );
  }

  return ListByContactService(contactId, companyId);
};

export default SyncContactListsService;
