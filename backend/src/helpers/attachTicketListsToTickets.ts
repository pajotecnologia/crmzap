import Ticket from "../models/Ticket";
import { attachTicketListsToContacts } from "./attachTicketListsToContacts";

/**
 * Anexa ticketLists aos contacts dos tickets SEM JOIN no ListTickets/ShowTicket.
 */
export async function attachTicketListsToTickets(
  tickets: Ticket[],
  companyId: number
): Promise<void> {
  if (!Array.isArray(tickets) || tickets.length === 0) return;
  const contacts = tickets.map((t) => t.contact).filter(Boolean);
  await attachTicketListsToContacts(contacts as any, companyId);
}

export async function attachTicketListsToTicket(
  ticket: Ticket,
  companyId: number
): Promise<void> {
  await attachTicketListsToTickets([ticket], companyId);
}
