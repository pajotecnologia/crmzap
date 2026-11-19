import { literal } from "sequelize";
import Ticket from "../../models/Ticket";
import AppError from "../../errors/AppError";
import Contact from "../../models/Contact";
import User from "../../models/User";
import Queue from "../../models/Queue";
import Plan from "../../models/Plan";
import Tag from "../../models/Tag";
import Whatsapp from "../../models/Whatsapp";
import Company from "../../models/Company";
import QueueIntegrations from "../../models/QueueIntegrations";
import TicketTag from "../../models/TicketTag";
import ContactWallet from "../../models/ContactWallet";
import { syncTelegramContactProfilePic } from "../TelegramServices/syncTelegramContactProfilePic";
import { normalizeTelegramContactNumber } from "../../utils/normalizeTelegramContactNumber";
import ShowUserService from "../UserServices/ShowUserService";
import { canUserViewTicket } from "../../helpers/canUserViewTicket";
import { getMetaWhatsAppSessionInfo } from "../WhatsAppOficial/getMetaWhatsAppSessionInfo";
import EnsureTicketWhatsApp from "../../helpers/EnsureTicketWhatsApp";
import { attachTicketListsToTicket } from "../../helpers/attachTicketListsToTickets";
import { attachLeadPipelineStageToTickets } from "../../helpers/attachLeadPipelineStageToContacts";
import logger from "../../utils/logger";

const ShowTicketService = async (
  id: string | number,
  companyId: number,
  userId?: number
): Promise<Ticket> => {
  let user: User | null = null;
  if (userId) {
    user = await User.findByPk(userId);
  }

  const whereCondition: any = { id };
  
  if (!user?.super) {
    whereCondition.companyId = companyId;
  }

  const ticketRow = await Ticket.findOne({
    where: whereCondition,
    attributes: [
      "id",
      "uuid",
      "queueId",
      "lastFlowId",
      "flowStopped",
      "dataWebhook",
      "flowWebhook",
      "isGroup",
      "channel",
      "status",
      "contactId",
      "useIntegration",
      "lastMessage",
      "updatedAt",
      "unreadMessages",
      "companyId",
      "whatsappId",
      "imported",
      "lgpdAcceptedAt",
      "amountUsedBotQueues",
      "useIntegration",
      "integrationId",
      "userId",
      "amountUsedBotQueuesNPS",
      "lgpdSendMessageAt",
      "isBot",
      "typebotSessionId",
      "typebotStatus",
      "sendInactiveMessage",
      "fromMe",
      "isOutOfHour",
      "isActiveDemand",
      "typebotSessionTime",
      "hashFlowId",
      [
        literal(
          `(SELECT COUNT(*) > 0 FROM "Messages" AS "agentMsgs" WHERE "agentMsgs"."ticketId" = "Ticket"."id" AND "agentMsgs"."fromAgent" = true)`
        ),
        "hasAgentMessage"
      ]
    ],
    include: [
      {
        model: Contact,
        as: "contact",
        attributes: ["id", "companyId", "name", "number", "email", "profilePicUrl", "acceptAudioMessage", "active", "disableBot", "isGroup", "remoteJid", "urlPicture", "lgpdAcceptedAt"],
        include: [
          "extraInfo",
          "tags",
          {
            association: "wallets",
            attributes: ["id", "name"]
          },
          {
            model: ContactWallet,
            include: [
              {
                model: User,
                attributes: ["id", "name"]
              },
              {
                model: Queue,
                attributes: ["id", "name"]
              }
            ]
          }
        ]
      },
      {
        model: Queue,
        as: "queue",
        attributes: ["id", "name", "color"],
        include: ["chatbots"]
      },
      {
        model: User,
        as: "user",
        attributes: ["id", "name"],
      },
      {
        model: Tag,
        as: "tags",
        attributes: ["id", "name", "color"]
      },
      {
        model: Whatsapp,
        as: "whatsapp",
        attributes: [
          "id",
          "name",
          "groupAsTicket",
          "greetingMediaAttachment",
          "facebookUserToken",
          "facebookUserId",
          "facebookPageUserId",
          "provider",
          "status",
          "token",
          "channel",
          "color",
          "meta_quality_rating",
          "meta_messaging_limit",
          "meta_verified_name",
          "meta_phone_status",
          "promptId",
          "anthropicMultiAgentId",
          "agentDisabled"
        ]
      },
      {
        model: Company,
        as: "company",
        attributes: ["id", "name"],
        include: [{
          model: Plan,
          as: "plan",
          attributes: ["id", "name", "useKanban"]
        }]
      },
      {
        model: QueueIntegrations,
        as: "queueIntegration",
        attributes: ["id", "name"]
      },
      {
        model: TicketTag,
        as: "ticketTags",
        attributes: ["tagId"]
      }
    ]
  });

  let ticket = ticketRow;

  if (ticket?.companyId !== companyId) {
    // throw new AppError("Não é possível consultar registros de outra empresa");
  }

  if (!ticket) {
    throw new AppError("ERR_NO_TICKET_FOUND", 404);
  }

  if (userId) {
    const viewer = await ShowUserService(userId, companyId);
    if (
      !canUserViewTicket(
        viewer,
        {
          userId: ticket.userId,
          queueId: ticket.queueId,
          status: ticket.status,
          companyId: ticket.companyId,
          isBot: ticket.isBot,
          useIntegration: ticket.useIntegration
        }
      )
    ) {
      throw new AppError("ERR_NO_PERMISSION", 403);
    }
  }

  if (
    ticket.channel === "telegram_oficial" &&
    ticket.contact &&
    ticket.whatsapp?.status === "CONNECTED"
  ) {
    try {
      const chatId = normalizeTelegramContactNumber(ticket.contact.number);
      const updated = await syncTelegramContactProfilePic({
        connection: ticket.whatsapp,
        contact: ticket.contact,
        chatId,
        userId:
          !ticket.contact.isGroup && /^-?\d+$/.test(chatId)
            ? Number(chatId)
            : undefined,
        isGroup: !!ticket.contact.isGroup,
        force: true
      });
      ticket.contact = updated;
    } catch {
      /* ticket abre mesmo sem foto */
    }
  }

  if (
    (ticket.channel === "whatsapp_oficial" ||
      ticket.channel === "whatsapp_oficial_api") &&
    ticket.contact
  ) {
    try {
      const { syncOficialContactProfilePic } = await import(
        "../WhatsAppOficial/syncOficialContactProfilePic"
      );
      ticket.contact = await syncOficialContactProfilePic({
        contact: ticket.contact,
        companyId,
        force: false
      });
    } catch {
      /* ticket abre mesmo sem foto */
    }
  }

  if (["whatsapp", "whatsapp_oficial"].includes(String(ticket.channel || ""))) {
    try {
      ticket = await EnsureTicketWhatsApp(ticket, {
        throwOnMissing: false,
        repairSiblings: true
      });
      // Recarregar includes (whatsapp) após possível rebind
      if (ticket.whatsappId && !ticket.whatsapp) {
        const wa = await Whatsapp.findByPk(ticket.whatsappId);
        if (wa) {
          (ticket as any).setDataValue("whatsapp", wa);
          (ticket as any).whatsapp = wa;
        }
      }
    } catch (err) {
      logger.warn(
        { err, ticketId: ticket.id },
        "[ShowTicket] EnsureTicketWhatsApp soft-fail"
      );
    }
  }

  if (ticket.channel === "whatsapp_oficial") {
    const session = await getMetaWhatsAppSessionInfo(ticket.id, companyId);
    (ticket as any).setDataValue("metaWhatsAppSession", session);
  }

  await attachTicketListsToTicket(ticket, companyId);
  await attachLeadPipelineStageToTickets([ticket], companyId);

  return ticket;
};

export default ShowTicketService;
