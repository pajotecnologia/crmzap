import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import { sendTelegramUserMessage } from "./sendTelegramUserMessage";
import { verifyOutboundTelegramMessage } from "../TelegramServices/verifyTelegramMessage";

export default async function sendTelegramUserMessageFromTicket({
  body,
  ticket
}: {
  body: string;
  ticket: Ticket;
}): Promise<void> {
  const whatsapp = await Whatsapp.findByPk(ticket.whatsappId);
  if (!whatsapp || whatsapp.channel !== "telegram_oficial") {
    throw new Error("Conexão Telegram Oficial inválida para este ticket.");
  }

  const sendResult = await sendTelegramUserMessage(
    whatsapp,
    ticket.contact.number,
    body,
    ticket
  );

  await verifyOutboundTelegramMessage(
    sendResult,
    ticket,
    ticket.contact,
    body
  );
}
