import LeadSale from "../../models/LeadSale";
import LeadPipeline from "../../models/LeadPipeline";
import Contact from "../../models/Contact";
import AppError from "../../errors/AppError";
import { isLeadSaleWon } from "../../utils/leadSaleWonStatus";
import { decrementInventoryOnSaleWon } from "../InventoryServices/DecrementInventoryOnSaleWonService";
import logger from "../../utils/logger";

interface Request {
  name: string;
  description?: string;
  status?: string;
  value?: number;
  pipelineId?: number;
  companyName?: string;
  phone?: string;
  email?: string;
  site?: string;
  origin?: string;
  attribution?: any;
  document?: string;
  birthDate?: string | Date;
  address?: any;
  tags?: string[];
  products?: any[];
  contactId?: number;
  responsibleId?: number;
  date?: string | Date;
  dateEnd?: string | Date;
  companyId: number;
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

const CreateService = async ({
  name,
  description,
  status = "novo",
  value = 0,
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
  date,
  dateEnd,
  pipelineId,
  companyId
}: Request): Promise<LeadSale> => {
  const trimmedName = String(name || "").trim();
  if (!trimmedName) {
    throw new AppError("Nome do lead é obrigatório.", 400);
  }

  let finalPipelineId = pipelineId;
  if (finalPipelineId === undefined || finalPipelineId === null) {
    const first = await LeadPipeline.findOne({
      where: { companyId },
      order: [["id", "ASC"]]
    });
    if (first) finalPipelineId = first.id as any;
  }

  let finalAttribution = attribution || null;

  if (contactId && !finalAttribution) {
    const contact = await Contact.findOne({
      where: { id: contactId, companyId }
    });
    if (contact) {
      finalAttribution = (contact as any).attribution || null;
    }
  }

  let record: LeadSale;
  try {
    record = await LeadSale.create({
      name: trimmedName,
      description,
      status,
      value: Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0,
      pipelineId: finalPipelineId as any,
      companyName,
      phone,
      email: email || null,
      site,
      origin,
      attribution: finalAttribution,
      document,
      birthDate: birthDate ? new Date(birthDate as any) : null,
      address,
      tags,
      products: Array.isArray(products) ? products : null,
      contactId,
      responsibleId,
      date: date ? new Date(date) : null,
      dateEnd: dateEnd ? new Date(dateEnd) : null,
      companyId
    } as any);
  } catch (err) {
    mapDbError(err);
  }

  if (isLeadSaleWon(String(record!.status || ""))) {
    try {
      await decrementInventoryOnSaleWon(record!);
    } catch (e) {
      logger.error(
        `[INVENTORY] falha ao baixar estoque na criação da venda ${record!.id}`,
        e
      );
    }
  }

  return record!;
};

export default CreateService;
