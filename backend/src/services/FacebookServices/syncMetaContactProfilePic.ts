import path, { join } from "path";
import fs from "fs";
import axios from "axios";
import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";
import { getIO } from "../../libs/socket";
import { profilePsid } from "../FacebookServices/graphAPI";
import logger from "../../utils/logger";

interface Params {
  connection: Whatsapp;
  contact: Contact;
  /** PSID / IGSID do contato Meta */
  psid: string;
  force?: boolean;
}

const isPlaceholderUrl = (url?: string | null): boolean => {
  const u = String(url || "");
  return !u || u.includes("nopicture") || u.includes("noimage");
};

/** CDN Meta/IG expira em poucos dias — não considerar estável. */
export const isExpiringMetaCdnUrl = (url?: string | null): boolean => {
  const u = String(url || "").toLowerCase();
  if (!u) return false;
  return (
    u.includes("fbcdn") ||
    u.includes("scontent") ||
    u.includes("cdninstagram") ||
    u.includes("instagram.com") ||
    u.includes("fbsbx.com")
  );
};

const hasUsableLocalPicture = (contact: Contact): boolean => {
  const rawPicture = contact.getDataValue("urlPicture");
  if (!rawPicture || rawPicture === "nopicture.png") return false;
  const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");
  const filePath = join(
    publicFolder,
    `company${contact.companyId}`,
    "contacts",
    String(rawPicture).split(/[/\\]/).pop() || ""
  );
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
  } catch {
    return false;
  }
};

const extractProfilePic = (profile: any): string => {
  if (!profile || typeof profile !== "object") return "";
  return String(
    profile.profile_pic ||
      profile.profile_picture_url ||
      profile.profilePic ||
      profile.picture?.data?.url ||
      ""
  ).trim();
};

/**
 * Baixa e persiste foto de perfil de contato Instagram/Facebook (Graph profile_pic).
 * Sempre rebusca na Graph quando force=true ou não há arquivo local estável
 * (CDN remota expira).
 */
export async function syncMetaContactProfilePic(
  params: Params
): Promise<Contact> {
  const { connection, contact, psid, force } = params;

  if (!force && hasUsableLocalPicture(contact) && contact.pictureUpdated) {
    return contact;
  }

  const token = String(
    connection.facebookUserToken || connection.token || ""
  ).trim();
  if (!token || !psid) {
    logger.info(
      `[META-PIC] Sem token/psid contact=${contact.id} channel=${connection.channel}`
    );
    return contact;
  }

  let profilePicUrl = "";
  try {
    const profile = await profilePsid(String(psid), token, {
      provider: connection.provider,
      igUserId: connection.facebookPageUserId
    });
    profilePicUrl = extractProfilePic(profile);
  } catch (err: any) {
    logger.warn(
      `[META-PIC] Falha ao buscar perfil psid=${psid}: ${err?.message}`
    );
    return contact;
  }

  if (isPlaceholderUrl(profilePicUrl)) {
    logger.info(`[META-PIC] Graph sem profile_pic psid=${psid}`);
    return contact;
  }

  const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");
  const folder = path.resolve(
    publicFolder,
    `company${contact.companyId}`,
    "contacts"
  );

  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
    try {
      fs.chmodSync(folder, 0o777);
    } catch {
      /* ignore */
    }
  }

  const filename = `${contact.id}.jpeg`;
  const filePath = join(folder, filename);

  try {
    const response = await axios.get(profilePicUrl, {
      responseType: "arraybuffer",
      timeout: 25000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "image/*,*/*"
      }
    });
    if (response.data && (response.data as ArrayBuffer).byteLength > 0) {
      fs.writeFileSync(filePath, response.data);
    } else {
      throw new Error("empty image body");
    }
  } catch (err: any) {
    logger.warn(
      `[META-PIC] Falha ao baixar foto psid=${psid}: ${err?.message}`
    );
    await contact.update({
      profilePicUrl,
      pictureUpdated: false
    });
    const reloadedRemote = await contact.reload();
    emitContactUpdate(reloadedRemote);
    return reloadedRemote;
  }

  await contact.update({
    urlPicture: filename,
    profilePicUrl,
    pictureUpdated: true
  });

  const reloaded = await contact.reload();
  emitContactUpdate(reloaded);
  logger.info(
    `[META-PIC] OK contact=${contact.id} channel=${connection.channel} local=${filename}`
  );
  return reloaded;
}

function emitContactUpdate(contact: Contact): void {
  try {
    const io = getIO();
    io.of(String(contact.companyId)).emit(
      `company-${contact.companyId}-contact`,
      {
        action: "update",
        contact: contact.get({ plain: true })
      }
    );
  } catch {
    /* socket opcional */
  }
}

/**
 * Backfill: atualiza fotos de contatos Instagram/Facebook sem arquivo local.
 */
export async function syncMissingMetaProfilePicsForCompany(
  companyId: number,
  limit = 80
): Promise<{ scanned: number; updated: number }> {
  const { Op } = await import("sequelize");
  const contacts = await Contact.findAll({
    where: {
      companyId,
      channel: { [Op.in]: ["instagram", "facebook"] }
    },
    order: [["updatedAt", "DESC"]],
    limit: Math.min(200, Math.max(1, limit))
  });

  let updated = 0;
  for (const contact of contacts) {
    if (hasUsableLocalPicture(contact) && contact.pictureUpdated) {
      continue;
    }

    const connection =
      (contact.whatsappId
        ? await Whatsapp.findOne({
            where: {
              id: contact.whatsappId,
              companyId,
              channel: contact.channel
            }
          })
        : null) ||
      (await Whatsapp.findOne({
        where: {
          companyId,
          channel: contact.channel,
          status: "CONNECTED"
        },
        order: [["id", "DESC"]]
      }));

    if (!connection) continue;

    try {
      const before = contact.getDataValue("urlPicture");
      const synced = await syncMetaContactProfilePic({
        connection,
        contact,
        psid: String(contact.number || "").trim(),
        force: true
      });
      const after = synced.getDataValue("urlPicture");
      if (after && after !== before && after !== "nopicture.png") {
        updated += 1;
      } else if (
        !isPlaceholderUrl(synced.profilePicUrl) &&
        isPlaceholderUrl(contact.profilePicUrl)
      ) {
        updated += 1;
      }
    } catch (err: any) {
      logger.warn(
        `[META-PIC] backfill fail contact=${contact.id}: ${err?.message}`
      );
    }
  }

  return { scanned: contacts.length, updated };
}

export { isPlaceholderUrl, hasUsableLocalPicture };
