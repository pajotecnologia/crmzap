import type { InventoryPublicView } from "../services/InventoryServices/inventoryAgentHelpers";
import { formatMoneyBRL } from "../services/InventoryServices/inventoryAgentHelpers";
import type Prompt from "../models/Prompt";

export type InventoryReplyTone = "formal" | "consultivo" | "amigavel" | "direto";

export type InventoryReplyStrategy =
  | "price_first"
  | "benefit_then_price"
  | "scarcity"
  | "link_cta"
  | "catalog_brief"
  | "custom";

export type InventoryImageMode = "none" | "cover" | "gallery" | "first_n";

export type AgentInventoryReplyConfig = {
  tone?: InventoryReplyTone;
  strategyPreset?: InventoryReplyStrategy;
  template?: string;
  includePrice?: boolean;
  includeStock?: boolean;
  includeLink?: boolean;
  includeDescription?: boolean;
  includeSku?: boolean;
  /** Exibe texto de promoção (ex.: 30% off). */
  includePromo?: boolean;
  promoText?: string;
  /** Exibe condição de parcelamento. */
  includeInstallment?: boolean;
  installmentText?: string;
  sendImages?: boolean;
  imageMode?: InventoryImageMode;
  imageCount?: number;
  sendDocument?: boolean;
  documentUrl?: string;
  documentName?: string;
  resumeHint?: boolean;
  resumeHintText?: string;
};

export type AgentInventoryConfigFull = {
  enabled?: boolean;
  productIds?: number[];
  reply?: AgentInventoryReplyConfig;
  /** Overrides por produto (chave = id do inventário). Ganha de replySettings do produto. */
  productReplies?: Record<string, AgentInventoryReplyConfig>;
};

export const INVENTORY_STRATEGY_PRESETS: Array<{
  id: InventoryReplyStrategy;
  label: string;
  description: string;
  template: string;
}> = [
  {
    id: "price_first",
    label: "Preço primeiro",
    description: "Direto ao valor e disponibilidade",
    template:
      "O *{{nome}}* custa {{preco}}{{estoque_frase}}.{{link_frase}}"
  },
  {
    id: "benefit_then_price",
    label: "Benefício → preço",
    description: "Apresenta o produto e depois o investimento",
    template:
      "{{descricao_ou_nome}}\n\nInvestimento: {{preco}}{{estoque_frase}}.{{link_frase}}"
  },
  {
    id: "scarcity",
    label: "Escassez suave",
    description: "Destaca estoque limitado com naturalidade",
    template:
      "Sobre o *{{nome}}*: está {{estoque_status}} por {{preco}}.{{link_frase}}"
  },
  {
    id: "link_cta",
    label: "CTA com link",
    description: "Convida à compra com link destacado",
    template:
      "*{{nome}}* — {{preco}}{{estoque_frase}}.\n\nSe quiser, pode comprar por aqui: {{link}}"
  },
  {
    id: "catalog_brief",
    label: "Catálogo breve",
    description: "Lista enxuta para várias opções",
    template: "{{catalogo}}"
  },
  {
    id: "custom",
    label: "Personalizado",
    description: "Use seu próprio template",
    template: ""
  }
];

const TONE_PREFIX: Record<InventoryReplyTone, string> = {
  formal: "",
  consultivo: "",
  amigavel: "",
  direto: ""
};

function applyTone(text: string, tone: InventoryReplyTone): string {
  const t = String(text || "").trim();
  if (!t) return t;
  if (tone === "formal") {
    return t
      .replace(/\bvc\b/gi, "você")
      .replace(/\btb\b/gi, "também")
      .replace(/!{2,}/g, ".");
  }
  if (tone === "amigavel") {
    if (!/[😊✨🙂]/.test(t) && t.length < 280) {
      return t.endsWith("?") || t.endsWith(".") ? t : `${t}`;
    }
  }
  if (tone === "direto") {
    return t
      .split(/\n{3,}/)
      .join("\n\n")
      .replace(/\n{2,}/g, "\n\n");
  }
  return t;
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  let out = String(template || "");
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "gi"), value ?? "");
  }
  return out
    .replace(/\{\{[a-z0-9_]+\}\}/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeInventoryReplyConfig(
  raw?: AgentInventoryReplyConfig | null
): Required<
  Pick<
    AgentInventoryReplyConfig,
    | "tone"
    | "strategyPreset"
    | "template"
    | "includePrice"
    | "includeStock"
    | "includeLink"
    | "includeDescription"
    | "includeSku"
    | "includePromo"
    | "promoText"
    | "includeInstallment"
    | "installmentText"
    | "sendImages"
    | "imageMode"
    | "imageCount"
    | "sendDocument"
    | "documentUrl"
    | "documentName"
    | "resumeHint"
    | "resumeHintText"
  >
> {
  const r = raw && typeof raw === "object" ? raw : {};
  const strategy =
    (INVENTORY_STRATEGY_PRESETS.find(p => p.id === r.strategyPreset)?.id as InventoryReplyStrategy) ||
    "price_first";
  const preset = INVENTORY_STRATEGY_PRESETS.find(p => p.id === strategy);
  const tone = (["formal", "consultivo", "amigavel", "direto"].includes(String(r.tone))
    ? r.tone
    : "consultivo") as InventoryReplyTone;
  const imageModeRaw = String(r.imageMode || "");
  const imageMode = (["none", "cover", "gallery", "first_n"].includes(imageModeRaw)
    ? imageModeRaw
    : r.sendImages
      ? "cover"
      : "none") as InventoryImageMode;
  const sendImages = r.sendImages === true && imageMode !== "none";
  return {
    tone,
    strategyPreset: strategy,
    template: String(r.template != null ? r.template : preset?.template || "").trim(),
    includePrice: r.includePrice !== false,
    includeStock: r.includeStock !== false,
    includeLink: r.includeLink !== false,
    includeDescription: r.includeDescription === true,
    includeSku: r.includeSku === true,
    includePromo: r.includePromo === true,
    promoText: String(r.promoText || "").trim(),
    includeInstallment: r.includeInstallment === true,
    installmentText: String(r.installmentText || "").trim(),
    sendImages,
    imageMode: sendImages ? imageMode : "none",
    imageCount: Math.min(6, Math.max(1, Number(r.imageCount) || 3)),
    sendDocument: r.sendDocument === true,
    documentUrl: String(r.documentUrl || "").trim(),
    documentName: String(r.documentName || "documento").trim() || "documento",
    resumeHint: r.resumeHint !== false,
    resumeHintText: String(r.resumeHintText || "Quando quiser, seguimos de onde paramos.").trim()
  };
}

/** Extrai config ativa de replySettings (respeita savedTemplates + activeTemplateId). */
export function pickActiveReplySettings(raw: unknown): AgentInventoryReplyConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const templates = Array.isArray(r.savedTemplates) ? r.savedTemplates : [];
  const activeId = r.activeTemplateId != null ? String(r.activeTemplateId) : "";
  if (activeId && templates.length) {
    const found = templates.find(
      (t: any) => t && typeof t === "object" && String(t.id) === activeId
    );
    if (found) return found as AgentInventoryReplyConfig;
  }
  return r as AgentInventoryReplyConfig;
}

/** Produto > override do agente > padrão do agente > defaults. */
export function mergeInventoryReplyConfigs(
  ...layers: Array<AgentInventoryReplyConfig | null | undefined>
): ReturnType<typeof normalizeInventoryReplyConfig> {
  const merged: AgentInventoryReplyConfig = {};
  for (const layer of layers) {
    if (!layer || typeof layer !== "object") continue;
    for (const [k, v] of Object.entries(layer)) {
      if (v === undefined || v === null || v === "") continue;
      (merged as any)[k] = v;
    }
  }
  return normalizeInventoryReplyConfig(merged);
}

export function resolveEffectiveInventoryReplyConfig(params: {
  prompt?: Prompt | null;
  product?: { id?: number; replySettings?: unknown } | null;
}): ReturnType<typeof normalizeInventoryReplyConfig> {
  const agentCfg = getAgentInventoryReplyConfig(params.prompt);
  const cerebro = (() => {
    if (!params.prompt) return {} as any;
    let c: any = (params.prompt as any).cerebro;
    if (typeof c === "string") {
      try {
        c = JSON.parse(c);
      } catch {
        c = {};
      }
    }
    return c || {};
  })();
  const overrides =
    cerebro?.guimoV2Inventory?.productReplies &&
    typeof cerebro.guimoV2Inventory.productReplies === "object"
      ? cerebro.guimoV2Inventory.productReplies
      : {};
  const productId = params.product?.id != null ? String(params.product.id) : "";
  const productSettings = pickActiveReplySettings(params.product?.replySettings);
  const agentProductOverride = pickActiveReplySettings(
    productId && overrides[productId]
      ? overrides[productId]
      : productId && overrides[Number(productId)]
        ? overrides[Number(productId)]
        : null
  );

  // Camadas: agent default → product DB → agent per-product override (mais específico).
  return mergeInventoryReplyConfigs(agentCfg, productSettings, agentProductOverride);
}

export function getAgentInventoryReplyConfig(prompt?: Prompt | null): ReturnType<
  typeof normalizeInventoryReplyConfig
> {
  if (!prompt) return normalizeInventoryReplyConfig(null);
  let cerebro: any = (prompt as any).cerebro;
  if (typeof cerebro === "string") {
    try {
      cerebro = JSON.parse(cerebro);
    } catch {
      cerebro = {};
    }
  }
  const inv = cerebro?.guimoV2Inventory;
  return normalizeInventoryReplyConfig(pickActiveReplySettings(inv?.reply) || inv?.reply || null);
}

export function formatInventoryProductReply(
  product: InventoryPublicView,
  replyCfg?: AgentInventoryReplyConfig | null
): string {
  const cfg = normalizeInventoryReplyConfig(replyCfg);
  const price = formatMoneyBRL(product.price, product.currency);
  const estoqueStatus = product.available ? product.availabilityLabel : "esgotado";
  const estoqueFrase = cfg.includeStock
    ? product.available
      ? ` e temos ${product.availabilityLabel}`
      : " e está esgotado no momento"
    : "";
  const promoFrase =
    cfg.includePromo && cfg.promoText ? ` (${cfg.promoText})` : "";
  const parcelamentoFrase =
    cfg.includeInstallment && cfg.installmentText ? ` — ${cfg.installmentText}` : "";
  const link = product.buyLink || "";
  const linkFrase =
    cfg.includeLink && link && product.available
      ? `\n\nSe quiser, você pode realizar a compra por aqui: ${link}`
      : "";

  const vars: Record<string, string> = {
    nome: product.name || "",
    preco: cfg.includePrice ? price : "",
    estoque: String(product.quantity ?? 0),
    estoque_status: estoqueStatus,
    estoque_frase: estoqueFrase,
    promo_frase: promoFrase,
    parcelamento_frase: parcelamentoFrase,
    link,
    link_frase: linkFrase,
    descricao: product.description || "",
    descricao_ou_nome: product.description?.trim()
      ? `${product.description.trim()}\n\n*${product.name}*`
      : `*${product.name}*`,
    sku: product.sku || "",
    catalogo: ""
  };

  let template = cfg.template;
  if (!template || cfg.strategyPreset !== "custom") {
    const preset = INVENTORY_STRATEGY_PRESETS.find(p => p.id === cfg.strategyPreset);
    if (preset?.template) template = preset.template;
  }
  if (!template) {
    template = INVENTORY_STRATEGY_PRESETS[0].template;
  }

  // Se flags desligam campos, limpa placeholders relacionados no template custom
  if (!cfg.includePrice) template = template.replace(/\{\{\s*preco\s*\}\}/gi, "");
  if (!cfg.includeStock) {
    template = template
      .replace(/\{\{\s*estoque_frase\s*\}\}/gi, "")
      .replace(/\{\{\s*estoque_status\s*\}\}/gi, "")
      .replace(/\{\{\s*estoque\s*\}\}/gi, "");
  }
  if (!cfg.includeLink) {
    template = template.replace(/\{\{\s*link_frase\s*\}\}/gi, "").replace(/\{\{\s*link\s*\}\}/gi, "");
  }
  if (!cfg.includeDescription) {
    template = template.replace(/\{\{\s*descricao\s*\}\}/gi, "");
  }
  if (!cfg.includeSku) {
    template = template.replace(/\{\{\s*sku\s*\}\}/gi, "");
  }
  if (!cfg.includePromo) {
    template = template.replace(/\{\{\s*promo_frase\s*\}\}/gi, "");
  }
  if (!cfg.includeInstallment) {
    template = template.replace(/\{\{\s*parcelamento_frase\s*\}\}/gi, "");
  }

  let body = fillTemplate(template, vars);
  body = applyTone(body, cfg.tone);
  void TONE_PREFIX;

  if (cfg.resumeHint) {
    const hint = cfg.resumeHintText || "Quando quiser, seguimos de onde paramos.";
    if (!body.includes(hint)) {
      body = `${body}\n\n${hint}`;
    }
  }
  return body.trim();
}

export function formatInventoryCatalogReply(
  products: InventoryPublicView[],
  replyCfg?: AgentInventoryReplyConfig | null
): string {
  const cfg = normalizeInventoryReplyConfig(replyCfg);
  if (!products.length) {
    return "Não encontrei produtos disponíveis no inventário vinculado a este atendimento.";
  }
  const lines = products.slice(0, 12).map((p, i) => {
    const price = cfg.includePrice ? formatMoneyBRL(p.price, p.currency) : "";
    const stock = cfg.includeStock ? (p.available ? p.availabilityLabel : "esgotado") : "";
    const sku = cfg.includeSku && p.sku ? ` (SKU ${p.sku})` : "";
    return `${i + 1}. *${p.name}*${sku}${price ? ` — ${price}` : ""}${stock ? ` — ${stock}` : ""}`;
  });
  let body = `Encontrei estas opções no inventário:\n\n${lines.join("\n")}`;
  body = applyTone(body, cfg.tone);
  if (cfg.resumeHint) {
    body = `${body}\n\n${cfg.resumeHintText || "Quando quiser, seguimos de onde paramos."}`;
  }
  return body.trim();
}

export function resolveInventoryMediaUrls(
  product: InventoryPublicView | null,
  replyCfg?: AgentInventoryReplyConfig | null
): { images: string[]; documentUrl: string; documentName: string } {
  const cfg = normalizeInventoryReplyConfig(replyCfg);
  const images: string[] = [];
  if (product && cfg.sendImages && cfg.imageMode !== "none") {
    const gallery = Array.isArray((product as any).images)
      ? ((product as any).images as string[]).filter(Boolean)
      : [];
    const cover = product.image || gallery[0] || "";
    const pool = gallery.length ? gallery : cover ? [cover] : [];
    if (cfg.imageMode === "cover" && cover) images.push(cover);
    else if (cfg.imageMode === "gallery") images.push(...pool.slice(0, 6));
    else if (cfg.imageMode === "first_n") images.push(...pool.slice(0, cfg.imageCount));
  }
  return {
    images: images.filter(Boolean),
    documentUrl: cfg.sendDocument ? cfg.documentUrl : "",
    documentName: cfg.documentName || "documento"
  };
}
