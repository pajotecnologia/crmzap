import { Op } from "sequelize";
import QuickMessage from "../../models/QuickMessage";
import Company from "../../models/Company";
import QuickMessageComponent from "../../models/QuickMessageComponent";
import ShowCompanyService from "../CompanyService/ShowCompanyService";
import { resolveUseWhatsappOfficial } from "../../helpers/companyPlanFeatures";

type Params = {
  companyId: string;
  userId: string;
  isOficial: string;
  whatsappId?: string;
  status?: string;
};

const FindService = async ({
  companyId,
  userId,
  isOficial,
  whatsappId,
  status
}: Params): Promise<QuickMessage[]> => {
  const company = await ShowCompanyService(companyId);

  const useOficial = resolveUseWhatsappOfficial(company);

  // isOficial:
  // - "true"  → só templates/mensagens oficiais
  // - "false" → respostas rápidas de texto (não oficiais)
  // - "all"/outros → ambos (quando o plano tem Oficial)
  const isOficialFilter = !useOficial
    ? false
    : isOficial === "true"
      ? true
      : isOficial === "false"
        ? false
        : { [Op.or]: [true, false] };

  const notes: QuickMessage[] = await QuickMessage.findAll({
    where: {
      companyId,
      [Op.or]: [
        {
          visao: true
        },
        {
          userId
        }
      ],
      ...(useOficial && isOficial === "true" && whatsappId
        ? { whatsappId: Number(whatsappId) }
        : {}),
      ...(status ? { status } : {}),
      isOficial: isOficialFilter
    },
    include: [
      {
        model: Company,
        as: "company",
        attributes: ["id", "name"]
      },
      {
        model: QuickMessageComponent,
        as: "components",
        attributes: ["id", "type", "text", "quickMessageId", "buttons", "format", "example"],
        order: [["quickMessageId", "ASC"], ["id", "ASC"]]
      }
    ],
  });

  return notes as QuickMessage[];
};

export default FindService;
