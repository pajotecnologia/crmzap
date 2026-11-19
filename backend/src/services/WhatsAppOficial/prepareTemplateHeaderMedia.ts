import Whatsapp from "../../models/Whatsapp";
import { uploadMetaCloudMedia } from "./uploadMetaCloudMedia";
import {
  assertTemplateMediaFile,
  MetaTemplateSource,
  MetaTemplateVariablesInput
} from "./buildMetaTemplatePayload";

const MEDIA_FORMATS = new Set(["IMAGE", "VIDEO", "DOCUMENT"]);

export async function prepareTemplateHeaderMedia(params: {
  template: MetaTemplateSource;
  variables: MetaTemplateVariablesInput;
  file?: Express.Multer.File | null;
  whatsapp: Whatsapp;
}): Promise<{
  variables: MetaTemplateVariablesInput;
  localMediaFilename: string | null;
}> {
  const file = params.file;
  if (!file) {
    return { variables: params.variables || {}, localMediaFilename: null };
  }

  const header = (params.template?.components || []).find(
    component => String(component?.type || "").toUpperCase() === "HEADER"
  );
  const format = String(header?.format || "").toUpperCase();
  if (!MEDIA_FORMATS.has(format)) {
    throw new Error(
      "Este template não possui cabeçalho de mídia. Remova o arquivo anexado."
    );
  }

  assertTemplateMediaFile(
    {
      mimetype: file.mimetype,
      size: file.size,
      originalname: file.originalname
    },
    format
  );

  if (!file.path) {
    throw new Error("Arquivo de mídia não foi salvo no servidor.");
  }

  const uploaded = await uploadMetaCloudMedia(
    params.whatsapp,
    file.path,
    file.mimetype || "application/octet-stream",
    file.originalname || file.filename
  );

  if (!uploaded?.id) {
    throw new Error("A Meta não retornou o identificador da mídia.");
  }

  const next: MetaTemplateVariablesInput = {
    ...(params.variables || {})
  };
  next.header = {
    ...(next.header || {}),
    "1": {
      ...(next.header?.["1"] || {}),
      value: String(uploaded.id),
      filename: file.originalname || file.filename,
      localFile: file.filename
    }
  };

  return { variables: next, localMediaFilename: file.filename || null };
}
