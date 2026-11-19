import AppError from "../../errors/AppError";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import User from "../../models/User";
import logger from "../../utils/logger";

interface Request {
  ticketId: string;
  companyId: number;
  pageNumber?: string;
  queues?: number[];
  user?: User;
}

interface Response {
  messages: Message[];
  ticket: Ticket;
  count: number;
  hasMore: boolean;
}

/**
 * Lista mensagens do ticket aberto.
 * Filtro só por ticketId numérico — includes opcionais com fallback
 * (join quebrado já deixou chat vazio em produção).
 */
const ListMessagesService = async ({
  pageNumber = "1",
  ticketId,
  companyId
}: Request): Promise<Response> => {
  let ticket: Ticket | null = null;

  const asNumber = Number(ticketId);
  const looksLikeNumericId =
    Number.isFinite(asNumber) &&
    String(ticketId).trim() !== "" &&
    !String(ticketId).includes("-") &&
    !Number.isNaN(asNumber);

  if (looksLikeNumericId) {
    ticket = await Ticket.findOne({
      where: { id: asNumber, companyId }
    });
  } else {
    ticket = await Ticket.findOne({
      where: { uuid: String(ticketId), companyId }
    });
  }

  if (!ticket) {
    throw new AppError("ERR_NO_TICKET_FOUND", 404);
  }

  const limit = 50;
  const offset = limit * (Math.max(1, +pageNumber) - 1);

  const baseQuery = {
    where: { ticketId: ticket.id },
    limit,
    offset,
    order: [["createdAt", "DESC"]] as [string, string][]
  };

  const withIncludes = {
    ...baseQuery,
    include: [
      {
        model: Contact,
        as: "contact",
        attributes: ["id", "name"],
        required: false
      },
      {
        model: Message,
        as: "quotedMsg",
        attributes: ["id", "fromMe", "body", "mediaType"],
        required: false,
        include: [
          {
            model: Contact,
            as: "contact",
            attributes: ["id", "name"],
            required: false
          }
        ]
      }
    ]
  };

  let count = 0;
  let messages: Message[] = [];

  try {
    const result = await Message.findAndCountAll(withIncludes);
    count = result.count;
    messages = result.rows;
  } catch (err) {
    logger.warn(
      { err, ticketId: ticket.id },
      "ListMessagesService: include query failed, falling back to plain list"
    );
    const result = await Message.findAndCountAll(baseQuery);
    count = result.count;
    messages = result.rows;
  }

  const hasMore = count > offset + messages.length;

  return {
    messages: messages.reverse(),
    ticket,
    count,
    hasMore
  };
};

export default ListMessagesService;
