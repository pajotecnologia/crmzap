import AppError from "../../errors/AppError";
import TicketList from "../../models/TicketList";

interface Request {
  name: string;
  color?: string;
  companyId: number;
}

const CreateService = async ({
  name,
  color = "#6366F1",
  companyId
}: Request): Promise<TicketList> => {
  const trimmed = String(name || "").trim();
  if (trimmed.length < 2) {
    throw new AppError("ERR_TICKET_LIST_NAME_SHORT", 400);
  }

  const maxOrder = await TicketList.max("order", { where: { companyId } });
  const nextOrder = Number.isFinite(Number(maxOrder)) ? Number(maxOrder) + 1 : 1;

  try {
    return await TicketList.create({
      name: trimmed,
      color: color || "#6366F1",
      companyId,
      isDefault: false,
      order: nextOrder
    });
  } catch (err: any) {
    if (err?.name === "SequelizeUniqueConstraintError") {
      throw new AppError("ERR_TICKET_LIST_NAME_EXISTS", 400);
    }
    throw err;
  }
};

export default CreateService;
