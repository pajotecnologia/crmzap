import AppError from "../../errors/AppError";
import Contact from "../../models/Contact";
import TicketList from "../../models/TicketList";
import TicketListContact from "../../models/TicketListContact";

interface Request {
  contactId: number;
  ticketListId: number;
  companyId: number;
}

const AddContactService = async ({
  contactId,
  ticketListId,
  companyId
}: Request): Promise<TicketList> => {
  const [contact, list] = await Promise.all([
    Contact.findOne({ where: { id: contactId, companyId } }),
    TicketList.findOne({ where: { id: ticketListId, companyId } })
  ]);

  if (!contact) throw new AppError("ERR_NO_CONTACT_FOUND", 404);
  if (!list) throw new AppError("ERR_NO_TICKET_LIST_FOUND", 404);

  const existing = await TicketListContact.findOne({
    where: { contactId, ticketListId, companyId }
  });

  if (!existing) {
    await TicketListContact.create({
      contactId,
      ticketListId,
      companyId
    });
  }

  return list;
};

export default AddContactService;
