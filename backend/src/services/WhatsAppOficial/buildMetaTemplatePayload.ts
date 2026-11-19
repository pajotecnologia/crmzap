import {
  IMetaMessageTemplate,
  IMetaMessageTemplateComponents,
  IMetaMessageTemplateComponentsParameters
} from "../../libs/whatsAppOficial/IWhatsAppOficial.interfaces";

export type MetaTemplateVariableEntry = {
  value?: string;
  buttonIndex?: number;
  filename?: string;
  localFile?: string;
};

export type MetaTemplateVariablesInput = Record<
  string,
  Record<string, MetaTemplateVariableEntry>
>;

export type MetaTemplateSourceComponent = {
  type?: string | null;
  text?: string | null;
  format?: string | null;
  example?: string | null;
  buttons?: unknown;
};

export type MetaTemplateSource = {
  shortcode?: string | null;
  language?: string | null;
  components?: MetaTemplateSourceComponent[] | null;
};

export type MetaTemplateButtonView = {
  type: string;
  text: string;
  url?: string;
  phone?: string;
  copyCode?: string;
  index: number;
};

export type MetaTemplateMediaView = {
  kind: "image" | "video" | "document";
  url?: string;
  id?: string;
  filename?: string;
  localFile?: string;
};

export type MetaTemplateView = {
  name: string;
  language: string;
  header: null | {
    format: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION";
    text?: string;
    media?: MetaTemplateMediaView;
  };
  body: string;
  footer: string | null;
  buttons: MetaTemplateButtonView[];
  previewText: string;
  sendError?: {
    code?: number | null;
    title?: string | null;
    message?: string | null;
    details?: string | null;
  } | null;
};

export type MetaTemplateSend = {
  payload: IMetaMessageTemplate;
  view: MetaTemplateView;
};

const MEDIA_FORMATS = new Set(["IMAGE", "VIDEO", "DOCUMENT"]);

const MEDIA_RULES: Record<
  string,
  { mimes: string[]; exts: string[]; maxBytes: number; label: string }
> = {
  IMAGE: {
    mimes: ["image/jpeg", "image/png"],
    exts: [".jpg", ".jpeg", ".png"],
    maxBytes: 5 * 1024 * 1024,
    label: "imagem JPEG ou PNG de até 5 MB"
  },
  VIDEO: {
    mimes: ["video/mp4", "video/3gpp"],
    exts: [".mp4", ".3gp", ".3gpp"],
    maxBytes: 16 * 1024 * 1024,
    label: "vídeo MP4 ou 3GPP de até 16 MB"
  },
  DOCUMENT: {
    mimes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain"
    ],
    exts: [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt"],
    maxBytes: 100 * 1024 * 1024,
    label: "documento PDF, Office ou TXT de até 100 MB"
  }
};

export function normalizeTemplateLanguage(code?: string | null): string {
  const raw = String(code || "pt_BR").trim().replace(/-/g, "_");
  if (!raw) return "pt_BR";
  const [lang, region] = raw.split("_");
  if (!region) return lang.toLowerCase();
  return `${lang.toLowerCase()}_${region.toUpperCase()}`;
}

export function parseTemplateVariables(raw: unknown): MetaTemplateVariablesInput {
  if (!raw) return {};
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return {};
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as MetaTemplateVariablesInput)
        : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as MetaTemplateVariablesInput;
  }
  return {};
}

export function parseTemplateButtons(raw: unknown): any[] {
  let current: unknown = raw;
  for (let i = 0; i < 3; i += 1) {
    if (Array.isArray(current)) return current;
    if (
      current == null ||
      current === "" ||
      current === "null" ||
      current === "undefined"
    ) {
      return [];
    }
    if (typeof current === "string") {
      try {
        current = JSON.parse(current);
        continue;
      } catch {
        return [];
      }
    }
    if (typeof current === "object") {
      const values = Object.values(current as Record<string, unknown>);
      if (
        values.length > 0 &&
        values.every(v => v && typeof v === "object")
      ) {
        return values as any[];
      }
      return [];
    }
    return [];
  }
  return Array.isArray(current) ? current : [];
}

function placeholdersIn(text: string): string[] {
  const found: string[] = [];
  const re = /\{\{\s*([^{}]+?)\s*\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const key = String(match[1] || "").trim();
    if (key && !found.includes(key)) found.push(key);
  }
  return found;
}

function bucketOf(
  variables: MetaTemplateVariablesInput,
  ...names: string[]
): Record<string, MetaTemplateVariableEntry> {
  for (const name of names) {
    const bucket = variables?.[name];
    if (bucket && typeof bucket === "object") return bucket;
  }
  return {};
}

function readEntry(
  bucket: Record<string, MetaTemplateVariableEntry>,
  key: string
): MetaTemplateVariableEntry | undefined {
  if (!bucket) return undefined;
  if (bucket[key]) return bucket[key];
  const numeric = Number(key);
  if (Number.isFinite(numeric) && bucket[String(numeric)]) {
    return bucket[String(numeric)];
  }
  return undefined;
}

function applyPlaceholders(
  text: string,
  bucket: Record<string, MetaTemplateVariableEntry>
): string {
  return String(text || "").replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_all, rawKey) => {
    const key = String(rawKey || "").trim();
    const value = readEntry(bucket, key)?.value;
    return value != null && String(value).length ? String(value) : `{{${key}}}`;
  });
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host === "::1"
  ) {
    return true;
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

export function classifyTemplateMediaValue(value: string): {
  mode: "link" | "id";
  value: string;
} {
  const v = String(value || "").trim();
  if (!v) {
    throw new Error(
      "Informe a mídia do cabeçalho: envie o arquivo ou um link https público."
    );
  }
  if (/^https?:\/\//i.test(v)) {
    let url: URL;
    try {
      url = new URL(v);
    } catch {
      throw new Error("O link da mídia do cabeçalho é inválido.");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("O link da mídia precisa começar com http:// ou https://.");
    }
    if (isPrivateHost(url.hostname)) {
      throw new Error(
        "A Meta não consegue baixar links locais ou de rede privada. Envie o arquivo pelo CRM ou use um link https público."
      );
    }
    return { mode: "link", value: v };
  }
  if (/^\d{8,}$/.test(v)) {
    return { mode: "id", value: v };
  }
  throw new Error(
    "Mídia do cabeçalho inválida. Envie o arquivo, um link https público ou um media_id da Meta."
  );
}

function filenameFromUrl(url: string): string | undefined {
  try {
    const base = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
    if (base && base.includes(".")) return base.slice(0, 200);
  } catch {
    /* ignore */
  }
  return undefined;
}

function mediaParameter(
  format: string,
  value: string,
  filename?: string
): IMetaMessageTemplateComponentsParameters {
  const kind = format.toLowerCase() as "image" | "video" | "document";
  const classified = classifyTemplateMediaValue(value);
  const media: { link?: string; id?: string; filename?: string } =
    classified.mode === "link"
      ? { link: classified.value }
      : { id: classified.value };
  if (kind === "document") {
    const name =
      String(filename || "").trim() ||
      (classified.mode === "link" ? filenameFromUrl(classified.value) : "") ||
      "documento";
    media.filename = name.slice(0, 240);
  }
  return {
    type: kind,
    [kind]: media
  } as IMetaMessageTemplateComponentsParameters;
}

function textParameter(
  key: string,
  value: string
): IMetaMessageTemplateComponentsParameters {
  const param: IMetaMessageTemplateComponentsParameters = {
    type: "text",
    text: value
  };
  if (!/^\d+$/.test(key)) {
    param.parameter_name = key;
  }
  return param;
}

function requireText(value: string, label: string): string {
  const text = String(value ?? "");
  if (!text.trim()) {
    throw new Error(`Preencha o parâmetro obrigatório: ${label}.`);
  }
  return text;
}

export function assertTemplateMediaFile(
  file: { mimetype?: string; size?: number; originalname?: string },
  format: string
): void {
  const rule = MEDIA_RULES[String(format || "").toUpperCase()];
  if (!rule) {
    throw new Error("Este template não espera arquivo no cabeçalho.");
  }
  const mime = String(file?.mimetype || "").toLowerCase();
  const name = String(file?.originalname || "").toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  const mimeOk = rule.mimes.includes(mime);
  const extOk = rule.exts.includes(ext);
  if (!mimeOk && !extOk) {
    throw new Error(
      `Arquivo incompatível com o cabeçalho ${format}. Use ${rule.label}.`
    );
  }
  const size = Number(file?.size || 0);
  if (size <= 0) {
    throw new Error("O arquivo de mídia está vazio.");
  }
  if (size > rule.maxBytes) {
    throw new Error(
      `Arquivo acima do limite da Meta para ${format}. Use ${rule.label}.`
    );
  }
}

function headerFormatOf(component: MetaTemplateSourceComponent): string {
  return String(component.format || "TEXT").toUpperCase();
}

/**
 * Monta o payload Cloud API e o snapshot de exibição do template.
 * A mídia de exemplo (header_handle) sincronizada da Meta não é reenviada.
 */
export const buildMetaTemplateSend = (
  template: MetaTemplateSource,
  variables: MetaTemplateVariablesInput = {}
): MetaTemplateSend => {
  const name = String(template?.shortcode || "").trim();
  if (!name) {
    throw new Error("Template Meta sem nome (shortcode).");
  }

  const language = normalizeTemplateLanguage(template?.language);
  const vars = variables || {};
  const components = Array.isArray(template?.components) ? template.components : [];
  const built: IMetaMessageTemplateComponents[] = [];

  const view: MetaTemplateView = {
    name,
    language,
    header: null,
    body: "",
    footer: null,
    buttons: [],
    previewText: ""
  };

  for (const component of components) {
    const rawType = String(component?.type || "").toUpperCase();

    if (rawType === "HEADER") {
      const format = headerFormatOf(component);
      const headerBucket = bucketOf(vars, "header");

      if (format === "LOCATION") {
        throw new Error(
          "Template com cabeçalho de localização não é suportado neste envio."
        );
      }

      if (MEDIA_FORMATS.has(format)) {
        const entry =
          readEntry(headerBucket, "1") ||
          Object.values(headerBucket).find(item => String(item?.value || "").trim());
        const value = requireText(
          String(entry?.value || ""),
          `mídia do HEADER (${format})`
        );
        const filename = String(entry?.filename || "").trim();
        built.push({
          type: "header",
          parameters: [mediaParameter(format, value, filename)]
        });
        const classified = classifyTemplateMediaValue(value);
        view.header = {
          format: format as "IMAGE" | "VIDEO" | "DOCUMENT",
          media: {
            kind: format.toLowerCase() as "image" | "video" | "document",
            ...(classified.mode === "link"
              ? { url: classified.value }
              : { id: classified.value }),
            ...(filename ? { filename } : {}),
            ...(entry?.localFile ? { localFile: String(entry.localFile) } : {}),
            ...(format === "DOCUMENT" && !filename && classified.mode === "link"
              ? { filename: filenameFromUrl(classified.value) }
              : {})
          }
        };
        continue;
      }

      const keys = placeholdersIn(String(component.text || ""));
      const parameters = keys.map(key =>
        textParameter(
          key,
          requireText(
            String(readEntry(headerBucket, key)?.value ?? ""),
            `HEADER {{${key}}}`
          )
        )
      );
      if (parameters.length > 0) {
        built.push({ type: "header", parameters });
      }
      const resolved = applyPlaceholders(String(component.text || ""), headerBucket);
      if (resolved.trim()) {
        view.header = { format: "TEXT", text: resolved };
      }
      continue;
    }

    if (rawType === "BODY") {
      const bodyBucket = bucketOf(vars, "body");
      const source = String(component.text || "");
      const keys = placeholdersIn(source);
      const numeric = keys.every(key => /^\d+$/.test(key));
      const ordered = numeric
        ? [...keys].sort((a, b) => Number(a) - Number(b))
        : keys;
      const parameters = ordered.map(key =>
        textParameter(
          key,
          requireText(
            String(readEntry(bodyBucket, key)?.value ?? ""),
            `BODY {{${key}}}`
          )
        )
      );
      if (parameters.length > 0) {
        built.push({ type: "body", parameters });
      }
      view.body = applyPlaceholders(source, bodyBucket);
      continue;
    }

    if (rawType === "FOOTER") {
      const footer = String(component.text || "").trim();
      view.footer = footer || null;
      continue;
    }

    if (rawType === "BUTTONS" || rawType === "BUTTON") {
      const buttons = parseTemplateButtons(component.buttons);
      const buttonBucket = bucketOf(vars, "button", "buttons");

      buttons.forEach((button: any, btnIndex: number) => {
        const btnType = String(button?.type || "").toUpperCase();
        const label = String(button?.text || button?.title || "").trim();
        const buttonView: MetaTemplateButtonView = {
          type: btnType || "QUICK_REPLY",
          text: label || `Botão ${btnIndex + 1}`,
          index: btnIndex
        };

        if (btnType === "QUICK_REPLY") {
          view.buttons.push(buttonView);
          return;
        }

        if (btnType === "PHONE_NUMBER" || btnType === "VOICE_CALL") {
          buttonView.phone = String(
            button?.phone_number || button?.phone || ""
          ).trim();
          view.buttons.push(buttonView);
          return;
        }

        const match = Object.values(buttonBucket).find(
          entry =>
            Number(entry?.buttonIndex) === btnIndex ||
            Number(entry?.buttonIndex) === Number(button?.index)
        );
        const provided = String(match?.value ?? "").trim();

        if (btnType === "URL") {
          const urlTemplate = String(button?.url || "");
          const dynamic = placeholdersIn(urlTemplate).length > 0;
          if (dynamic) {
            const suffix = requireText(
              provided,
              `sufixo da URL do botão ${btnIndex + 1}`
            );
            built.push({
              type: "button",
              sub_type: "url",
              index: String(btnIndex),
              parameters: [{ type: "text", text: suffix }]
            });
            buttonView.url = urlTemplate.replace(/\{\{\s*[^{}]+?\s*\}\}/g, suffix);
          } else {
            buttonView.url = urlTemplate;
          }
          view.buttons.push(buttonView);
          return;
        }

        if (btnType === "COPY_CODE") {
          const code = requireText(provided, `código do botão ${btnIndex + 1}`);
          built.push({
            type: "button",
            sub_type: "copy_code",
            index: String(btnIndex),
            parameters: [{ type: "coupon_code", coupon_code: code }]
          });
          buttonView.copyCode = code;
          view.buttons.push(buttonView);
          return;
        }

        if (btnType === "FLOW" || btnType === "CATALOG" || btnType === "MPM") {
          throw new Error(
            `O botão ${btnType} deste template não é suportado no envio do CRM.`
          );
        }

        view.buttons.push(buttonView);
      });
    }
  }

  const order: Record<string, number> = { header: 0, body: 1, button: 2 };
  built.sort((a, b) => {
    const byType = (order[a.type] ?? 9) - (order[b.type] ?? 9);
    if (byType !== 0) return byType;
    return Number(a.index || 0) - Number(b.index || 0);
  });

  const previewParts = [
    view.header?.format === "TEXT" ? view.header.text : "",
    view.body,
    view.footer || ""
  ]
    .map(part => String(part || "").trim())
    .filter(Boolean);

  view.previewText = previewParts.join("\n") || `Template: ${name}`;

  const payload: IMetaMessageTemplate = {
    name,
    language: { code: language }
  };
  if (built.length > 0) {
    payload.components = built;
  }

  return { payload, view };
};

export const buildMetaTemplatePayload = (
  template: MetaTemplateSource,
  variables: MetaTemplateVariablesInput = {}
): IMetaMessageTemplate => buildMetaTemplateSend(template, variables).payload;
