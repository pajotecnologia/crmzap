import sequelize from "../database";

export type CompanyOptionalColumns = {
  signupMetadata: boolean;
  whiteLabelHostDomain: boolean;
  allowOrgManualVisualIdentity: boolean;
  accountType: boolean;
  trialStartedAt: boolean;
  trialExpiresAt: boolean;
  trialStatus: boolean;
  onboardingProgress: boolean;
};

let cache: CompanyOptionalColumns | null = null;

function tableHasColumn(
  columnKeys: string[],
  ...candidates: string[]
): boolean {
  const lower = columnKeys.map((k) => k.toLowerCase());
  for (const c of candidates) {
    if (lower.includes(c.toLowerCase())) return true;
  }
  return false;
}

async function describeCompaniesTable(): Promise<Record<string, unknown>> {
  const qi = sequelize.getQueryInterface();
  for (const name of ["Companies", "companies"]) {
    try {
      const desc = await qi.describeTable(name);
      if (desc && Object.keys(desc).length) {
        return desc as Record<string, unknown>;
      }
    } catch {
      /* tenta próximo nome */
    }
  }
  return {};
}

/**
 * Colunas opcionais (migrations incrementais). Usa describeTable no schema real —
 * information_schema no Postgres costuma divergir de nomes/tabelas e gerava falso positivo.
 */
export async function getCompanyOptionalColumns(): Promise<CompanyOptionalColumns> {
  if (cache) return cache;

  try {
    const dialect = sequelize.getDialect();
    if (dialect !== "postgres") {
      cache = {
        signupMetadata: true,
        whiteLabelHostDomain: true,
        allowOrgManualVisualIdentity: true,
        accountType: true,
        trialStartedAt: true,
        trialExpiresAt: true,
        trialStatus: true,
        onboardingProgress: true
      };
      return cache;
    }

    const desc = await describeCompaniesTable();
    const columnKeys = Object.keys(desc || {});

    cache = {
      signupMetadata: tableHasColumn(columnKeys, "signupMetadata"),
      whiteLabelHostDomain: tableHasColumn(columnKeys, "whiteLabelHostDomain"),
      allowOrgManualVisualIdentity: tableHasColumn(
        columnKeys,
        "allowOrgManualVisualIdentity"
      ),
      accountType: tableHasColumn(columnKeys, "accountType"),
      trialStartedAt: tableHasColumn(columnKeys, "trialStartedAt"),
      trialExpiresAt: tableHasColumn(columnKeys, "trialExpiresAt"),
      trialStatus: tableHasColumn(columnKeys, "trialStatus"),
      onboardingProgress: tableHasColumn(columnKeys, "onboardingProgress")
    };
    return cache;
  } catch {
    cache = {
      signupMetadata: false,
      whiteLabelHostDomain: false,
      allowOrgManualVisualIdentity: false,
      accountType: false,
      trialStartedAt: false,
      trialExpiresAt: false,
      trialStatus: false,
      onboardingProgress: false
    };
    return cache;
  }
}

/** Para testes ou após migrations manuais */
export function resetCompanyOptionalColumnsCache(): void {
  cache = null;
}

/** Include de Company em ShowUserService / auth — nunca pedir colunas que o PG não tem. */
export async function getCompanyAttributesForUserInclude(): Promise<string[]> {
  const cols = await getCompanyOptionalColumns();
  const attrs = ["id", "name", "dueDate", "document", "recurrence"];
  if (cols.allowOrgManualVisualIdentity) {
    attrs.push("allowOrgManualVisualIdentity");
  }
  if (cols.whiteLabelHostDomain) {
    attrs.push("whiteLabelHostDomain");
  }
  if (cols.signupMetadata) {
    attrs.push("signupMetadata");
  }
  if (cols.accountType) attrs.push("accountType");
  if (cols.trialStartedAt) attrs.push("trialStartedAt");
  if (cols.trialExpiresAt) attrs.push("trialExpiresAt");
  if (cols.trialStatus) attrs.push("trialStatus");
  if (cols.onboardingProgress) attrs.push("onboardingProgress");
  return attrs;
}

/** Company.findByPk no fluxo de tema público (GetPublicSettingService). */
export async function getCompanyAttributesForPublicThemeResolve(): Promise<string[]> {
  const cols = await getCompanyOptionalColumns();
  const attrs = ["id"];
  if (cols.allowOrgManualVisualIdentity) {
    attrs.push("allowOrgManualVisualIdentity");
  }
  if (cols.whiteLabelHostDomain) {
    attrs.push("whiteLabelHostDomain");
  }
  if (cols.signupMetadata) {
    attrs.push("signupMetadata");
  }
  return attrs;
}
