import TicketList from "../../models/TicketList";
import TicketListContact from "../../models/TicketListContact";
import EnsureDefaultListsService from "./EnsureDefaultListsService";

const ListByContactService = async (
  contactId: number,
  companyId: number
): Promise<TicketList[]> => {
  await EnsureDefaultListsService(companyId);

  const rows = await TicketListContact.findAll({
    where: { contactId, companyId },
    include: [
      {
        model: TicketList,
        as: "ticketList",
        required: true,
        where: { companyId }
      }
    ]
  });

  return rows
    .map(row => row.ticketList)
    .filter(Boolean)
    .sort((a, b) => {
      const orderDiff = Number(a.order || 0) - Number(b.order || 0);
      if (orderDiff !== 0) return orderDiff;
      return Number(a.id) - Number(b.id);
    });
};

export default ListByContactService;
