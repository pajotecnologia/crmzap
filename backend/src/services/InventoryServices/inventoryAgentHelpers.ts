import { Op } from "sequelize";
import Inventory from "../../models/Inventory";
import Prompt from "../../models/Prompt";
import {
  expandProductSearchTerms,
  extractProductSearchTermFromUserText
} from "../../helpers/inventoryInboundIntent";

export type AgentInventoryConfig = {
  enabled?: boolean;
  /** IDs vinculados ao agente. Vazio + enabled = todos os produtos da empresa. */
  productIds?: number[];
  reply?: Record<string, unknown>;
};

export type InventoryPublicView = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  quantity: number;
  sku: string | null;
  category: string | null;
  brand: string | null;
  buyLink: string | null;
  image: string | null;
  images?: string[] | null;
  replySettings?: Record<string, unknown> | null;
  status: string;
  available: boolean;
  availabilityLabel: string;
};

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function getAgentInventoryConfig(prompt?: Prompt | null): AgentInventoryConfig {
  if (!prompt) return { enabled: false, productIds: [] };
  const cerebro = parseJsonObject((prompt as any).cerebro);
  const fromCerebro = cerebro.guimoV2Inventory;
  if (fromCerebro && typeof fromCerebro === "object" && !Array.isArray(fromCerebro)) {
    const cfg = fromCerebro as AgentInventoryConfig;
    return {
      enabled: cfg.enabled !== false,
      productIds: Array.isArray(cfg.productIds)
        ? cfg.productIds.map(n => Number(n)).filter(n => Number.isFinite(n) && n > 0)
        : [],
      reply: cfg.reply && typeof cfg.reply === "object" ? cfg.reply : undefined
    };
  }
  // Sem config explícita: inventário da empresa fica disponível às ações (comportamento legado).
  return { enabled: true, productIds: [] };
}

export function computeInventoryStatus(quantity: number, preferred?: string | null): string {
  const qty = Number(quantity) || 0;
  if (preferred && String(preferred).trim()) {
    const p = String(preferred).trim().toLowerCase();
    if (qty <= 0 && (p === "in_stock" || p === "low_stock")) return "out_of_stock";
    return p;
  }
  if (qty <= 0) return "out_of_stock";
  if (qty <= 5) return "low_stock";
  return "in_stock";
}

export function formatMoneyBRL(price: number, currency = "BRL"): string {
  const value = Number(price) || 0;
  const cur = String(currency || "BRL").toUpperCase();
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: cur === "BRL" || cur === "R$" ? "BRL" : cur
    }).format(value);
  } catch {
    return `R$ ${value.toFixed(2).replace(".", ",")}`;
  }
}

export function toInventoryPublicView(row: Inventory): InventoryPublicView {
  const quantity = Number((row as any).quantity) || 0;
  const status = computeInventoryStatus(quantity, (row as any).status);
  const available = quantity > 0 && status !== "out_of_stock";
  return {
    id: Number(row.id),
    name: String(row.name || ""),
    description: row.description != null ? String(row.description) : null,
    price: Number(row.price) || 0,
    currency: String((row as any).currency || "BRL"),
    quantity,
    sku: (row as any).sku != null ? String((row as any).sku) : null,
    category: (row as any).category != null ? String((row as any).category) : null,
    brand: (row as any).brand != null ? String((row as any).brand) : null,
    buyLink: (row as any).buyLink != null ? String((row as any).buyLink).trim() || null : null,
    image: (row as any).image != null ? String((row as any).image) : null,
    images: Array.isArray((row as any).images)
      ? ((row as any).images as unknown[]).map(x => String(x || "")).filter(Boolean)
      : (row as any).image
        ? [String((row as any).image)]
        : [],
    replySettings:
      (row as any).replySettings && typeof (row as any).replySettings === "object"
        ? ((row as any).replySettings as Record<string, unknown>)
        : null,
    status,
    available,
    availabilityLabel: available
      ? quantity === 1
        ? "1 unidade disponível"
        : `${quantity} unidades disponíveis`
      : "esgotado"
  };
}

export function formatProductCustomerLine(product: InventoryPublicView, opts?: { includeLink?: boolean }): string {
  const price = formatMoneyBRL(product.price, product.currency);
  let line = `*${product.name}* custa ${price}`;
  if (product.available) {
    line += ` e temos ${product.availabilityLabel}.`;
  } else {
    line += ` e está esgotado no momento.`;
  }
  if (opts?.includeLink !== false && product.buyLink && product.available) {
    line += `\n\nSe quiser, você pode realizar a compra por aqui: ${product.buyLink}`;
  }
  return line;
}

export function formatProductCatalogMessage(products: InventoryPublicView[]): string {
  if (!products.length) {
    return "Não encontrei produtos disponíveis no inventário vinculado a este atendimento.";
  }
  const lines = products.slice(0, 12).map((p, i) => {
    const price = formatMoneyBRL(p.price, p.currency);
    const stock = p.available ? p.availabilityLabel : "esgotado";
    const sku = p.sku ? ` (SKU ${p.sku})` : "";
    return `${i + 1}. *${p.name}*${sku} — ${price} — ${stock}`;
  });
  return `Encontrei estas opções no inventário:\n\n${lines.join("\n")}`;
}

function resolveSearchTerms(variables?: Record<string, unknown>): string[] {
  if (!variables) return [];
  const keys = [
    "searchParam",
    "productName",
    "nome",
    "name",
    "produto",
    "query",
    "sku",
    "codigo"
  ];
  const terms: string[] = [];
  for (const key of keys) {
    const raw = variables[key];
    if (raw == null) continue;
    const s = String(raw).trim();
    if (s) terms.push(s);
  }

  // Extrai termo de preço/produto a partir da mensagem do cliente quando a LLM não preencheu productName.
  if (!terms.length) {
    for (const key of ["lastUserMessage", "customerReply", "lastUserAnswer", "userText"]) {
      const raw = variables[key];
      if (raw == null) continue;
      const extracted = extractProductSearchTermFromUserText(String(raw));
      if (extracted) {
        terms.push(extracted);
        break;
      }
      const asIs = String(raw).trim();
      if (asIs.length >= 2 && asIs.length <= 120) terms.push(asIs);
    }
  }
  return terms;
}

export async function findInventoryProductsForAgent(params: {
  companyId: number;
  prompt?: Prompt | null;
  variables?: Record<string, unknown>;
  limit?: number;
  onlyAvailable?: boolean;
}): Promise<Inventory[]> {
  const cfg = getAgentInventoryConfig(params.prompt);
  const where: Record<string, unknown> = { companyId: params.companyId };

  if (cfg.enabled === false) {
    return [];
  }

  if (Array.isArray(cfg.productIds) && cfg.productIds.length > 0) {
    where.id = { [Op.in]: cfg.productIds };
  }

  const productId =
    params.variables?.productId != null
      ? Number(params.variables.productId)
      : params.variables?.inventoryId != null
        ? Number(params.variables.inventoryId)
        : NaN;

  if (Number.isFinite(productId) && productId > 0) {
    where.id = productId;
  }

  const terms = resolveSearchTerms(params.variables);
  if (terms.length && !(Number.isFinite(productId) && productId > 0)) {
    const expanded = expandProductSearchTerms(terms[0]);
    const orClauses: Record<string, unknown>[] = [];
    for (const term of expanded) {
      orClauses.push(
        { name: { [Op.iLike]: `%${term}%` } },
        { sku: { [Op.iLike]: `%${term}%` } },
        { description: { [Op.iLike]: `%${term}%` } },
        { brand: { [Op.iLike]: `%${term}%` } },
        { category: { [Op.iLike]: `%${term}%` } }
      );
    }
    where[Op.or as any] = orClauses;
  }

  if (params.onlyAvailable) {
    where.quantity = { [Op.gt]: 0 };
    where.status = { [Op.ne]: "out_of_stock" };
  }

  let rows = await Inventory.findAll({
    where: where as any,
    limit: params.limit ?? 20,
    order: [["name", "ASC"]]
  });

  // Vínculo do agente vazio → tenta inventário completo da empresa (não silenciar preço).
  if (
    !rows.length &&
    Array.isArray(cfg.productIds) &&
    cfg.productIds.length > 0 &&
    terms.length &&
    !(Number.isFinite(productId) && productId > 0)
  ) {
    const expanded = expandProductSearchTerms(terms[0]);
    const orClauses: Record<string, unknown>[] = [];
    for (const term of expanded) {
      orClauses.push(
        { name: { [Op.iLike]: `%${term}%` } },
        { sku: { [Op.iLike]: `%${term}%` } },
        { description: { [Op.iLike]: `%${term}%` } },
        { brand: { [Op.iLike]: `%${term}%` } },
        { category: { [Op.iLike]: `%${term}%` } }
      );
    }
    rows = await Inventory.findAll({
      where: {
        companyId: params.companyId,
        [Op.or]: orClauses
      } as any,
      limit: params.limit ?? 20,
      order: [["name", "ASC"]]
    });
  }

  return rows;
}

export async function findOneInventoryProductForAgent(params: {
  companyId: number;
  prompt?: Prompt | null;
  variables?: Record<string, unknown>;
}): Promise<Inventory | null> {
  const rows = await findInventoryProductsForAgent({ ...params, limit: 12 });
  if (!rows.length) return null;
  const exactName = String(
    params.variables?.productName || params.variables?.name || params.variables?.searchParam || ""
  )
    .trim()
    .toLowerCase();
  if (exactName) {
    const exact = rows.find(r => String(r.name || "").trim().toLowerCase() === exactName);
    if (exact) return exact;
    const partial = rows.find(r => {
      const n = String(r.name || "")
        .trim()
        .toLowerCase();
      return n.includes(exactName) || exactName.includes(n);
    });
    if (partial) return partial;
    const tokens = exactName.split(/\s+/).filter(t => t.length >= 3);
    if (tokens.length) {
      const scored = rows
        .map(r => {
          const n = String(r.name || "")
            .trim()
            .toLowerCase();
          const hits = tokens.filter(t => n.includes(t)).length;
          return { r, hits };
        })
        .filter(x => x.hits > 0)
        .sort((a, b) => b.hits - a.hits);
      if (scored[0]) return scored[0].r;
    }
  }
  return rows[0];
}
