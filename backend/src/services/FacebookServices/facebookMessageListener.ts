import { writeFileSync } from "fs";
import fs from "fs";
import axios from "axios";
import moment from "moment";
import { join } from "path";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";
import CreateMessageService from "../MessageServices/CreateMessageService";
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";
import { getProfile, profilePsid, sendText } from "./graphAPI";
import Whatsapp from "../../models/Whatsapp";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import { debounce } from "../../helpers/Debounce";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import formatBody from "../../helpers/Mustache";
import Queue from "../../models/Queue";
import Chatbot from "../../models/Chatbot";
import Message from "../../models/Message";
import { sayChatbot } from "../WbotServices/ChatbotListenerFacebook";
import ListSettingsService from "../SettingServices/ListSettingsService";
import { isNil, isNull, head } from "lodash";
import FindOrCreateATicketTrakingService from "../TicketServices/FindOrCreateATicketTrakingService";
import { handleMessageIntegration, handleRating, verifyRating } from "../WbotServices/wbotMessageListener";
import CompaniesSettings from "../../models/CompaniesSettings";
import { sendFacebookMessage } from "./sendFacebookMessage";
import TicketTag from "../../models/TicketTag";
import Tag from "../../models/Tag";
import ShowQueueIntegrationService from "../QueueIntegrationServices/ShowQueueIntegrationService";
import { ActionsWebhookService } from "../WebhookService/ActionsWebhookService";
import { FlowBuilderModel } from "../../models/FlowBuilder";
import { FlowDefaultModel } from "../../models/FlowDefault";
import { IConnections, INodes } from "../WebhookService/DispatchWebHookService";

import { differenceInMilliseconds } from "date-fns";
import { ActionsWebhookFacebookService } from "./WebhookFacebookServices/ActionsWebhookFacebookService";
import { runFacebookKeywordCampaigns } from "./runFacebookKeywordCampaigns";
import { get } from "http";
import { WebhookModel } from "../../models/Webhook";
import { is } from "bluebird";
import ShowTicketService from "../TicketServices/ShowTicketService";
import { runWithTicketLock } from "../../helpers/metaTicketLock";
import logger from "../../utils/logger";
import {
  findRecentMetaOutboundDuplicate,
  isSyntheticMetaWid
} from "../../helpers/metaOutboundMessageDedupe";

/**
 * Meta reenvia o webhook se o handler demora. A mensagem já foi salva (mid),
 * mas o LLM pode não ter terminado — retoma o agente sem duplicar inbound.
 */
async function resumeMetaAgentAfterWebhookDedupe(params: {
  token: Whatsapp;
  companyId: number;
  channel: string;
  mid: string;
  bodyText: string;
  alreadySaved: Message;
}): Promise<void> {
  const { token, companyId, channel, mid, bodyText, alreadySaved } = params;
  const ticketId = Number(alreadySaved.ticketId);
  if (!ticketId) return;

  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket || ticket.companyId !== companyId) return;
  if (["closed", "nps"].includes(String(ticket.status || ""))) return;
  if (ticket.isGroup) return;

  const { isHumanAttendantTicket } = await import(
    "../../helpers/ticketHumanAccept"
  );
  if (isHumanAttendantTicket(ticket)) return;

  const freshConn = (await Whatsapp.findByPk(token.id)) || token;
  const { whatsappHasConnectionAgent } = await import(
    "../../providers/anthropic/services/resolveConnectionAgent"
  );
  if (!whatsappHasConnectionAgent(freshConn)) return;

  // Já existe resposta do agente neste ticket após o inbound?
  const agentReply = await Message.findOne({
    where: {
      ticketId,
      companyId,
      fromMe: true,
      fromAgent: true
    },
    order: [["createdAt", "DESC"]]
  });
  if (
    agentReply &&
    alreadySaved.createdAt &&
    agentReply.createdAt &&
    new Date(agentReply.createdAt).getTime() >=
      new Date(alreadySaved.createdAt).getTime()
  ) {
    return;
  }

  const contact = await Contact.findByPk(ticket.contactId);
  if (!contact || contact.disableBot) return;

  const text = String(bodyText || alreadySaved.body || "").trim();
  if (!text) return;

  logger.info(
    `[META-AGENT] retomando após dedupe mid=${mid} ticket=${ticketId}`
  );

  const { processMetaAgentInbound } = await import("./processMetaAgentInbound");
  await processMetaAgentInbound({
    connection: freshConn,
    ticket,
    contact,
    body: text,
    messageWid: mid,
    channel: String(channel || ticket.channel || "instagram")
  });
}

interface IMe {
  name: string;
  // eslint-disable-next-line camelcase
  first_name: string;
  // eslint-disable-next-line camelcase
  last_name: string;
  // eslint-disable-next-line camelcase
  profile_pic: string;
  id: string;
}

export interface Root {
  object: string;
  entry: Entry[];
}

export interface Entry {
  id: string;
  time: number;
  messaging: Messaging[];
}

export interface Messaging {
  sender: Sender;
  recipient: Recipient;
  timestamp: number;
  message: MessageX;
}

export interface Sender {
  id: string;
}

export interface Recipient {
  id: string;
}

export interface MessageX {
  mid: string;
  text: string;
  reply_to: ReplyTo;
}

export interface ReplyTo {
  mid: string;
}

const verifyContact = async (msgContact: any, token: any, companyId: any) => {
  if (!msgContact) return null;

  let profilePicUrl = null;

  if (msgContact.profile_pic) {
    profilePicUrl = msgContact.profile_pic
  } else {
    profilePicUrl = `${process.env.FRONTEND_URL}/nopicture.png`;
  }

  const contactData = {
    name: msgContact?.name || `${msgContact?.first_name} ${msgContact?.last_name}`,
    number: msgContact.id,
    profilePicUrl,
    isGroup: false,
    companyId: companyId,
    channel: token.channel,
    whatsappId: token.id
  };

  let contact = await CreateOrUpdateContactService(contactData);

  // Sempre tenta persistir foto local via Graph (CDN expira; urlPicture local é estável)
  if (contact && ["instagram", "facebook"].includes(String(token.channel || ""))) {
    try {
      const { syncMetaContactProfilePic, hasUsableLocalPicture } = await import(
        "./syncMetaContactProfilePic"
      );
      const needsForce =
        !hasUsableLocalPicture(contact) || !contact.pictureUpdated;
      contact = await syncMetaContactProfilePic({
        connection: token,
        contact,
        psid: String(msgContact.id),
        force: needsForce || Boolean(msgContact.profile_pic)
      });
    } catch {
      /* mantém o que CreateOrUpdate já salvou */
    }
  }

  return contact;
};

export const verifyMessageFace = async (
  msg: any,
  body: any,
  ticket: Ticket,
  contact: Contact,
  fromMe: boolean = false,
  options?: { fromAgent?: boolean }
) => {
  // Em envios via API, o retorno pode não conter mid/message_id quando a chamada falha.
  // Evitar criar registro sem wid para não disparar erro no Sequelize.
  const wid = msg?.mid || msg?.message_id || msg?.id;
  if (!wid) {
    // Sem identificador de mensagem retornado pela Graph API; não persistir.
    return null;
  }

  const quotedMsg = await verifyQuotedMessage(msg);
  const messageData = {
    wid: String(wid),
    ticketId: ticket.id,
    contactId: fromMe ? undefined : msg?.is_echo ? undefined : contact.id,
    body: msg?.text || body,
    fromMe: fromMe ? fromMe : msg?.is_echo ? true : false,
    read: fromMe ? fromMe : msg?.is_echo,
    quotedMsgId: quotedMsg?.id,
    ack: 3,
    dataJson: JSON.stringify(msg),
    channel: ticket.channel,
    fromAgent: options?.fromAgent === true
  };

  const created = await CreateMessageService({
    messageData,
    companyId: ticket.companyId
  });

  return created;
};

export const verifyMessageMedia = async (
  msg: any,
  ticket: Ticket,
  contact: Contact,
  fromMe: boolean = false
): Promise<void> => {
  const { data } = await axios.get(msg.attachments[0].payload.url, {
    responseType: "arraybuffer"
  });

  // eslint-disable-next-line no-eval
  const { fileTypeFromBuffer } = await (eval('import("file-type")') as Promise<typeof import("file-type")>);

  const type = await fileTypeFromBuffer(data);

  const fileName = `${new Date().getTime()}.${type.ext}`;

  const folder = `public/company${ticket.companyId}`;
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder);
    fs.chmodSync(folder, 0o777)
  }

  writeFileSync(
    join(__dirname, "..", "..", "..", folder, fileName),
    data,
    "base64"
  );

  const messageData = {
    wid: msg.mid,
    ticketId: ticket.id,
    contactId: fromMe ? undefined : msg.is_echo ? undefined : contact.id,
    body: msg.text || fileName,
    fromMe: fromMe ? fromMe : msg.is_echo ? true : false,
    mediaType: msg.attachments[0].type,
    mediaUrl: fileName,
    read: fromMe ? fromMe : msg.is_echo,
    quotedMsgId: null,
    ack: 3,
    dataJson: JSON.stringify(msg),
    channel: ticket.channel
  };

  await CreateMessageService({ messageData, companyId: ticket.companyId });

  // await ticket.update({
  //   lastMessage: msg.text
  // });
};

export const verifyQuotedMessage = async (msg: any): Promise<Message | null> => {
  if (!msg) return null;
  const quoted = msg?.reply_to?.mid;

  if (!quoted) return null;

  const quotedMsg = await Message.findOne({
    where: { wid: quoted }
  });

  if (!quotedMsg) return null;

  return quotedMsg;
};


const flowBuilderQueue = async (
  ticket: Ticket,
  message: any,
  getSession: Whatsapp,
  companyId: number,
  contact: Contact,
  isFirstMsg: Ticket,
) => {

  const flow = await FlowBuilderModel.findOne({
    where: {
      id: ticket.flowStopped,
    }
  });

  const mountDataContact = {
    number: contact.number,
    name: contact.name,
    email: contact.email
  };


  console.log("======================================")
  console.log("|         flowBuilderQueue           |")
  console.log("======================================")


  const nodes: INodes[] = flow.flow["nodes"]
  const connections: IConnections[] = flow.flow["connections"]

  if (!ticket.lastFlowId) {
    return
  }


  if (ticket.flowWebhook) {
    await ActionsWebhookFacebookService(
      getSession,
      parseInt(ticket.flowStopped),
      ticket.companyId,
      nodes,
      connections,
      ticket.lastFlowId,
      null,
      "",
      "",
      message.text,
      ticket.id,
      mountDataContact
    );
  }

  //const integrations = await ShowQueueIntegrationService(whatsapp.integrationId, companyId);
  //await handleMessageIntegration(msg, wbot, companyId, integrations, ticket, contact, isFirstMsg)



}



const flowbuilderIntegration = async (
  ticket: Ticket,
  companyId: any,
  isFirstMsg: Ticket,
  getSession: Whatsapp,
  contact: Contact,
  message: any,
) => {

  console.log("======================================")
  console.log("|      flowbuilderIntegration        |")
  console.log("======================================")


  await ticket.update({
    lastMessage: message.text,
  });


  const inboundCount = await Message.count({
    where: {
      ticketId: ticket.id,
      fromMe: false
    }
  });

  if (getSession.flowIdWelcome && inboundCount <= 1) {

    const flow = await FlowBuilderModel.findOne({
      where: {
        id: getSession.flowIdWelcome
      }
    });

    if (flow?.flow?.["nodes"]?.length) {

      const nodes: INodes[] = flow.flow["nodes"];
      const connections: IConnections[] = flow.flow["connections"];

      const mountDataContact = {
        number: contact.number,
        name: contact.name,
        email: contact.email
      };

      await ActionsWebhookFacebookService(
        getSession,
        getSession.flowIdWelcome,
        ticket.companyId,
        nodes,
        connections,
        nodes[0].id,
        null,
        "",
        "",
        null,
        ticket.id,
        mountDataContact
      )
    }
  }


  const dateTicket = new Date(isFirstMsg ? isFirstMsg.updatedAt : "");
  const dateNow = new Date();
  const diferencaEmMilissegundos = Math.abs(
    differenceInMilliseconds(dateTicket, dateNow)
  );
  const seisHorasEmMilissegundos = 2 * 1000;

  if (
    !ticket.fromMe &&
    isFirstMsg &&
    diferencaEmMilissegundos >= seisHorasEmMilissegundos
  ) {
    const flow = await FlowBuilderModel.findOne({
      where: {
        id: getSession.flowIdNotPhrase
      }
    });


    if (flow) {

      const nodes: INodes[] = flow.flow["nodes"];
      const connections: IConnections[] = flow.flow["connections"];

      const mountDataContact = {
        number: contact.number,
        name: contact.name,
        email: contact.email
      };

      await ActionsWebhookFacebookService(
        getSession,
        getSession.flowIdNotPhrase,
        ticket.companyId,
        nodes,
        connections,
        flow.flow["nodes"][0].id,
        null,
        "",
        "",
        null,
        ticket.id,
        mountDataContact
      )
    }

  }


  /*
  if (ticketUpdate.flowWebhook) {
    const webhook = await WebhookModel.findOne({
      where: {
        company_id: ticketUpdate.companyId,
        hash_id: ticketUpdate.hashFlowId
      }
    });

    if (webhook && webhook.config["details"]) {
      const flow = await FlowBuilderModel.findOne({
        where: {
          id: webhook.config["details"].idFlow
        }
      });
      const nodes: INodes[] = flow.flow["nodes"];
      const connections: IConnections[] = flow.flow["connections"];

      // const worker = new Worker("./src/services/WebhookService/WorkerAction.ts");

      // console.log('DISPARO4')
      // // Enviar as variáveis como parte da mensagem para o Worker
      // const data = {
      //   idFlowDb: webhook.config["details"].idFlow,
      //   companyId: ticketUpdate.companyId,
      //   nodes: nodes,
      //   connects: connections,
      //   nextStage: ticketUpdate.lastFlowId,
      //   dataWebhook: ticketUpdate.dataWebhook,
      //   details: webhook.config["details"],
      //   hashWebhookId: ticketUpdate.hashFlowId,
      //   pressKey: body,
      //   idTicket: ticketUpdate.id,
      //   numberPhrase: ""
      // };
      // worker.postMessage(data);

      // worker.on("message", message => {
      //   console.log(`Mensagem do worker: ${message}`);
      // });

      await ActionsWebhookFacebookService(
        getSession,
        webhook.config["details"].idFlow,
        ticketUpdate.companyId,
        nodes,
        connections,
        ticketUpdate.lastFlowId,
        ticketUpdate.dataWebhook,
        webhook.config["details"],
        ticketUpdate.hashFlowId,
        message.text,
        ticketUpdate.id
      );
    } else {
      const flow = await FlowBuilderModel.findOne({
        where: {
          id: ticketUpdate.flowStopped
        }
      });

      const nodes: INodes[] = flow.flow["nodes"];
      const connections: IConnections[] = flow.flow["connections"];

      if (!ticketUpdate.lastFlowId) {
        return
      }

      const mountDataContact = {
        number: contact.number,
        name: contact.name,
        email: contact.email
      };

      // const worker = new Worker("./src/services/WebhookService/WorkerAction.ts");

      // console.log('DISPARO5')
      // // Enviar as variáveis como parte da mensagem para o Worker
      // const data = {
      //   idFlowDb: parseInt(ticketUpdate.flowStopped),
      //   companyId: ticketUpdate.companyId,
      //   nodes: nodes,
      //   connects: connections,
      //   nextStage: ticketUpdate.lastFlowId,
      //   dataWebhook: null,
      //   details: "",
      //   hashWebhookId: "",
      //   pressKey: body,
      //   idTicket: ticketUpdate.id,
      //   numberPhrase: mountDataContact
      // };
      // worker.postMessage(data);
      // worker.on("message", message => {
      //   console.log(`Mensagem do worker: ${message}`);
      // });

      await ActionsWebhookFacebookService(
        getSession,
        parseInt(ticketUpdate.flowStopped),
        ticketUpdate.companyId,
        nodes,
        connections,
        ticketUpdate.lastFlowId,
        null,
        "",
        "",
        message.text,
        ticketUpdate.id,
        mountDataContact
      );
    }
  }
  */
}

export const handleMessage = async (
  token: Whatsapp,
  webhookEvent: any,
  channel: string,
  companyId: any
): Promise<any> => {
  try {
    if (webhookEvent.message) {
      let msgContact: any;

      const senderPsid = webhookEvent.sender?.id;
      const recipientPsid = webhookEvent.recipient?.id;
      const { message } = webhookEvent;
      if (!senderPsid || !recipientPsid || !message) {
        logger.warn("[MetaHandleMessage] Evento sem sender/recipient/message", {
          channel,
          companyId
        });
        return;
      }

      const fromMe = !!message.is_echo;
      const mid = message.mid ? String(message.mid) : null;

      // Dedupe forte: Mid Meta já processado = não cria 2º ticket/mensagem.
      // RETRY do webhook Meta: se a msg inbound já existe mas o agente não respondeu
      // (timeout do webhook no meio do LLM), retoma o agente sem duplicar a mensagem.
      if (mid) {
        const alreadySaved = await Message.findOne({
          where: { wid: mid, companyId }
        });
        if (alreadySaved) {
          if (!fromMe && !alreadySaved.fromMe) {
            try {
              await resumeMetaAgentAfterWebhookDedupe({
                token,
                companyId,
                channel,
                mid,
                bodyText: String(message?.text || alreadySaved.body || ""),
                alreadySaved
              });
            } catch (resumeErr: any) {
              logger.warn(
                `[META-AGENT] resume após dedupe mid=${mid}: ${resumeErr?.message || resumeErr}`
              );
            }
          }
          return;
        }
      }

      let bodyMessage = message.text;

      if (fromMe) {
        if (bodyMessage && /\u200e/.test(bodyMessage)) return;

        msgContact = await profilePsid(recipientPsid, token.facebookUserToken, {
          provider: token.provider,
          igUserId: token.facebookPageUserId
        });
      } else {
        msgContact = await profilePsid(senderPsid, token.facebookUserToken, {
          provider: token.provider,
          igUserId: token.facebookPageUserId
        });
      }

      if (!msgContact?.id) {
        msgContact = {
          id: String(fromMe ? recipientPsid : senderPsid),
          name: `Contato ${String(fromMe ? recipientPsid : senderPsid).slice(-6)}`
        };
      }

      const contact = await verifyContact(msgContact, token, companyId);
      if (!contact) {
        logger.error("[MetaHandleMessage] Contato não criado", {
          channel,
          companyId,
          psid: msgContact?.id
        });
        return;
      }

      const unreadCount = fromMe ? 0 : 1;

      // Sempre a conexão do webhook (evita pegar facebook quando o evento é instagram).
      const getSession = await Whatsapp.findOne({
        where: { id: token.id },
        include: [
          {
            model: Queue,
            as: "queues",
            attributes: ["id", "name", "color", "greetingMessage"],
            include: [
              {
                model: Chatbot,
                as: "chatbots",
                attributes: ["id", "name", "greetingMessage"]
              }
            ]
          }
        ],
        order: [
          ["queues", "id", "ASC"],
          ["queues", "chatbots", "id", "ASC"]
        ]
      });

      if (!getSession) {
        logger.error("[MetaHandleMessage] Conexão Whatsapp não encontrada", {
          tokenId: token.id,
          channel,
          companyId
        });
        return;
      }

      const settings = await CompaniesSettings.findOne({
        where: { companyId }
      });

      const isFirstMsg = await Ticket.findOne({
        where: {
          contactId: contact.id,
          companyId
        },
        order: [["id", "DESC"]]
      });

      const lockKey = `meta:${companyId}:${getSession.id}:${contact.id}`;
      const ticket = await runWithTicketLock(lockKey, async () => {
        return FindOrCreateTicketService(
          contact,
          getSession,
          unreadCount,
          companyId,
          0,
          0,
          null,
          channel || getSession.channel,
          null,
          false,
          settings
        );
      });

      /**
       * Eco outbound (is_echo): se o CRM/agente já gravou a mesma bolha,
       * não cria segunda mensagem verde nem reprocessa o pipeline.
       */
      if (fromMe) {
        try {
          const dup = await findRecentMetaOutboundDuplicate({
            ticketId: ticket.id,
            companyId,
            body: String(bodyMessage || message?.text || "")
          });
          if (dup) {
            if (mid && String(dup.wid) !== mid && isSyntheticMetaWid(String(dup.wid))) {
              try {
                await dup.update({ wid: mid });
              } catch {
                /* ignore */
              }
            }
            logger.info(
              `[MetaHandleMessage] eco outbound ignorado (dedupe) ticket=${ticket.id} mid=${mid || "-"}`
            );
            return;
          }
        } catch (echoErr: any) {
          logger.warn(
            `[MetaHandleMessage] dedupe eco falhou: ${echoErr?.message || echoErr}`
          );
        }
      }

      let bodyRollbackTag = "";
      let bodyNextTag = "";
      let rollbackTag;
      let nextTag;
      let ticketTag = undefined;
      // console.log(ticket.id)
      if (ticket?.company?.plan?.useKanban) {
        ticketTag = await TicketTag.findOne({
          where: {
            ticketId: ticket.id
          }
        })

        if (ticketTag) {
          const tag = await Tag.findByPk(ticketTag.tagId)

          if (tag.nextLaneId) {
            nextTag = await Tag.findByPk(tag.nextLaneId);

            bodyNextTag = nextTag.greetingMessageLane;
          }
          if (tag.rollbackLaneId) {
            rollbackTag = await Tag.findByPk(tag.rollbackLaneId);

            bodyRollbackTag = rollbackTag.greetingMessageLane;
          }
        }
      }

      const ticketTraking = await FindOrCreateATicketTrakingService({
        ticketId: ticket.id,
        companyId,
        whatsappId: getSession?.id,
        userId: ticket.userId
      });

      if (
        (getSession.farewellMessage &&
          formatBody(getSession.farewellMessage, ticket) === message.text) ||
        (getSession.ratingMessage &&
          formatBody(getSession.ratingMessage, ticket) === message.text)
      )
        return;

      if (rollbackTag && formatBody(bodyNextTag, ticket) !== bodyMessage && formatBody(bodyRollbackTag, ticket) !== bodyMessage) {
        await TicketTag.destroy({ where: { ticketId: ticket.id, tagId: ticketTag.tagId } });
        await TicketTag.create({ ticketId: ticket.id, tagId: rollbackTag.id });
      }

      await ticket.update({
        lastMessage: message.text
      });

      try {
        if (!fromMe) {
          /**
           * Tratamento para avaliação do atendente
           */
          if (ticket.status === "nps" && ticketTraking !== null && verifyRating(ticketTraking)) {

            if (!isNaN(parseFloat(bodyMessage))) {

              handleRating(parseFloat(bodyMessage), ticket, ticketTraking);

              await ticketTraking.update({
                ratingAt: moment().toDate(),
                finishedAt: moment().toDate(),
                rated: true
              });

              return;
            } else {

              if (ticket.amountUsedBotQueuesNPS < getSession.maxUseBotQueuesNPS) {
                let bodyErrorRating = `\u200eOpção inválida, tente novamente.\n`;
                const sentMessage = await sendText(
                  contact.number,
                  bodyErrorRating,
                  getSession.facebookUserToken
                );

                await verifyMessageFace(sentMessage, bodyErrorRating, ticket, contact);


                // await delay(1000);

                let bodyRatingMessage = `\u200e${getSession.ratingMessage}\n`;

                const msg = await sendText(contact.number, bodyRatingMessage, getSession.facebookUserToken);

                await verifyMessageFace(sentMessage, bodyRatingMessage, ticket, contact);

                await ticket.update({
                  amountUsedBotQueuesNPS: ticket.amountUsedBotQueuesNPS + 1
                })
              }
              return;
            }

          }

          const enableLGPD = settings.enableLGPD === "enabled";

          //TRATAMENTO LGPD
          if (enableLGPD && ticket.status === "lgpd") {
            if (isNil(ticket.lgpdAcceptedAt) && !isNil(ticket.lgpdSendMessageAt)) {
              let choosenOption: number | null = null;

              if (!isNaN(parseFloat(bodyMessage))) {
                choosenOption = parseFloat(bodyMessage);
              }

              //Se digitou opção numérica
              if (!Number.isNaN(choosenOption) && Number.isInteger(choosenOption) && !isNull(choosenOption) && choosenOption > 0) {
                //Se digitou 1, aceitou o termo e vai pro bot
                if (choosenOption === 1) {
                  await contact.update({
                    lgpdAcceptedAt: moment().toDate(),
                  });
                  await ticket.update({
                    lgpdAcceptedAt: moment().toDate(),
                    amountUsedBotQueues: 0
                  });
                  //Se digitou 2, recusou o bot e encerra chamado
                } else if (choosenOption === 2) {

                  if (getSession.complationMessage !== "" && getSession.complationMessage !== undefined) {

                    const sentMessage = await sendText(
                      contact.number,
                      `\u200e${getSession.complationMessage}`,
                      getSession.facebookUserToken
                    );

                    await verifyMessageFace(sentMessage, `\u200e${getSession.complationMessage}`, ticket, contact);
                  }

                  await ticket.update({
                    status: "closed",
                    amountUsedBotQueues: 0
                  })

                  await ticketTraking.destroy;

                  return
                  //se digitou qualquer opção que não seja 1 ou 2 limpa o lgpdSendMessageAt para 
                  //enviar de novo o bot respeitando o numero máximo de vezes que o bot é pra ser enviado
                } else {
                  if (ticket.amountUsedBotQueues < getSession.maxUseBotQueues) {
                    await ticket.update(
                      {
                        amountUsedBotQueues: ticket.amountUsedBotQueues + 1
                        , lgpdSendMessageAt: null
                      });
                  }
                }
                //se digitou qualquer opção que não número o lgpdSendMessageAt para 
                //enviar de novo o bot respeitando o numero máximo de vezes que o bot é pra ser enviado
              } else {
                if (ticket.amountUsedBotQueues < getSession.maxUseBotQueues) {
                  await ticket.update(
                    {
                      amountUsedBotQueues: ticket.amountUsedBotQueues + 1
                      , lgpdSendMessageAt: null
                    });
                }
              }
            }

            if ((contact.lgpdAcceptedAt === null || settings?.lgpdConsent === "enabled") &&
              !contact.isGroup && isNil(ticket.lgpdSendMessageAt) &&
              ticket.amountUsedBotQueues <= getSession.maxUseBotQueues && !isNil(settings?.lgpdMessage)
            ) {
              if (message.attachments) {
                await verifyMessageMedia(message, ticket, contact);
              } else {
                await verifyMessageFace(message, message.text, ticket, contact);
              }

              if (!isNil(settings?.lgpdMessage) && settings.lgpdMessage !== "") {
                const bodyMessageLGPD = formatBody(`\u200e${settings.lgpdMessage}`, ticket);

                const sentMessage = await sendText(
                  contact.number,
                  bodyMessageLGPD,
                  getSession.facebookUserToken
                );

                await verifyMessageFace(sentMessage, bodyMessageLGPD, ticket, contact);

              }
              // await delay(1000);

              if (!isNil(settings?.lgpdLink) && settings?.lgpdLink !== "") {
                const bodyLink = formatBody(`\u200e${settings.lgpdLink}`, ticket);
                const sentMessage = await sendText(
                  contact.number,
                  bodyLink,
                  getSession.facebookUserToken
                );

                await verifyMessageFace(sentMessage, bodyLink, ticket, contact);
              };

              // await delay(1000);

              const bodyBot = formatBody(
                `\u200eEstou ciente sobre o tratamento dos meus dados pessoais. \n\n*[1]* Sim\n*[2]* Não`,
                ticket
              );

              const sentMessageBot = await sendText(
                contact.number,
                bodyBot,
                getSession.facebookUserToken
              );

              await verifyMessageFace(sentMessageBot, bodyBot, ticket, contact);

              await ticket.update({
                lgpdSendMessageAt: moment().toDate(),
                amountUsedBotQueues: ticket.amountUsedBotQueues + 1
              });

              await ticket.reload();

              return;

            };

            if (!isNil(ticket.lgpdSendMessageAt) && isNil(ticket.lgpdAcceptedAt))
              return
          }
        }
      } catch (e) {
        throw new Error(e);
        console.log(e);
      }

      if (message.attachments) {
        await verifyMessageMedia(message, ticket, contact);
      } else {
        await verifyMessageFace(message, message.text, ticket, contact);
      }

      /**
       * PRIORIDADE: agente da conexão (igual WhatsApp/Telegram).
       * AWAIT obrigatório — setImmediate fazia o webhook “concluir” sem enviar a resposta.
       */
      if (
        !fromMe &&
        !message?.is_echo &&
        !ticket.isGroup &&
        !contact.disableBot
      ) {
        try {
          const freshConn =
            (await Whatsapp.findByPk(getSession.id)) || getSession;
          const { whatsappHasConnectionAgent } = await import(
            "../../providers/anthropic/services/resolveConnectionAgent"
          );
          if (whatsappHasConnectionAgent(freshConn)) {
            const agentBody = String(message?.text || bodyMessage || "").trim();
            const agentWid = String(message?.mid || mid || "");
            const agentChannel = String(
              channel || ticket.channel || freshConn.channel || "instagram"
            );
            const { processMetaAgentInbound } = await import(
              "./processMetaAgentInbound"
            );
            const agentHandled = await processMetaAgentInbound({
              connection: freshConn,
              ticket,
              contact,
              body: agentBody,
              messageWid: agentWid,
              channel: agentChannel
            });
            // Com agente na conexão, nunca segue para fila/chatbot (evita silêncio).
            if (!agentHandled) {
              logger.warn(
                `[META-AGENT] sem envio ticket=${ticket.id} — conferir logs Graph/LLM`
              );
            }
            return;
          }
        } catch (agentErr: any) {
          logger.error(
            `[META-AGENT] falha no inbound ticket=${ticket.id}: ${
              agentErr?.message || agentErr
            }`
          );
        }
      }

      const flow = await FlowBuilderModel.findOne({
        where: {
          id: ticket.flowStopped
        }
      });

      let isMenu = false;
      if (flow) {
        isMenu = flow.flow["nodes"].find((node: any) => node.id === ticket.lastFlowId)?.type === "menu";
      }

      if (
        !ticket.fromMe &&
        isMenu &&
        !isNaN(message.text)
      ) {

        await ticket.update({
          queueId: ticket.queueId ? ticket.queueId : null,
        });

        await flowBuilderQueue(ticket, message, getSession, companyId, contact, isFirstMsg)
      }

      if (
        !ticket.imported &&
        !fromMe &&
        !ticket.isGroup &&
        !ticket.user &&
        !isMenu &&
        (!ticket.dataWebhook || ticket.dataWebhook["status"] === "stopped")
      ) {
        const campaignRan = await runFacebookKeywordCampaigns({
          ticket,
          companyId,
          getSession,
          contact,
          messageBody: message?.text
        });

        if (!campaignRan) {
          const hasWelcome = Boolean(
            getSession.flowIdWelcome || getSession.flowIdNotPhrase
          );

          let isFlowbuilderIntegration = false;
          if (!isNil(getSession.integrationId) && !ticket.useIntegration) {
            try {
              const integrations = await ShowQueueIntegrationService(
                getSession.integrationId,
                companyId
              );
              isFlowbuilderIntegration = integrations?.type === "flowbuilder";
            } catch (err) {
              isFlowbuilderIntegration = false;
            }
          }

          if (hasWelcome || isFlowbuilderIntegration) {
            await flowbuilderIntegration(
              ticket,
              companyId,
              isFirstMsg,
              getSession,
              contact,
              message
            );
          }
        }
      }

      if (
        !ticket.queue &&
        !fromMe &&
        !ticket.userId &&
        getSession.queues.length >= 1
      ) {
        await verifyQueue(getSession, message, ticket, contact);
      }

      if (ticket.queue && ticket.queueId) {
        // ✅ CORRIGIDO: Executar ChatBot apenas se ticket não estiver "open" (aceito por atendente)
        if (ticket.status !== "open" && ticket.queue?.chatbots?.length > 0) {
          await sayChatbot(
            ticket.queueId,
            getSession,
            ticket,
            contact,
            message
          );
        }
      }
    }

    return;
  } catch (error) {
    throw new Error(error);
  }
};

const verifyQueue = async (
  getSession: Whatsapp,
  msg: any,
  ticket: Ticket,
  contact: Contact
) => {
  // console.log("VERIFYING QUEUE", ticket.whatsappId, getSession.id)
  const { queues, greetingMessage } = await ShowWhatsAppService(getSession.id!, ticket.companyId);



  if (queues.length === 1) {
    const firstQueue = head(queues);
    let chatbot = false;
    if (firstQueue?.chatbots) {
      chatbot = firstQueue?.chatbots?.length > 0;
    }
    await UpdateTicketService({
      ticketData: { queueId: queues[0].id, isBot: chatbot },
      ticketId: ticket.id,
      companyId: ticket.companyId
    });

    return;
  }

  let selectedOption = "";

  if (ticket.status !== "lgpd") {
    selectedOption = msg.text;
  } else {
    if (!isNil(ticket.lgpdAcceptedAt))
      await ticket.update({
        status: "pending"
      });

    await ticket.reload();
  }

  const choosenQueue = queues[+selectedOption - 1];

  if (choosenQueue) {

    await UpdateTicketService({
      ticketData: { queueId: choosenQueue.id },
      ticketId: ticket.id,
      companyId: ticket.companyId
    });

    if (choosenQueue.chatbots.length > 0) {
      let options = "";
      choosenQueue.chatbots.forEach((chatbot, index) => {
        options += `[${index + 1}] - ${chatbot.name}\n`;
      });

      const body =
        `${choosenQueue.greetingMessage}\n\n${options}\n[#] Voltar para o menu principal`;

      const sentMessage = await sendFacebookMessage({
        ticket,
        body: body
      })

      // const debouncedSentChatbot = debounce(
      //   async () => {
      //     await sendText(
      //   contact.number,
      //   formatBody(body, ticket),
      //   ticket.whatsapp.facebookUserToken
      // );
      //   },
      //   3000,
      //   ticket.id
      // );
      // debouncedSentChatbot();

      // return await verifyMessage(msg, body, ticket, contact);
    }

    if (!choosenQueue.chatbots.length) {
      const body = `${choosenQueue.greetingMessage}`;

      const sentMessage = await sendFacebookMessage({
        ticket,
        body: body
      })
      // const debouncedSentChatbot = debounce(
      //   async () => { await sendText(
      //   contact.number,
      //   formatBody(body, ticket),
      //   ticket.whatsapp.facebookUserToken
      // );

      //   },
      //   3000,
      //   ticket.id
      // );
      // debouncedSentChatbot();
      // return await verifyMessage(msg, body, ticket, contact);
    }
  } else {
    let options = "";

    queues.forEach((queue, index) => {
      options += `[${index + 1}] - ${queue.name}\n`;
    });

    const body = `${greetingMessage}\n\n${options}`;

    const sentMessage = await sendFacebookMessage({
      ticket,
      body: body
    })
    // const debouncedSentChatbot = debounce(
    //   async () => { await 
    //     sendText(
    //       contact.number,
    //       formatBody(body, ticket),
    //       ticket.whatsapp.facebookUserToken
    //     );
    //   },
    //   3000,
    //   ticket.id
    // );
    // debouncedSentChatbot();

    // return verifyMessage(msg, body, ticket, contact);



  }
};
