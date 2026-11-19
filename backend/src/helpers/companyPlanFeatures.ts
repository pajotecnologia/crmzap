type CompanyPlanFeatureSource = {
  useWhatsappOfficial?: boolean | null;
  plan?: { useWhatsappOfficial?: boolean | null } | null;
};

/** Plano da org + override em Company (Settings → Assinaturas). */
export function resolveUseWhatsappOfficial(
  company: CompanyPlanFeatureSource | null | undefined
): boolean {
  if (!company) return false;
  if (
    company.useWhatsappOfficial !== null &&
    company.useWhatsappOfficial !== undefined
  ) {
    return Boolean(company.useWhatsappOfficial);
  }
  return Boolean(company.plan?.useWhatsappOfficial);
}
