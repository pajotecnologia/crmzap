import AppError from "../../errors/AppError";
import TicketListContact from "../../models/TicketListContact";

interface Request {
  contactId: number;
  ticketListId: number;
  companyId: number;
}

const RemoveContactService = async ({
  contactId,
  ticketListId,
  companyId
}: Request): Promise<void> => {
  const row = await TicketListContact.findOne({
    where: { contactId, ticketListId, companyId }
  });

  if (!row) {
    throw new AppError("ERR_TICKET_LIST_CONTACT_NOT_FOUND", 404);
  }

  await row.destroy();
};

export default RemoveContactService;
