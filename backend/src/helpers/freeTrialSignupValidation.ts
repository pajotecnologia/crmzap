import AppError from "../errors/AppError";

export const FREE_TRIAL_IP_LIMIT = 5;
export const CODIGO_FONTE_INSTALL_URL =
  "https://www.bbsolutioncrm.com.br/codigo-fonte/instalar";

export function validateFreeTrialEmail(email: string): string {
  const e = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    throw new AppError("E-mail inválido.", 400, "EMAIL_INVALID");
  }
  return e;
}

/** Normaliza telefone BR mantendo DDI/DDD e dígitos significativos. */
export function validateFreeTrialPhone(phone: string): string {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("055")) digits = digits.slice(1);
  if (digits.length >= 10 && digits.length <= 11 && !digits.startsWith("55")) {
    digits = `55${digits}`;
  }
  if (!(digits.length === 12 || digits.length === 13) || !digits.startsWith("55")) {
    throw new AppError(
      "Telefone inválido. Informe DDI + DDD + número.",
      400,
      "PHONE_INVALID"
    );
  }
  return digits;
}
