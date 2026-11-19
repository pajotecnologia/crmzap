import Company from "../models/Company";

export function isWhiteLabelCompany(company: Company | null | undefined): boolean {
  if (!company) return false;
  const c = company as any;
  const domain = c.whiteLabelHostDomain && String(c.whiteLabelHostDomain).trim();
  if (domain) return true;
  const meta = c.signupMetadata as Record<string, unknown> | null | undefined;
  if (meta && meta.whiteLabel === true) return true;
  if (String(meta?.signupSource || "") === "whitelabel") return true;
  return false;
}
