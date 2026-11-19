import path, { join } from "path";
import fs from "fs";
import axios from "axios";
import { Op } from "sequelize";
import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";
import { getWbot } from "../../libs/wbot";
import { getIO } from "../../libs/socket";
import { normalizeJid } from "../../utils";
import logger from "../../utils/logger";

interface Params {
  contact: Contact;
  companyId: number;
  force?: boolean;
}

const META_OFICIAL_CHANNELS = ["whatsapp_oficial", "whatsapp_oficial_api"];

const isPlaceholderUrl = (url?: string | null): boolean => {
  const u = String(url || "");
  return !u || u.includes("nopicture") || u.includes("noimage");
};

/** Variantes BR (com/sem 9º dígito) + número original. */
export function buildOficialPicNumberCandidates(number: string): string[] {
  const n = String(number || "").replace(/\D/g, "");
  if (!n) return [];
  const out = new Set<string>([n]);
  if (n.startsWith("55") && n.length >= 12) {
    const ddd = n.slice(2, 4);
    const rest = n.slice(4);
    if (rest.length === 8) {
      out.add(`55${ddd}9${rest}`);
    } else if (rest.length === 9 && rest.startsWith("9")) {
      out.add(`55${ddd}${rest.slice(1)}`);
    }
  }
  return [...out];
}

/**
 * Localiza contato existente pelo número (com variantes BR), priorizando quem já tem foto.
 */
export async function findContactForOficialNumber(
  companyId: number,
  number: string,
  preferOficialChannel = true
): Promise<Contact | null> {
  const candidates = buildOficialPicNumberCandidates(number);
  if (!candidates.length) return null;

  const rows = await Contact.findAll({
    where: {
      companyId,
      number: { [Op.in]: candidates }
    },
    order: [
      ["pictureUpdated", "DESC"],
      ["updatedAt", "DESC"]
    ],
    limit: 30
  });

  if (!rows.length) return null;

  const withLocalPic = rows.find(c => hasUsableLocalPicture(c, companyId));
  if (withLocalPic) return withLocalPic;

  const withRemotePic = rows.find(
    c => !isPlaceholderUrl(c.profilePicUrl) || !isPlaceholderUrl(c.urlPicture)
  );
  if (withRemotePic) return withRemotePic;

  if (preferOficialChannel) {
    const oficial = rows.find(c =>
      META_OFICIAL_CHANNELS.includes(String(c.channel || ""))
    );
    if (oficial) return oficial;
  }

  return rows[0];
}

const hasUsableLocalPicture = (
  contact: Contact,
  companyId: number
): boolean => {
  const rawPicture = contact.getDataValue("urlPicture");
  if (!rawPicture || rawPicture === "nopicture.png") return false;
  const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");
  const filePath = join(
    publicFolder,
    `company${companyId}`,
    "contacts",
    String(rawPicture).split(/[/\\]/).pop() || ""
  );
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
  } catch {
    return false;
  }
};

const emitContactUpdate = (companyId: number, contact: Contact): void => {
  try {
    const io = getIO();
    io.of(String(companyId)).emit(`company-${companyId}-contact`, {
      action: "update",
      contact: contact.get({ plain: true })
    });
  } catch {
    /* socket opcional */
  }
};

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

/** Cache fresco: arquivo local + pictureUpdated (sem depender de coluna nova). */
const isCacheFresh = (contact: Contact): boolean => {
  if (!contact.pictureUpdated) return false;
  const updated = contact.updatedAt ? new Date(contact.updatedAt).getTime() : 0;
  if (!updated || Number.isNaN(updated)) return true; // tem arquivo local → reusa
  return Date.now() - updated < CACHE_TTL_MS;
};

const persistPicture = async (
  contact: Contact,
  companyId: number,
  profilePicUrl: string,
  localFile?: string | null
): Promise<Contact> => {
  const patch: Record<string, unknown> = {
    profilePicUrl,
    pictureUpdated: Boolean(localFile),
    remoteJid:
      contact.remoteJid ||
      `${String(contact.number || "").replace(/\D/g, "")}@s.whatsapp.net`
  };
  if (localFile) {
    patch.urlPicture = localFile;
  }
  await contact.update(patch);
  const reloaded = await contact.reload();
  emitContactUpdate(companyId, reloaded);
  return reloaded;
};

const downloadToContactFile = async (
  contact: Contact,
  companyId: number,
  profilePicUrl: string
): Promise<string | null> => {
  const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");
  const folder = path.resolve(publicFolder, `company${companyId}`, "contacts");

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
      maxRedirects: 5,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: "https://web.whatsapp.com/"
      }
    });
    if (!response.data || !response.data.byteLength) {
      return null;
    }
    fs.writeFileSync(filePath, response.data);
    return filename;
  } catch (err: any) {
    logger.warn(
      `[OFICIAL-PIC] Falha download contact=${contact.id}: ${err?.message}`
    );
    return null;
  }
};

/**
 * Tenta copiar arquivo/URL de outro contato da mesma empresa com o mesmo número
 * (ex.: já sincronizado via WhatsApp Web / Baileys).
 */
const tryCopyFromSiblingContact = async (
  contact: Contact,
  companyId: number,
  numberCandidates: string[]
): Promise<Contact | null> => {
  const siblings = await Contact.findAll({
    where: {
      companyId,
      id: { [Op.ne]: contact.id },
      number: { [Op.in]: numberCandidates },
      [Op.or]: [
        { pictureUpdated: true },
        {
          profilePicUrl: {
            [Op.and]: [
              { [Op.ne]: null },
              { [Op.ne]: "" },
              { [Op.notLike]: "%nopicture%" },
              { [Op.notLike]: "%noimage%" }
            ]
          }
        }
      ]
    },
    order: [
      ["pictureUpdated", "DESC"],
      ["updatedAt", "DESC"]
    ],
    limit: 15
  });

  for (const sibling of siblings) {
    const siblingRaw = sibling.getDataValue("urlPicture");
    const siblingRemote = String(sibling.profilePicUrl || "").trim();

    if (siblingRaw && siblingRaw !== "nopicture.png") {
      const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");
      const src = join(
        publicFolder,
        `company${companyId}`,
        "contacts",
        String(siblingRaw).split(/[/\\]/).pop() || ""
      );
      const destName = `${contact.id}.jpeg`;
      const dest = join(
        publicFolder,
        `company${companyId}`,
        "contacts",
        destName
      );
      try {
        if (fs.existsSync(src) && fs.statSync(src).size > 0) {
          fs.copyFileSync(src, dest);
          logger.info(
            `[OFICIAL-PIC] Copiou foto do contato ${sibling.id} → ${contact.id}`
          );
          return persistPicture(
            contact,
            companyId,
            siblingRemote || sibling.urlPicture || "",
            destName
          );
        }
      } catch (err: any) {
        logger.warn(
          `[OFICIAL-PIC] Falha ao copiar foto sibling=${sibling.id}: ${err?.message}`
        );
      }
    }

    if (!isPlaceholderUrl(siblingRemote)) {
      const local = await downloadToContactFile(
        contact,
        companyId,
        siblingRemote
      );
      if (local || !isPlaceholderUrl(siblingRemote)) {
        return persistPicture(contact, companyId, siblingRemote, local);
      }
    }
  }

  return null;
};

const fetchPicViaBaileys = async (
  companyId: number,
  numberCandidates: string[],
  preferredJid?: string | null
): Promise<string> => {
  const baileysConns = await Whatsapp.findAll({
    where: {
      companyId,
      status: "CONNECTED",
      [Op.or]: [{ channel: "whatsapp" }, { channel: null }, { channel: "" }]
    },
    order: [
      ["isDefault", "DESC"],
      ["id", "DESC"]
    ]
  });

  const conns = baileysConns;

  if (!conns.length) {
    logger.info(
      `[OFICIAL-PIC] Nenhuma sessão Baileys CONNECTED company=${companyId}`
    );
    return "";
  }

  for (const conn of conns) {
    let wbot: any;
    try {
      wbot = await getWbot(conn.id);
    } catch (err: any) {
      logger.info(
        `[OFICIAL-PIC] Sessão ${conn.id} não inicializada: ${err?.message || err}`
      );
      continue;
    }

    if (!wbot?.profilePictureUrl) continue;

    const jidsToTry: string[] = [];
    if (preferredJid) {
      jidsToTry.push(String(preferredJid));
    }

    for (const num of numberCandidates) {
      const jid =
        normalizeJid(`${num}@s.whatsapp.net`) || `${num}@s.whatsapp.net`;
      if (!jidsToTry.includes(jid)) jidsToTry.push(jid);

      try {
        if (typeof wbot.onWhatsApp === "function") {
          const ow = await wbot.onWhatsApp(jid);
          const resolved = ow?.[0]?.jid;
          if (ow?.[0]?.exists && resolved && !jidsToTry.includes(resolved)) {
            jidsToTry.unshift(resolved);
          }
        }
      } catch {
        /* tenta profilePictureUrl mesmo assim */
      }
    }

    for (const jid of jidsToTry) {
      for (const picType of ["image", "preview"] as const) {
        try {
          const url = await wbot.profilePictureUrl(jid, picType);
          if (!isPlaceholderUrl(url)) {
            logger.info(
              `[OFICIAL-PIC] Foto via Baileys conn=${conn.id} jid=${jid} type=${picType}`
            );
            return String(url);
          }
        } catch (err: any) {
          logger.info(
            `[OFICIAL-PIC] Sem foto jid=${jid} type=${picType} conn=${conn.id}: ${err?.message || err}`
          );
        }
      }
    }
  }

  return "";
};

/**
 * Cloud API não expõe foto de contato. Estratégia (opcional / complementar):
 * 1) reaproveitar foto de contato irmão (mesmo número)
 * 2) buscar via sessão Baileys (WhatsApp Web) da empresa, se existir
 *
 * Sem fonte disponível o contato fica sem foto — o frontend exibe iniciais.
 * Cache local: não refetch se arquivo local existe e pictureUpdated.
 */
export async function syncOficialContactProfilePic(
  params: Params
): Promise<Contact> {
  const { contact, companyId, force } = params;

  if (
    !force &&
    hasUsableLocalPicture(contact, companyId) &&
    contact.pictureUpdated &&
    isCacheFresh(contact)
  ) {
    return contact;
  }

  // Tem arquivo local estável → reusa (não depende de coluna nova no banco)
  if (!force && hasUsableLocalPicture(contact, companyId) && contact.pictureUpdated) {
    return contact;
  }

  const numberCandidates = buildOficialPicNumberCandidates(contact.number);
  if (!numberCandidates.length) {
    return contact;
  }

  try {
    const copied = await tryCopyFromSiblingContact(
      contact,
      companyId,
      numberCandidates
    );
    if (
      copied &&
      (hasUsableLocalPicture(copied, companyId) ||
        !isPlaceholderUrl(copied.profilePicUrl || copied.urlPicture))
    ) {
      return copied;
    }
  } catch (err: any) {
    logger.warn(
      `[OFICIAL-PIC] sibling copy fail contact=${contact.id}: ${err?.message}`
    );
  }

  const profilePicUrl = await fetchPicViaBaileys(
    companyId,
    numberCandidates,
    contact.remoteJid
  );

  if (isPlaceholderUrl(profilePicUrl)) {
    return contact;
  }

  const localFile = await downloadToContactFile(
    contact,
    companyId,
    profilePicUrl
  );

  // Preferir arquivo local (CDN Baileys expira). Se download falhar, ainda
  // grava URL remota para o frontend tentar exibir imediatamente.
  return persistPicture(contact, companyId, profilePicUrl, localFile);
}

/**
 * Backfill: rebaixa fotos de contatos da API Oficial sem arquivo local
 * (disco efêmero / deploy / Baileys voltou a ficar CONNECTED).
 */
export async function syncMissingOficialProfilePicsForCompany(
  companyId: number,
  limit = 80
): Promise<{ scanned: number; updated: number; hasBaileys: boolean }> {
  const baileysCount = await Whatsapp.count({
    where: {
      companyId,
      status: "CONNECTED",
      [Op.or]: [{ channel: "whatsapp" }, { channel: null }, { channel: "" }]
    }
  });
  const hasBaileys = baileysCount > 0;

  const contacts = await Contact.findAll({
    where: {
      companyId,
      channel: { [Op.in]: META_OFICIAL_CHANNELS }
    },
    order: [["updatedAt", "DESC"]],
    limit: Math.min(200, Math.max(1, limit))
  });

  let updated = 0;
  for (const contact of contacts) {
    if (hasUsableLocalPicture(contact, companyId) && contact.pictureUpdated) {
      continue;
    }

    try {
      const before = contact.getDataValue("urlPicture");
      const beforePic = String(contact.profilePicUrl || "");
      const synced = await syncOficialContactProfilePic({
        contact,
        companyId,
        force: true
      });
      const after = synced.getDataValue("urlPicture");
      const afterPic = String(synced.profilePicUrl || "");
      if (
        (after && after !== before && after !== "nopicture.png") ||
        (afterPic && afterPic !== beforePic && !isPlaceholderUrl(afterPic))
      ) {
        updated += 1;
      }
    } catch (err: any) {
      logger.warn(
        `[OFICIAL-PIC] backfill fail contact=${contact.id}: ${err?.message}`
      );
    }
  }

  return { scanned: contacts.length, updated, hasBaileys };
}

export {
  META_OFICIAL_CHANNELS,
  isPlaceholderUrl,
  hasUsableLocalPicture
};
