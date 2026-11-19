import TicketList from "../../models/TicketList";
import { DEFAULT_TICKET_LISTS } from "./defaultLists";

const EnsureDefaultListsService = async (companyId: number): Promise<void> => {
  const existing = await TicketList.findAll({
    where: { companyId, isDefault: true },
    attributes: ["id", "name"]
  });

  const existingNames = new Set(
    existing.map(item => String(item.name || "").trim().toLowerCase())
  );

  const now = new Date();
  const missing = DEFAULT_TICKET_LISTS.filter(
    item => !existingNames.has(item.name.toLowerCase())
  );

  if (!missing.length) return;

  await TicketList.bulkCreate(
    missing.map(item => ({
      name: item.name,
      color: item.color,
      order: item.order,
      isDefault: true,
      companyId,
      createdAt: now,
      updatedAt: now
    }))
  );
};

export default EnsureDefaultListsService;
