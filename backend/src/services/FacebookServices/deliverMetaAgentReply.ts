import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";
import { sanitizeAgentCustomerVisibleText } from "../../helpers/sanitizeAgentCustomerVisibleText";
import { splitAgentReplyIntoSmartBlocks } from "../PromptServices/AgentOrchestratorService";
import {
  AGENT_OUTBOUND_BUBBLE_DELAY_MS,
  AGENT_OUTBOUND_BUBBLE_MAX_CHARS
} from "../../config/openAiDefaults";
import { sendFacebookMessage } from "./sendFacebookMessage";
import CreateMessageService from "../MessageServices/CreateMessageService";
import { markTicketUnderAgentAttendance } from "../TicketServices/markTicketUnderAgentAttendance";
import logger from "../../utils/logger";
import { getIO } from "../../libs/socket";
import ShowTicketService from "../TicketServices/ShowTicketService";

async function persistMetaAgentOutbound(
  sendResult: any,
  body: string,
  ticket: Ticket
): Promise<void> {
  const wid =
    sendResult?.mid ||
    sendResult?.message_id ||
    sendResult?.id ||
    `meta_agent_${Date.now()}_${ticket.id}`;
  await CreateMessageService({
    messageData: {
      wid: String(wid),
      ticketId: ticket.id,
      contactId: undefined,
      body,
      fromMe: true,
      read: true,
      quotedMsgId: null,
      ack: 3,
      dataJson: JSON.stringify(sendResult || {}),
      fromAgent: true
    },
    companyId: ticket.companyId
  });
}

async function emitTicketUpdate(ticket: Ticket): Promise<void> {
  try {
    const io = getIO();
    const full = await ShowTicketService(ticket.id, ticket.companyId);
    io.of("/" + String(ticket.companyId)).emit(
      `company-${ticket.companyId}-ticket`,
      {
        action: "update",
        ticket: full,
        ticketId: ticket.id
      }
    );
  } catch {
    /* socket opcional */
  }
}

/**
 * Envia resposta do agente via Graph API (Facebook / Instagram DM)
 * e grava bolha azul (fromAgent) no CRM.
 */
export async function deliverMetaAgentReply(params: {
  connection: Whatsapp;
  ticket: Ticket;
  contact: Contact;
  prompt: { id: number };
  text: string;
}): Promise<number> {
  const connection =
    (await Whatsapp.findByPk(params.connection.id)) || params.connection;
  const contact =
    (await Contact.findByPk(params.contact.id)) || params.contact;
  let ticket = (await Ticket.findByPk(params.ticket.id)) || params.ticket;

  if (!String(contact?.number || "").trim()) {
    throw new Error(
      `META-AGENT: contato ${contact?.id} sem number (IGSID/PSID)`
    );
  }
  if (!String(connection?.facebookUserToken || "").trim()) {
    throw new Error(
      `META-AGENT: conexão ${connection?.id} sem facebookUserToken`
    );
  }

  (ticket as any).whatsapp = connection;
  (ticket as any).contact = contact;
  (ticket as any).setDataValue?.("whatsapp", connection);
  (ticket as any).setDataValue?.("contact", contact);
  if (!ticket.channel) {
    (ticket as any).channel = connection.channel || "instagram";
  }
  if (!ticket.whatsappId) {
    ticket.whatsappId = connection.id;
  }

  const blocks = splitAgentReplyIntoSmartBlocks(params.text, {
    maxChars: AGENT_OUTBOUND_BUBBLE_MAX_CHARS,
    maxBlocks: 12
  });

  let sent = 0;
  for (const block of blocks) {
    const safeBlock = sanitizeAgentCustomerVisibleText(block);
    if (!safeBlock) continue;

    // Sem prefixo LRM: alguns endpoints IG Login rejeitam/estranham \u200e.
    const agentBody = safeBlock;
    try {
      const sendResult = await sendFacebookMessage({
        body: agentBody,
        ticket,
        skipWindowCheck: true
      });
      await persistMetaAgentOutbound(sendResult, agentBody, ticket);
      sent += 1;
      logger.info(
        `[META-AGENT] bolha enviada ticket=${ticket.id} mid=${
          sendResult?.mid || sendResult?.message_id || sendResult?.id
        }`
      );
    } catch (err: any) {
      const apiMsg =
        err?.response?.data?.error?.message ||
        err?.message ||
        String(err);
      logger.error(
        `[META-AGENT] falha Graph ticket=${ticket.id} recipient=${contact.number} provider=${connection.provider}: ${apiMsg}`
      );

      // Fallback: tenta API alternativa se a primeira falhou.
      try {
        const { sendText } = await import("./graphAPI");
        const { sendInstagramLoginText } = await import("./instagramLoginAPI");
        const token = connection.facebookUserToken;
        const igUserId = String(connection.facebookPageUserId || "me");
        const number = String(contact.number);
        let alt: any = null;
        if (String(connection.provider || "") === "instagram_login") {
          alt = await sendInstagramLoginText(igUserId, number, agentBody, token);
        } else {
          try {
            alt = await sendText(number, agentBody, token, null, {
              provider: connection.provider,
              igUserId
            });
          } catch {
            alt = await sendInstagramLoginText(
              igUserId,
              number,
              agentBody,
              token
            );
          }
        }
        await persistMetaAgentOutbound(alt || {}, agentBody, ticket);
        sent += 1;
        logger.info(
          `[META-AGENT] bolha enviada via fallback ticket=${ticket.id}`
        );
      } catch (altErr: any) {
        logger.error(
          `[META-AGENT] fallback Graph também falhou ticket=${ticket.id}: ${
            altErr?.message || altErr
          }`
        );
        throw err;
      }
    }

    if (blocks.length > 1) {
      await new Promise(resolve =>
        setTimeout(resolve, AGENT_OUTBOUND_BUBBLE_DELAY_MS)
      );
    }
  }

  if (sent > 0) {
    await markTicketUnderAgentAttendance(ticket);
    await emitTicketUpdate(ticket);
  }

  return sent;
}
