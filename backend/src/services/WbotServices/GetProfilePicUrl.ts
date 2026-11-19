import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import { getWbot } from "../../libs/wbot";
import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";
import { normalizeJid } from "../../utils";
import { Op } from "sequelize";

const GetProfilePicUrl = async (
  number: string,
  companyId: number,
  contact?: Contact,
): Promise<string> => {

  const normalizedNumber = normalizeJid(number);

  // Preferir sessão Baileys (WhatsApp Web). Conexão oficial não tem profilePictureUrl.
  let sessionWhatsapp =
    (await Whatsapp.findOne({
      where: {
        companyId,
        status: "CONNECTED",
        [Op.or]: [{ channel: "whatsapp" }, { channel: null }, { channel: "" }]
      },
      order: [
        ["isDefault", "DESC"],
        ["id", "DESC"]
      ]
    })) || null;

  if (!sessionWhatsapp) {
    try {
      const fallback = await GetDefaultWhatsApp(companyId);
      if (fallback && fallback.channel !== "whatsapp_oficial") {
        sessionWhatsapp = fallback;
      }
    } catch {
      sessionWhatsapp = null;
    }
  }

  if (!sessionWhatsapp) {
    return `${process.env.FRONTEND_URL}/nopicture.png`;
  }

  const wbot = await getWbot(sessionWhatsapp.id);
  if (!wbot?.profilePictureUrl) {
    return `${process.env.FRONTEND_URL}/nopicture.png`;
  }

  let profilePicUrl: string;
  try {
    profilePicUrl = await wbot.profilePictureUrl(
      contact && contact.isGroup ? contact.remoteJid : `${normalizedNumber}`,
      "image"
    );
  } catch (error) {
    profilePicUrl = `${process.env.FRONTEND_URL}/nopicture.png`;
  }

  return profilePicUrl;
};

export default GetProfilePicUrl;
