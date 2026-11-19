import AppError from "../../errors/AppError";
import TicketList from "../../models/TicketList";

interface Request {
  id: number | string;
  companyId: number;
  name?: string;
  color?: string;
  order?: number;
}

const UpdateService = async ({
  id,
  companyId,
  name,
  color,
  order
}: Request): Promise<TicketList> => {
  const list = await TicketList.findOne({
    where: { id, companyId }
  });

  if (!list) {
    throw new AppError("ERR_NO_TICKET_LIST_FOUND", 404);
  }

  const patch: any = {};
  if (name !== undefined) {
    const trimmed = String(name || "").trim();
    if (trimmed.length < 2) {
      throw new AppError("ERR_TICKET_LIST_NAME_SHORT", 400);
    }
    patch.name = trimmed;
  }
  if (color !== undefined) patch.color = color;
  if (order !== undefined) patch.order = order;

  try {
    await list.update(patch);
  } catch (err: any) {
    if (err?.name === "SequelizeUniqueConstraintError") {
      throw new AppError("ERR_TICKET_LIST_NAME_EXISTS", 400);
    }
    throw err;
  }

  return list.reload();
};

export default UpdateService;
