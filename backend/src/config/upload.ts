import path from "path";
import multer from "multer";
import fs from "fs";
import mime from "mime-types";
import Whatsapp from "../models/Whatsapp";
import { isEmpty, isNil } from "lodash";

const publicFolder = path.resolve(__dirname, "..", "..", "public");

/**
 * Galerias do iOS/Android enviam vários arquivos com o mesmo nome ("image.jpg") no mesmo
 * milissegundo, e nomes com acentos/#/?/% quebram a URL pública do anexo.
 */
const buildUniqueMediaFileName = (file: Express.Multer.File): string => {
  const original = String(file.originalname || "arquivo");
  const parsed = path.parse(original);
  let ext = parsed.ext.toLowerCase();
  if (!ext || !/^\.[a-z0-9]{1,8}$/.test(ext)) {
    const fromMime = file.mimetype ? mime.extension(file.mimetype) : false;
    ext = fromMime ? `.${fromMime}` : "";
  }
  const base =
    parsed.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 80) || "arquivo";
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return `${unique}_${base}${ext}`;
};

export default {
  directory: publicFolder,
  storage: multer.diskStorage({
    destination: async function (req, file, cb) {
      let companyId;
      companyId = req.user?.companyId;
      const { typeArch, userId } = req.body;

      console.log("🛠 Upload destination - Dados recebidos:", {
        companyId,
        typeArch,
        userId,
        fieldname: file.fieldname,
        originalname: file.originalname,
        mimetype: file.mimetype
      });

      if (companyId === undefined && isNil(companyId) && isEmpty(companyId)) {
        const authHeader = req.headers.authorization;
        const [, token] = authHeader.split(" ");
        const whatsapp = await Whatsapp.findOne({ where: { token } });
        companyId = whatsapp.companyId;
      }

      let folder;

      if (typeArch === "user" || file.fieldname === "profileImage") {
        // Para usuários, criar pasta específica da empresa
        folder = path.resolve(publicFolder, `company${companyId}`, "user");
      } else if (typeArch && typeArch !== "announcements" && typeArch !== "logo") {
        if (typeArch === "fileList") {
          // Para fileList, usar fileId em vez de userId
          const { fileId } = req.body;
          folder = path.resolve(publicFolder, `company${companyId}`, typeArch, fileId ? String(fileId) : "");
        } else {
          folder = path.resolve(publicFolder, `company${companyId}`, typeArch, userId ? userId : "");
        }
      } else if (typeArch && typeArch === "announcements") {
        folder = path.resolve(publicFolder, typeArch);
      } else if (typeArch && typeArch === "flow") {
        folder = path.resolve(publicFolder, `company${companyId}`, typeArch);
      } else if (typeArch && typeArch === "chat") {
        // Para chat interno, usar fileId como chatId para criar pasta específica
        folder = path.resolve(publicFolder, `company${companyId}`, typeArch);
      } else if (typeArch && typeArch === "groups") {
        folder = path.resolve(publicFolder, `company${companyId}`, typeArch);
      } else if (typeArch === "logo") {
        folder = path.resolve(publicFolder);
      } else if (typeArch === "quickMessage") {
        folder = path.resolve(publicFolder, `company${companyId}`, typeArch);
      } else {
        folder = path.resolve(publicFolder, `company${companyId}`);
      }

      console.log("📂 Pasta de destino final:", folder);

      if (!fs.existsSync(folder)) {
        console.log("📁 Criando pasta:", folder);
        fs.mkdirSync(folder, { recursive: true });
        fs.chmodSync(folder, 0o777);
        console.log("✅ Pasta criada com sucesso");
      }

      return cb(null, folder);
    },
    
    filename(req, file, cb) {
      const { typeArch } = req.body;
      
      console.log("🏷️ Gerando nome do arquivo:", {
        fieldname: file.fieldname,
        originalname: file.originalname,
        mimetype: file.mimetype,
        typeArch
      });
      
      // Para imagens de perfil, gerar nome único
      if ((typeArch === "user" || file.fieldname === "profileImage") && file.mimetype.startsWith('image/')) {
        const timestamp = new Date().getTime();
        const extension = path.extname(file.originalname) || '.jpg';
        const fileName = `profile_${timestamp}${extension}`;
        console.log("🖼️ Nome gerado para imagem de perfil:", fileName);
        return cb(null, fileName);
      }
      
      // Para arquivos de áudio gravado no campo "audio", preservar extensão real
      if (file.fieldname === 'audio') {
        const timestamp = new Date().getTime();
        const originalExt = path.extname(file.originalname || "").toLowerCase();
        const extension = [".mp3", ".ogg", ".webm", ".m4a", ".wav", ".aac"].includes(originalExt)
          ? originalExt
          : (file.mimetype === "audio/mpeg" || file.mimetype === "audio/mp3" ? ".mp3" : ".ogg");
        const fileName = `audio_${timestamp}${extension}`;
        console.log("🎵 Nome gerado para áudio gravado:", fileName);
        return cb(null, fileName);
      }

      // Para outros arquivos de áudio, verificar se precisa converter extensão
      if (file.mimetype && file.mimetype.startsWith('audio/')) {
        const timestamp = new Date().getTime();
        let extension = ".mp3";

        if (file.originalname) {
          const originalExt = path.extname(file.originalname).toLowerCase();
          if (['.ogg', '.mp3', '.m4a', '.aac', '.webm', '.wav'].includes(originalExt)) {
            extension = originalExt;
          } else if (file.mimetype.includes("ogg")) {
            extension = ".ogg";
          } else if (file.mimetype.includes("webm")) {
            extension = ".webm";
          }
        }

        const fileName = typeArch && !["chat", "announcements"].includes(typeArch)
          ? `${path.parse(file.originalname).name}_${timestamp}${extension}`
          : `audio_${timestamp}${extension}`;

        console.log("🎵 Nome gerado para arquivo de áudio:", fileName);
        return cb(null, fileName);
      }

      // Logos whitelabel: nome único por upload + modo — evita sobrescrever o arquivo da logo claro
      // quando a escura usa o mesmo originalname (comum), e evita duas chaves apontando para um único ficheiro sobrescrito.
      if (typeArch === "logo") {
        const modeRaw = (req.body as { mode?: string })?.mode || "logo";
        const mode = String(modeRaw).replace(/[^a-zA-Z0-9]/g, "") || "logo";
        const timestamp = new Date().getTime();
        const ext = path.extname(file.originalname || "") || ".png";
        const base = path
          .parse(file.originalname || "logo")
          .name.replace(/[^a-zA-Z0-9_-]/g, "_")
          .slice(0, 80);
        const fileName = `wl_${mode.toLowerCase()}_${base}_${timestamp}${ext}`;
        console.log("🖼️ Nome gerado para logo whitelabel:", fileName);
        return cb(null, fileName);
      }

      // Para outros tipos de arquivo
      const fileName = typeArch && !["chat", "announcements"].includes(typeArch) 
        ? file.originalname.replace('/', '-').replace(/ /g, "_") 
        : buildUniqueMediaFileName(file);
      
      console.log("📄 Nome gerado para arquivo:", fileName);
      return cb(null, fileName);
    }
  }),

  // Limite de tamanho: 100MB geral
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  }
};