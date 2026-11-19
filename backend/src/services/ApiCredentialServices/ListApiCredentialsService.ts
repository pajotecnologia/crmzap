import { Op } from "sequelize";
import ApiCredential from "../../models/ApiCredential";
import Company from "../../models/Company";

interface Request {
  companyId: number;
}

const ListApiCredentialsService = async ({
  companyId
}: Request): Promise<ApiCredential[]> => {
  return ApiCredential.findAll({
    where: {
      companyId,
      revokedAt: { [Op.is]: null }
    },
    include: [
      {
        model: Company,
        attributes: ["id", "name"],
        required: false
      }
    ],
    order: [["created_at", "DESC"]]
  });
};

export default ListApiCredentialsService;
