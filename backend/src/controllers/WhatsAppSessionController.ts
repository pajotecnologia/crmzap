import { Request, Response } from "express";
import { getWbot, removeWbot } from "../libs/wbot";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import { StartWhatsAppSession } from "../services/WbotServices/StartWhatsAppSession";
import UpdateWhatsAppService from "../services/WhatsappService/UpdateWhatsAppService";
import DeleteBaileysService from "../services/BaileysServices/DeleteBaileysService";
import cacheLayer from "../libs/cache";
import Whatsapp from "../models/Whatsapp";
import { getIO } from "../libs/socket";

const store = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId, id: userId } = req.user;

  // console.log("STARTING SESSION", whatsappId)
  const whatsapp = await ShowWhatsAppService(whatsappId, companyId, undefined, +userId);

  if (whatsapp.channel === "telegram" || whatsapp.channel === "telegram_oficial") {
    return res.status(400).json({
      error:
        "Esta conexão é Telegram. Use o botão Login / Webhook na tela de conexões, não o fluxo de QR do WhatsApp."
    });
  }

  if (whatsapp.channel !== "whatsapp" && whatsapp.channel !== "whatsapp_oficial") {
    return res.status(400).json({
      error: "Tipo de conexão sem sessão WhatsApp (QR Code)."
    });
  }

  // Se a conexão estava desconectada ou pendente sem QR code, limpa credenciais obsoletas para permitir nova leitura
  if (whatsapp.channel === "whatsapp" && whatsapp.status !== "CONNECTED" && !whatsapp.qrcode) {
    try {
      await removeWbot(whatsapp.id, false);
      await DeleteBaileysService(whatsapp.id);
      await cacheLayer.delFromPattern(`sessions:${whatsapp.id}:*`);
    } catch (err) {
      // ignore
    }
  }

  await StartWhatsAppSession(whatsapp, companyId);

  return res.status(200).json({ message: "Starting session." });
};

const update = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId, id: userId } = req.user;

  const whatsapp = await ShowWhatsAppService(whatsappId, companyId, undefined, +userId);

  if (whatsapp.channel === "whatsapp") {
    try {
      await removeWbot(whatsapp.id, true);
    } catch (err) {
      // ignore
    }

    try {
      await DeleteBaileysService(whatsapp.id);
      await cacheLayer.delFromPattern(`sessions:${whatsapp.id}:*`);
    } catch (err) {
      // ignore
    }

    await whatsapp.update({ session: "", qrcode: "", status: "PENDING", retries: 0 });

    try {
      const io = getIO();
      io.of("/" + String(whatsapp.companyId)).emit(`company-${whatsapp.companyId}-whatsappSession`, {
        action: "update",
        session: whatsapp
      });
    } catch (err) {
      // ignore
    }

    await StartWhatsAppSession(whatsapp, whatsapp.companyId);
  }

  return res.status(200).json({ message: "Starting session." });
};

const remove = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId, id: userId } = req.user;
  console.log("DISCONNECTING SESSION", whatsappId);
  const whatsapp = await ShowWhatsAppService(whatsappId, companyId, undefined, +userId);

  if (whatsapp.channel === "whatsapp") {
    try {
      await removeWbot(whatsapp.id, true);
    } catch (err) {
      // ignore
    }

    try {
      await DeleteBaileysService(whatsappId);
      await cacheLayer.delFromPattern(`sessions:${whatsapp.id}:*`);
    } catch (err) {
      // ignore
    }

    await whatsapp.update({ status: "DISCONNECTED", session: "", qrcode: "" });

    try {
      const io = getIO();
      io.of("/" + String(whatsapp.companyId)).emit(`company-${whatsapp.companyId}-whatsappSession`, {
        action: "update",
        session: whatsapp
      });
    } catch (err) {
      // ignore
    }
  }

  return res.status(200).json({ message: "Session disconnected." });
};

export default { store, remove, update };
