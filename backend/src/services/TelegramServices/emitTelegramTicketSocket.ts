import { getIO } from "../../libs/socket";
import Ticket from "../../models/Ticket";
import ShowTicketService from "../TicketServices/ShowTicketService";

/** Namespace Socket.IO do workspace da empresa (ex.: /1) */
export function companySocketNamespace(companyId: number | string): string {
  return `/${String(companyId)}`;
}

export async function emitTelegramTicketSocket(
  ticket: Ticket,
  action: "create" | "update"
): Promise<void> {
  const companyId = ticket.companyId;
  const full = await ShowTicketService(ticket.id, companyId);
  const io = getIO();
  io.of(companySocketNamespace(companyId)).emit(
    `company-${companyId}-ticket`,
    {
      action,
      ticket: full
    }
  );
}
