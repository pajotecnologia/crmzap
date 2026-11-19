import Whatsapp from "../../models/Whatsapp";
import WhatsappQueue from "../../models/WhatsappQueue";
import Ticket from "../../models/Ticket";
import AppError from "../../errors/AppError";
import cacheLayer from "../../libs/cache";
import logger from "../../utils/logger";
import { Op } from "sequelize";

const DeleteWhatsAppService = async (id: string): Promise<void> => {
  const whatsapp = await Whatsapp.findOne({
    where: { id }
  });

  if (!whatsapp) {
    throw new AppError("ERR_NO_WAPP_FOUND", 404);
  }

  // Antes do destroy (FK SET NULL): migrar tickets ativos para outra conexão do mesmo canal
  try {
    const replacement = await Whatsapp.findOne({
      where: {
        companyId: whatsapp.companyId,
        channel: whatsapp.channel || "whatsapp",
        status: "CONNECTED",
        id: { [Op.ne]: whatsapp.id }
      },
      order: [
        ["isDefault", "DESC"],
        ["updatedAt", "DESC"]
      ]
    });

    if (replacement) {
      const [moved] = await Ticket.update(
        { whatsappId: replacement.id },
        {
          where: {
            whatsappId: whatsapp.id,
            status: { [Op.in]: ["open", "pending", "group"] }
          }
        }
      );
      if (moved > 0) {
        logger.info(
          `[DeleteWhatsApp] ${moved} ticket(s) migrados de whatsapp=${whatsapp.id} -> ${replacement.id}`
        );
      }
    }
  } catch (err) {
    logger.warn(
      { err, id },
      "DeleteWhatsAppService: falha ao migrar tickets antes do delete"
    );
  }

  await WhatsappQueue.destroy({
    where: { whatsappId: id }
  });

  /** Persistir remoção no PG antes do Redis — delFromPattern pode travar se Redis estiver indisponível. */
  await whatsapp.destroy();

  try {
    await cacheLayer.delFromPattern(`sessions:${id}:*`);
  } catch (err) {
    logger.error(
      { err, id },
      "DeleteWhatsAppService: falha ao limpar sessões no Redis (conexão já removida do BD)"
    );
  }
};

export default DeleteWhatsAppService;
