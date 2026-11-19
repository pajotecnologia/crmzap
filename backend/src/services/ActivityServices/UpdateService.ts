import AppError from "../../errors/AppError";
import Activity from "../../models/Activity";
import Project from "../../models/Project";
import { syncActivityToGoogleCalendar } from "../GoogleWorkspaceServices/googleCalendarSyncService";

interface Data {
  id: number | string;
  title?: string;
  description?: string;
  type?: string;
  status?: string;
  date?: Date;
  dateEnd?: Date;
  owner?: string;
  location?: string;
  address?: string;
  phone?: string;
  link?: string;
  eventColor?: string;
  userId?: number;
  projectId?: number | null;
  contactId?: number | null;
  leadId?: number | null;
}

const UpdateService = async (data: Data): Promise<Activity> => {
  const { id, ...rest } = data;

  const record = await Activity.findByPk(id);

  if (!record) {
    throw new AppError("ERR_NO_ACTIVITY_FOUND", 404);
  }

  const patch: Record<string, unknown> = {};
  Object.keys(rest).forEach((key) => {
    const value = (rest as Record<string, unknown>)[key];
    if (value !== undefined) patch[key] = value;
  });

  await record.update(patch);

  await record.reload({
    include: [{ model: Project, as: "project", attributes: ["id", "name"] }]
  });

  syncActivityToGoogleCalendar(record).catch(() => {});

  return record;
};

export default UpdateService;

