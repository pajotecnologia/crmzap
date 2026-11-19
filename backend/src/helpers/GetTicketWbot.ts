import { getWbot, Session } from "../libs/wbot";
import EnsureTicketWhatsApp from "./EnsureTicketWhatsApp";
import Ticket from "../models/Ticket";

const GetTicketWbot = async (ticket: Ticket): Promise<Session> => {
  const ensured = await EnsureTicketWhatsApp(ticket);
  return getWbot(ensured.whatsappId);
};

export default GetTicketWbot;
