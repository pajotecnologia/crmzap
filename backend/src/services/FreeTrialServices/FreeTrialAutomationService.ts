import RegistroGratis from "../../models/RegistroGratis";
import { PLATFORM_DEFAULT_COMPANY_ID } from "../../constants/platformCompany";

export interface FreeTrialAutomationInput {
  name: string;
  email: string;
  phone: string;
  companyId?: number;
}

/** Formata número de telefone brasileiro para formato limpo com 55 + DDD + Número. */
export function formatPhoneNumber(phone: string): string {
  let digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("0")) {
    digits = digits.replace(/^0+/, "");
  }

  if (!digits.startsWith("55") && (digits.length === 10 || digits.length === 11)) {
    digits = `55${digits}`;
  }

  if (digits.startsWith("55") && digits.length === 12) {
    const ddd = digits.substring(2, 4);
    const numPart = digits.substring(4);
    if (["7", "8", "9"].includes(numPart[0])) {
      digits = `55${ddd}9${numPart}`;
    }
  }

  return digits;
}

/**
 * Registra o cadastro do teste grátis na tabela RegistroGratis.
 * Disparos automáticos (WhatsApp/E-mail) devem ser configurados pelo próprio operador.
 */
export async function executeFreeTrialAutomation(
  input: FreeTrialAutomationInput
): Promise<RegistroGratis> {
  const { name, email, phone } = input;
  const cleanPhone = formatPhoneNumber(phone);

  return RegistroGratis.create({
    companyId: PLATFORM_DEFAULT_COMPANY_ID,
    name: name || "Usuário Teste",
    email: email || "",
    phone: cleanPhone,
    statusWhatsapp: "NAO_CONFIGURADO",
    statusEmail: "NAO_CONFIGURADO",
    statusAutomation: "REGISTRADO",
    logs: `[${new Date().toISOString()}] Cadastro registrado para ${email} / ${cleanPhone}`
  } as any);
}

export default executeFreeTrialAutomation;
