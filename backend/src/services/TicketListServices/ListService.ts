import TicketList from "../../models/TicketList";
import EnsureDefaultListsService from "./EnsureDefaultListsService";

const ListService = async (companyId: number): Promise<TicketList[]> => {
  await EnsureDefaultListsService(companyId);

  return TicketList.findAll({
    where: { companyId },
    order: [
      ["order", "ASC"],
      ["id", "ASC"]
    ]
  });
};

export default ListService;
