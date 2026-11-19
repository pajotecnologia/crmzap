import { WASocket } from "baileys";
import AppError from "../../errors/AppError";
import GetTicketWbot from "../../helpers/GetTicketWbot";
import GetWbotMessage from "../../helpers/GetWbotMessage";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import { deleteMetaCloudMessage } from "../WhatsAppOficial/deleteMetaCloudMessage";
import logger from "../../utils/logger";

const isOficialChannel = (channel?: string | null): boolean => {
  const c = String(channel || "").toLowerCase();
  return c === "whatsapp_oficial" || c === "whatsapp_oficial_api";
};

const DeleteWhatsAppMessage = async (
  messageId: string,
  companyId?: string | number
): Promise<Message> => {
  const message = await Message.findOne({
    where: {
      id: messageId,
      companyId
    },
    include: [
      {
        model: Ticket,
        as: "ticket",
        include: [
          "contact",
          {
            model: Whatsapp,
            as: "whatsapp"
          }
        ]
      }
    ]
  });

  if (!message) {
    throw new AppError("No message found with this ID.");
  }

  const { ticket } = message;
  const channel = ticket?.channel || ticket?.whatsapp?.channel;

  if (!message.isPrivate) {
    if (isOficialChannel(channel)) {
      const whatsapp =
        ticket.whatsapp ||
        (ticket.whatsappId
          ? await Whatsapp.findByPk(ticket.whatsappId)
          : null);

      if (!whatsapp) {
        throw new AppError("ERR_NO_WAPP_FOUND");
      }

      const wamid = String(message.wid || "").trim();
      const result = await deleteMetaCloudMessage(whatsapp, wamid);

      if (!result.allowLocalDelete) {
        logger.error(
          `[DeleteWhatsAppMessage] oficial bloqueou exclusão local: ${result.detail}`
        );
        throw new AppError("ERR_DELETE_WAPP_MSG");
      }

      if (!result.remoteDeleted) {
        logger.info(
          `[DeleteWhatsAppMessage] oficial soft-delete local messageId=${message.id} wid=${wamid} (${result.detail})`
        );
      }
    } else {
      // WhatsApp Web (Baileys): apaga para todos via protocolo delete
      try {
        const messageToDelete = await GetWbotMessage(ticket, messageId);
        const wbot = await GetTicketWbot(ticket);
        const menssageDelete = messageToDelete as Message;
        const jsonStringToParse = JSON.parse(menssageDelete.dataJson);

        await (wbot as WASocket).sendMessage(menssageDelete.remoteJid, {
          delete: jsonStringToParse.key
        });
      } catch (err) {
        console.log(err);
        throw new AppError("ERR_DELETE_WAPP_MSG");
      }
    }
  }

  if (!message.isPrivate) {
    await message.update({ isDeleted: true });
  }

  await message.reload({
    include: [
      "contact",
      {
        model: Ticket,
        as: "ticket",
        include: ["contact", "whatsapp", "queue"]
      },
      {
        model: Message,
        as: "quotedMsg",
        include: ["contact"]
      }
    ]
  });

  return message;
};

export default DeleteWhatsAppMessage;
