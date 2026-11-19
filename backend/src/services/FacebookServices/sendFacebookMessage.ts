import AppError from "../../errors/AppError";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import { sendText } from "./graphAPI";
import formatBody from "../../helpers/Mustache";
import Whatsapp from "../../models/Whatsapp";
import { assertMetaSendAllowed } from "./resolveOutboundMetaTag";

interface Request {
  body: string;
  ticket: Ticket;
  quotedMsg?: Message;
  /** Agente acabou de receber inbound — não bloquear por janela Meta. */
  skipWindowCheck?: boolean;
}

interface RequestWithoutTicket {
  body: string;
  number: string;
  whatsapp: Whatsapp;
}

const sendFacebookMessage = async ({
  body,
  ticket,
  quotedMsg,
  skipWindowCheck
}: Request): Promise<any> => {
  // Garante conexão fresca (token/provider) — evita send com whatsapp parcial.
  if (ticket.whatsappId) {
    const wa = await Whatsapp.findByPk(ticket.whatsappId);
    if (wa) {
      (ticket as any).whatsapp = wa;
      (ticket as any).setDataValue?.("whatsapp", wa);
    }
  }

  const number = String(
    ticket.contact?.number || (ticket as any).contact?.number || ""
  ).trim();
  try {
    if (!ticket.whatsapp?.facebookUserToken) {
      throw new AppError(
        "Conexão Instagram/Facebook sem token. Reconecte em Integrações.",
        400
      );
    }
    if (!number) {
      throw new AppError(
        "Contato sem ID do Instagram/Messenger. Peça para o cliente enviar uma nova DM.",
        400
      );
    }

    const tag = skipWindowCheck
      ? null
      : await assertMetaSendAllowed(ticket);
    const formatted = formatBody(body, ticket);
    const token = ticket.whatsapp.facebookUserToken;
    const igUserId = String(ticket.whatsapp.facebookPageUserId || "me");
    const isIgLogin =
      ticket.channel === "instagram" &&
      String(ticket.whatsapp.provider || "") === "instagram_login";

    let send: any;

    if (ticket.channel === "instagram" && isIgLogin) {
      const { sendInstagramLoginText } = await import("./instagramLoginAPI");
      send = await sendInstagramLoginText(igUserId, number, formatted, token);
    } else if (ticket.channel === "instagram") {
      // Conexão via Página Facebook → Graph Messenger/IG Page API
      try {
        send = await sendText(number, formatted, token, tag, {
          provider: ticket.whatsapp.provider,
          igUserId
        });
      } catch (pageErr: any) {
        const { sendInstagramLoginText } = await import("./instagramLoginAPI");
        try {
          send = await sendInstagramLoginText(igUserId, number, formatted, token);
        } catch {
          throw pageErr;
        }
      }
    } else {
      send = await sendText(number, formatted, token, tag, {
        provider: ticket.whatsapp.provider,
        igUserId
      });
    }

    await ticket.update({ lastMessage: body, fromMe: true });

    if (send && !send.mid && !send.message_id && send.id) {
      send.message_id = send.id;
    }
    if (send && !send.message_id && !send.mid) {
      send.message_id = `meta_out_${Date.now()}_${ticket.id}`;
    }
    if (send) {
      send.text = send.text || formatted;
    }

    return send;
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    const apiMsg =
      (err as any)?.response?.data?.error?.message ||
      (err as any)?.message ||
      "ERR_SENDING_FACEBOOK_MSG";
    console.log(err);
    throw new AppError(
      ticket.channel === "instagram"
        ? `Instagram: ${apiMsg}`
        : String(apiMsg),
      400
    );
  }
};

const sendFacebookMessageWithoutTicket = async ({ body, number, whatsapp }: RequestWithoutTicket): Promise<any> => {
  const { facebookUserToken } = whatsapp;
  try {
    const send = await sendText(number, body, facebookUserToken, null, {
      provider: whatsapp.provider,
      igUserId: whatsapp.facebookPageUserId
    });
    return send;
  } catch (err) {
    console.log(err);
    throw new AppError("ERR_SENDING_FACEBOOK_MSG");
  }
};

export { sendFacebookMessage, sendFacebookMessageWithoutTicket };
