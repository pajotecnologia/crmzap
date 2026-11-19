import Setting from "../models/Setting";
import { decryptRelaySecret } from "./RelayCrypto";

export const SMTP_RELAY_SETTING_URL = "smtpRelayUrl";
export const SMTP_RELAY_SETTING_SECRET_ENC = "smtpRelaySecretEnc";

export type SmtpRelayResolution = {
  url: string;
  secret: string;
  source: "environment" | "database";
};

/**
 * Relay HTTP → worker (relay de e-mail) que abre SMTP. Prioridade: variáveis de ambiente da API, depois Settings no banco.
 */
export async function resolveSmtpRelayForCompany(companyId: number): Promise<SmtpRelayResolution | null> {
  const envUrl = String(process.env.EMAIL_SMTP_RELAY_URL || "").trim().replace(/\/+$/, "");
  const envSecret = String(process.env.EMAIL_SMTP_RELAY_SECRET || "").trim();
  if (envUrl && envSecret) {
    return { url: envUrl, secret: envSecret, source: "environment" };
  }
  if (envUrl && !envSecret) {
    console.warn(
      "[resolveSmtpRelay] EMAIL_SMTP_RELAY_URL definido mas EMAIL_SMTP_RELAY_SECRET ausente — relay ignorado."
    );
  }
  if (!envUrl && envSecret) {
    console.warn(
      "[resolveSmtpRelay] EMAIL_SMTP_RELAY_SECRET definido mas EMAIL_SMTP_RELAY_URL ausente — relay ignorado."
    );
  }

  const urlRow = await Setting.findOne({ where: { companyId, key: SMTP_RELAY_SETTING_URL } });
  const secRow = await Setting.findOne({ where: { companyId, key: SMTP_RELAY_SETTING_SECRET_ENC } });
  const url = String(urlRow?.value || "").trim().replace(/\/+$/, "");
  if (!url || !secRow?.value) {
    return null;
  }
  const secret = decryptRelaySecret(secRow.value);
  if (!secret) {
    console.warn(
      `[resolveSmtpRelay] companyId=${companyId}: smtpRelaySecretEnc presente mas decifra falhou (SMTP_SECRET_KEY?).`
    );
    return null;
  }
  return { url, secret: String(secret).trim(), source: "database" };
}
