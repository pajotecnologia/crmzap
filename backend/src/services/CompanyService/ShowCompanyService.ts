import Company from "../../models/Company";
import AppError from "../../errors/AppError";
import { resolveUseWhatsappOfficial } from "../../helpers/companyPlanFeatures";

const ShowCompanyService = async (id: string | number): Promise<Company> => {
  const company = await Company.findByPk(id, {
    include: ["plan"]
  });
  
  if (!company) {
    throw new AppError("ERR_NO_COMPANY_FOUND", 404);
  }

  if (company.plan) {
    (company.plan as any).useWhatsappOfficial = resolveUseWhatsappOfficial(company);
  }

  return company;
};

export default ShowCompanyService;
