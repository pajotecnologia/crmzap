import { FindOptions } from "sequelize/types";
import Queue from "../../models/Queue";
import Whatsapp from "../../models/Whatsapp";
import Prompt from "../../models/Prompt";
import {
  attachTelegramOficialListMeta,
  normalizeTelegramOficialStatus
} from "../TelegramUserServices/normalizeTelegramOficialStatus";

interface Request {
  companyId: number;
  session?: number | string;
  isSuper?: boolean;
}

const hideInstagramPageIdPlaceholders = (whatsapps: Whatsapp[]): Whatsapp[] => {
  const facebookPageIds = new Set(
    whatsapps
      .filter((w: any) => w.channel === "facebook" && w.facebookPageUserId)
      .map((w: any) => String(w.facebookPageUserId))
  );
  if (!facebookPageIds.size) return whatsapps;
  return whatsapps.filter((w: any) => {
    if (w.channel !== "instagram") return true;
    if (!w.facebookPageUserId) return true;
    // Conexões ativas CONNECTED NUNCA devem ser escondidas do usuário
    if (String(w.status || "").toUpperCase() === "CONNECTED") return true;
    // Conexões com tokens configurados nunca devem ser escondidas
    if (w.facebookUserToken || (w as any).tokenMeta) return true;
    // Apenas placeholders antigos e desconectados são escondidos se colidirem com o Page ID
    const isLegacyPlaceholder =
      (w.name === "Instagram" || String(w.status || "").toUpperCase() === "DISCONNECTED") &&
      facebookPageIds.has(String(w.facebookPageUserId));
    return !isLegacyPlaceholder;
  });
};

const ListWhatsAppsService = async ({
  session,
  companyId,
  isSuper
}: Request): Promise<Whatsapp[]> => {
  const whereCondition: any = {};
  
  if (!isSuper) {
    whereCondition.companyId = companyId;
  }

  const options: FindOptions = {
    where: whereCondition,
    include: [
      {
        model: Queue,
        as: "queues",
        attributes: ["id", "name", "color", "greetingMessage"]
      },
      {
        model: Prompt,
        as: "prompt",
      }
    ]
  };

  if (session !== undefined && session == 0) {
    options.attributes = { exclude: ["session"] };
  }

  let whatsapps = await Whatsapp.findAll(options);

  if (!isSuper && whatsapps?.length) {
    whatsapps = hideInstagramPageIdPlaceholders(whatsapps);
  }

  // Telegram/LinkedIn não passam por sessão Baileys — OPENING era spinner infinito no UI
  const stuckOpening = whatsapps.filter(
    (w: any) =>
      (w.channel === "telegram" || w.channel === "linkedin") &&
      w.status === "OPENING" &&
      w.token
  );
  if (stuckOpening.length) {
    await Promise.all(
      stuckOpening.map((w: any) =>
        Whatsapp.update({ status: "CONNECTED" }, { where: { id: w.id } })
      )
    );
    whatsapps = whatsapps.map((w: any) => {
      if (
        (w.channel === "telegram" || w.channel === "linkedin") &&
        w.status === "OPENING"
      ) {
        return { ...w.toJSON(), status: "CONNECTED" };
      }
      return w;
    });
  }

  const tgOficial = whatsapps.filter(
    (w: any) => w.channel === "telegram_oficial"
  );
  if (tgOficial.length) {
    await Promise.all(
      tgOficial.map((w: any) => normalizeTelegramOficialStatus(w))
    );
    const refreshed = await Whatsapp.findAll({
      where: { id: tgOficial.map((w: any) => w.id) },
      attributes: { include: ["session", "tokenMeta"] }
    });
    const byId = new Map(refreshed.map((w) => [w.id, w]));
    whatsapps = whatsapps.map((w: any) => {
      const fresh = byId.get(w.id);
      return fresh || w;
    });
  }

  if (session !== undefined && session == 0) {
    return whatsapps.map((w: any) => {
      if (w.channel === "telegram_oficial") {
        return attachTelegramOficialListMeta(w);
      }
      const j = w.toJSON ? w.toJSON() : w;
      if (j.session !== undefined) delete j.session;
      return j;
    }) as any;
  }

  return whatsapps;
};



export default ListWhatsAppsService;
