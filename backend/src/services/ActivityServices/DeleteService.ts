import Activity from "../../models/Activity";
import AppError from "../../errors/AppError";
const DeleteService = async (
  id: string | number,
  companyId?: number
): Promise<void> => {
  const where: { id: string | number; companyId?: number } = { id };
  if (companyId != null) where.companyId = companyId;

  const record = await Activity.findOne({ where });

  if (!record) {
    throw new AppError("ERR_NO_ACTIVITY_FOUND", 404);
  }

  await record.destroy();
};

export default DeleteService;

