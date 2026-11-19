import AppError from "../../errors/AppError";
import TicketList from "../../models/TicketList";
import TicketListContact from "../../models/TicketListContact";

const DeleteService = async (
  id: number | string,
  companyId: number
): Promise<void> => {
  const list = await TicketList.findOne({
    where: { id, companyId }
  });

  if (!list) {
    throw new AppError("ERR_NO_TICKET_LIST_FOUND", 404);
  }

  await TicketListContact.destroy({
    where: { ticketListId: list.id, companyId }
  });
  await list.destroy();
};

export default DeleteService;
