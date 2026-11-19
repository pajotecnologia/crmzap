import LeadSale from "../../models/LeadSale";
import AppError from "../../errors/AppError";
import { isLeadSaleWon } from "../../utils/leadSaleWonStatus";
import { decrementInventoryOnSaleWon } from "../InventoryServices/DecrementInventoryOnSaleWonService";
import logger from "../../utils/logger";

interface Request {
  id: number | string;
  name?: string;
  description?: string;
  status?: string;
  value?: number;
  pipelineId?: number | null;
  companyName?: string;
  phone?: string;
  email?: string;
  site?: string;
  origin?: string;
  attribution?: any;
  document?: string;
  birthDate?: string | Date | null;
  address?: any;
  tags?: string[];
  products?: any[] | null;
  contactId?: number;
  responsibleId?: number;
  date?: string | Date | null;
  dateEnd?: string | Date | null;
  companyId?: number;
}

function mapDbError(err: any): never {
  const msg = String(err?.message || err || "");
  const missingCol =
    msg.match(/column\s+"?(\w+)"?\s+of\s+relation/i)?.[1] ||
    msg.match(/column\s+(\w+)\s+does not exist/i)?.[1];
  if (missingCol || /does not exist/i.test(msg)) {
    throw new AppError(
      `Falha ao salvar lead: coluna ausente no banco (${
        missingCol || "desconhecida"
      }). Rode as migrations e tente novamente.`,
      500
    );
  }
  throw err;
}

const UpdateService = async ({
  id,
  name,
  description,
  status,
  value,
  companyName,
  phone,
  email,
  site,
  origin,
  attribution,
  document,
  birthDate,
  address,
  tags,
  products,
  contactId,
  responsibleId,
  pipelineId,
  date,
  dateEnd,
  companyId
}: Request): Promise<LeadSale> => {
  const where: any = { id };
  if (companyId != null) where.companyId = companyId;

  const record = await LeadSale.findOne({ where });
  if (!record) {
    throw new AppError("Lead não encontrado.", 404);
  }

  if (name !== undefined && !String(name || "").trim()) {
    throw new AppError("Nome do lead é obrigatório.", 400);
  }

  const prevStatus = String(record.status || "");
  const prevWon = isLeadSaleWon(prevStatus);

  const parsedValue = typeof value === "string" ? Number(value) : value;
  const parsedResponsibleId =
    (responsibleId as any) === "" ? null : responsibleId;
  const parsedContactId = (contactId as any) === "" ? null : contactId;
  const parsedDate =
    typeof date === "string" ? (date.trim() ? new Date(date) : null) : date;
  const parsedDateEnd =
    typeof dateEnd === "string"
      ? dateEnd.trim()
        ? new Date(dateEnd)
        : null
      : dateEnd;
  const parsedBirthDate =
    typeof birthDate === "string"
      ? birthDate.trim()
        ? new Date(birthDate)
        : null
      : birthDate;

  const patch: any = {};
  if (name !== undefined) patch.name = String(name).trim();
  if (description !== undefined) patch.description = description;
  if (status !== undefined) patch.status = status;
  if (parsedValue !== undefined && !Number.isNaN(parsedValue as number)) {
    patch.value = Math.round(Number(parsedValue));
  }
  if (companyName !== undefined) patch.companyName = companyName;
  if (phone !== undefined) patch.phone = phone;
  if (email !== undefined) patch.email = email;
  if (site !== undefined) patch.site = site;
  if (origin !== undefined) patch.origin = origin;
  if (attribution !== undefined) patch.attribution = attribution;
  if (document !== undefined) patch.document = document;
  if (birthDate !== undefined) patch.birthDate = parsedBirthDate;
  if (address !== undefined) patch.address = address;
  if (tags !== undefined) patch.tags = tags;
  if (products !== undefined) patch.products = products;
  if (contactId !== undefined) patch.contactId = parsedContactId;
  if (responsibleId !== undefined) patch.responsibleId = parsedResponsibleId;
  if (pipelineId !== undefined) patch.pipelineId = pipelineId;
  if (date !== undefined) patch.date = parsedDate;
  if (dateEnd !== undefined) patch.dateEnd = parsedDateEnd;

  try {
    await record.update(patch);
    await record.reload();
  } catch (err) {
    mapDbError(err);
  }

  const nextWon = isLeadSaleWon(String(record.status || ""));
  if (!prevWon && nextWon) {
    try {
      await decrementInventoryOnSaleWon(record);
    } catch (e) {
      logger.error(`[INVENTORY] falha ao baixar estoque na venda ${record.id}`, e);
    }
  }

  return record;
};

export default UpdateService;
