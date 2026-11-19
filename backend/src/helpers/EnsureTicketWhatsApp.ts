import { Op } from "sequelize";
import AppError from "../errors/AppError";
import Ticket from "../models/Ticket";
import Whatsapp from "../models/Whatsapp";
import logger from "../utils/logger";

type EnsureOptions = {
  /** When true (default for send), only CONNECTED connections are accepted/assigned. */
  requireConnected?: boolean;
  /**
   * When false, never throws — returns ticket as-is if no connection found.
   * Use on ticket open/list so the UI still loads.
   */
  throwOnMissing?: boolean;
  /** Also rebind other open/pending orphans of same company+channel. */
  repairSiblings?: boolean;
};

const WHATSAPP_CHANNELS = new Set(["whatsapp", "whatsapp_oficial"]);
const META_CHANNELS = new Set(["facebook", "instagram"]);
const CONNECTION_CHANNELS = new Set([...WHATSAPP_CHANNELS, ...META_CHANNELS]);

const findConnectedWhatsApp = async (
  companyId: number,
  channel: string,
  requireConnected: boolean
): Promise<Whatsapp | null> => {
  const statusClause = requireConnected ? { status: "CONNECTED" } : {};

  const byChannelDefault = await Whatsapp.findOne({
    where: { companyId, channel, isDefault: true, ...statusClause }
  });
  if (byChannelDefault) return byChannelDefault;

  const byChannel = await Whatsapp.findOne({
    where: { companyId, channel, ...statusClause },
    order: [["updatedAt", "DESC"]]
  });
  if (byChannel) return byChannel;

  // Legado: canal null/vazio tratado como whatsapp web
  if (channel === "whatsapp") {
    const loose = await Whatsapp.findOne({
      where: {
        companyId,
        ...statusClause,
        [Op.or]: [
          { channel: "whatsapp" },
          { channel: null },
          { channel: "" }
        ]
      },
      order: [
        ["isDefault", "DESC"],
        ["updatedAt", "DESC"]
      ]
    });
    if (loose) return loose;
  }

  // Último recurso: qualquer CONNECTED da empresa (exceto oficial se pediram web e vice-versa)
  // Não aplica a Facebook/Instagram — nunca misturar canal Meta com WhatsApp.
  if (requireConnected && WHATSAPP_CHANNELS.has(channel)) {
    const channelFilter =
      channel === "whatsapp_oficial"
        ? { channel: "whatsapp_oficial" }
        : {
            [Op.or]: [
              { channel: "whatsapp" },
              { channel: { [Op.is]: null } },
              { channel: "" }
            ]
          };

    const anyConnected = await Whatsapp.findOne({
      where: {
        companyId,
        status: "CONNECTED",
        ...channelFilter
      },
      order: [["updatedAt", "DESC"]]
    });
    if (anyConnected) return anyConnected;
  }

  return null;
};

const repairSiblingOrphans = async (
  companyId: number,
  channel: string,
  whatsappId: number
): Promise<void> => {
  try {
    const [moved] = await Ticket.update(
      { whatsappId },
      {
        where: {
          companyId,
          channel,
          [Op.or]: [{ whatsappId: null }, { whatsappId: 0 }],
          status: { [Op.in]: ["open", "pending", "group"] }
        }
      }
    );
    if (moved > 0) {
      logger.info(
        `[EnsureTicketWhatsApp] reparados ${moved} ticket(s) órfãos company=${companyId} -> whatsapp=${whatsappId}`
      );
    }
  } catch (err) {
    logger.warn({ err }, "[EnsureTicketWhatsApp] falha ao reparar irmãos órfãos");
  }
};

/**
 * Garante que o ticket tenha uma conexão utilizável (WhatsApp / Oficial / Facebook / Instagram).
 * Tickets órfãos (whatsappId null ou conexão apagada com FK SET NULL)
 * são reatribuídos à conexão CONNECTED do mesmo canal da empresa.
 */
const EnsureTicketWhatsApp = async (
  ticket: Ticket,
  options: EnsureOptions = {}
): Promise<Ticket> => {
  const requireConnected = options.requireConnected !== false;
  const throwOnMissing = options.throwOnMissing !== false;
  const repairSiblings = options.repairSiblings !== false;
  const channel = String(ticket.channel || "whatsapp").toLowerCase();

  if (!CONNECTION_CHANNELS.has(channel)) {
    return ticket;
  }

  let linked: Whatsapp | null = null;
  if (ticket.whatsappId) {
    linked = await Whatsapp.findByPk(ticket.whatsappId);
  }

  const linkedChannel = String(linked?.channel || channel).toLowerCase();
  const channelCompatible =
    linkedChannel === channel ||
    (channel === "whatsapp" &&
      (!linked?.channel || linkedChannel === "whatsapp"));

  const linkedOk =
    !!linked &&
    Number(linked.companyId) === Number(ticket.companyId) &&
    channelCompatible &&
    (!requireConnected || linked.status === "CONNECTED");

  if (linkedOk) {
    return ticket;
  }

  const replacement = await findConnectedWhatsApp(
    ticket.companyId,
    channel,
    requireConnected
  );

  // Meta: se CONNECTED falhou, tenta qualquer conexão do mesmo canal (ainda permite aceitar).
  const softMeta =
    !replacement &&
    META_CHANNELS.has(channel) &&
    requireConnected
      ? await findConnectedWhatsApp(ticket.companyId, channel, false)
      : null;

  const chosen = replacement || softMeta;

  if (!chosen) {
    if (!throwOnMissing) {
      logger.warn(
        `[EnsureTicketWhatsApp] ticket=${ticket.id} sem conexão disponível (throwOnMissing=false)`
      );
      return ticket;
    }
    throw new AppError(
      META_CHANNELS.has(channel)
        ? "ERR_NO_META_CONNECTION_FOUND"
        : "ERR_NO_DEF_WAPP_FOUND",
      400
    );
  }

  const prev = ticket.whatsappId ?? null;
  if (Number(prev) !== Number(chosen.id)) {
    logger.info(
      `[EnsureTicketWhatsApp] ticket=${ticket.id} channel=${channel} ` +
        `whatsappId=${prev} -> ${chosen.id} (${chosen.name})`
    );
    await ticket.update({ whatsappId: chosen.id });
    await ticket.reload();
  }

  if (repairSiblings) {
    void repairSiblingOrphans(ticket.companyId, channel, chosen.id);
  }

  return ticket;
};

export default EnsureTicketWhatsApp;
