/** E-mails com acesso à UI de Identidade Visual independente do flag da empresa. */
export const VISUAL_IDENTITY_EMAIL_ALLOWLIST: string[] = [];

/** Chaves persistidas em Settings ligadas ao tema / marca (cores, logos, idiomas da UI). */
export const PUBLIC_THEME_SETTING_KEYS = [
  "userCreation",
  "primaryColorLight",
  "primaryColorDark",
  "buttonPrimaryColorLight",
  "buttonPrimaryColorDark",
  "buttonPrimaryTextColorLight",
  "buttonPrimaryTextColorDark",
  "buttonSecondaryColorLight",
  "buttonSecondaryColorDark",
  "topbarColorLight",
  "topbarColorDark",
  "sidebarColorLight",
  "sidebarColorDark",
  "chartColorLight",
  "chartColorDark",
  "appLogoLight",
  "appLogoDark",
  "appLogoFavicon",
  "appLogoTickets",
  "appName",
  "enabledLanguages",
  "appLogoBackgroundLight",
  "appLogoBackgroundDark"
] as const;

export type PublicThemeSettingKey = (typeof PUBLIC_THEME_SETTING_KEYS)[number];
