import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import { normalizeJid } from "../../utils";
import logger from "../../utils/logger";
import { ENABLE_LID_DEBUG } from "../../config/debug";

const digitsOnly = (value: string): string =>
  String(value || "").replace(/\D/g, "");

const isPlausiblePhone = (digits: string): boolean =>
  digits.length >= 10 && digits.length <= 15;

/**
 * remoteJid vindo de @lid convertido para @s.whatsapp.net costuma ser ID interno
 * (ex.: 10497118191705@...) e não o telefone real — Baileys dá timeout no envio.
 */
const remoteJidConflictsWithPhone = (
  remoteJid: string,
  phoneDigits: string,
  lid?: string | null
): boolean => {
  if (!remoteJid?.includes("@") || !isPlausiblePhone(phoneDigits)) {
    return false;
  }
  const remoteDigits = digitsOnly(remoteJid.split("@")[0] || "");
  if (!remoteDigits || remoteDigits === phoneDigits) {
    return false;
  }
  if (lid && String(lid).trim() !== "") {
    return true;
  }
  return remoteDigits.length > 13;
};

const jidFromContact = (contact: Contact, isGroup: boolean): string => {
  const suffix = isGroup ? "g.us" : "s.whatsapp.net";
  const phoneDigits = digitsOnly(contact.number);

  if (isPlausiblePhone(phoneDigits)) {
    if (
      contact.remoteJid &&
      !remoteJidConflictsWithPhone(contact.remoteJid, phoneDigits, contact.lid)
    ) {
      const normalized = normalizeJid(contact.remoteJid);
      if (ENABLE_LID_DEBUG) {
        logger.info(`[RDS-LID] getJidOf - remoteJid alinhado ao número: ${normalized}`);
      }
      return normalized;
    }
    const fromNumber = normalizeJid(`${phoneDigits}@${suffix}`);
    if (ENABLE_LID_DEBUG) {
      logger.info(`[RDS-LID] getJidOf - Usando número do contato: ${fromNumber}`);
    }
    return fromNumber;
  }

  const lidRaw = String(contact.lid || "").trim();
  if (lidRaw.includes("@lid")) {
    if (ENABLE_LID_DEBUG) {
      logger.info(`[RDS-LID] getJidOf - Usando LID nativo: ${lidRaw}`);
    }
    return lidRaw;
  }

  if (contact.remoteJid && contact.remoteJid.includes("@")) {
    return normalizeJid(contact.remoteJid);
  }

  if (phoneDigits) {
    return normalizeJid(`${phoneDigits}@${suffix}`);
  }

  throw new Error("Contact without valid JID");
};

export function getJidOf(reference: string | Contact | Ticket): string {
  let address = reference;
  let isGroup = false;

  if (reference instanceof Contact) {
    return jidFromContact(reference, reference.isGroup);
  }

  if (reference instanceof Ticket) {
    const contact = reference.contact || (reference as any).Contact;
    if (contact) {
      return jidFromContact(contact, reference.isGroup);
    }
    const ticketAny = reference as any;
    const rawNumber = ticketAny.contactNumber || ticketAny.number;
    if (rawNumber) {
      const phoneDigits = digitsOnly(rawNumber);
      if (isPlausiblePhone(phoneDigits)) {
        return normalizeJid(`${phoneDigits}@${reference.isGroup ? "g.us" : "s.whatsapp.net"}`);
      }
    }
    throw new Error("Ticket without contact for JID resolution");
  }

  if (typeof address !== "string") {
    throw new Error("Invalid reference type");
  }

  if (address.includes("@")) {
    return normalizeJid(address);
  }

  // Construir o JID e normalizar
  const jid = `${address}@${isGroup ? "g.us" : "s.whatsapp.net"}`;
  return normalizeJid(jid);
}
