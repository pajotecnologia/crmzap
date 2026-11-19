/**
 * Detecta perguntas inbound sobre produtos/inventário e extrai o termo de busca.
 * Usado para pausar o roteiro e consultar o inventário real.
 */

import { looksLikePricingOrOffTopicVersusDateQuestion } from "./agentAttendanceFlowMemory";

export type InventoryInboundKind =
  | "price"
  | "stock"
  | "catalog"
  | "buy_link"
  | "purchase_intent";

export function userMessageLooksLikeInventoryQuery(body: string): boolean {
  const raw = String(body || "").trim();
  if (!raw || raw.length < 3) return false;
  if (looksLikePricingOrOffTopicVersusDateQuestion(raw)) return true;
  const t = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (/\bpreco\b|\bvalor\b|\bcusta\b|\borcamento\b/.test(t)) return true;
  if (
    /\b(quero\s+saber|gostaria\s+de\s+saber|me\s+(fala|passa|diz|informa)|pode\s+me\s+dizer).{0,60}\b(preco|valor|custa|produto|estoque)\b/.test(
      t
    )
  ) {
    return true;
  }
  if (
    /\b(tem\s+(disponivel|estoque|unidade|o\s+produto)|ainda\s+tem|quantas?\s+unidade|esta\s+disponivel)\b/.test(
      t
    )
  ) {
    return true;
  }
  if (/\b(catalogo|produtos?\s+voces|o\s+que\s+(voces|vc)\s+vendem|quais\s+(opcoes|produtos))\b/.test(t)) {
    return true;
  }
  if (/\b(link\s+(de\s+)?compra|onde\s+compro|como\s+compro|manda\s+o\s+link)\b/.test(t)) {
    return true;
  }
  if (/\b(quero\s+comprar|vou\s+levar|quero\s+esse|quero\s+adquirir)\b/.test(t)) {
    return true;
  }
  return false;
}

export function classifyInventoryInboundKind(body: string): InventoryInboundKind {
  const t = String(body || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (/\b(quero\s+comprar|vou\s+levar|quero\s+esse|quero\s+adquirir|pode\s+fechar)\b/.test(t)) {
    return "purchase_intent";
  }
  if (/\b(link\s+(de\s+)?compra|onde\s+compro|como\s+compro|manda\s+o\s+link)\b/.test(t)) {
    return "buy_link";
  }
  if (
    /\b(tem\s+(disponivel|estoque|unidade)|ainda\s+tem|quantas?\s+unidade|esta\s+disponivel|tem\s+no\s+estoque)\b/.test(
      t
    )
  ) {
    return "stock";
  }
  if (/\b(catalogo|quais\s+produtos|o\s+que\s+(voces|vc)\s+vendem|quais\s+opcoes|me\s+mostra)\b/.test(t)) {
    return "catalog";
  }
  return "price";
}

export function extractProductSearchTermFromUserText(body: string): string {
  const raw = String(body || "").trim();
  if (!raw) return "";

  const patterns: RegExp[] = [
    /(?:quero\s+saber|gostaria\s+de\s+saber|saber)\s+(?:o\s+)?(?:pre[cç]o|valor)\s+(?:do|da|de|sobre\s+o|sobre\s+a)\s+(.+?)(?:\?|$)/i,
    /(?:qual(?:\s+[ée])?|me\s+(?:passa|fala|diz)|passa|fala)\s+(?:o\s+)?(?:pre[cç]o|valor)\s+(?:do|da|de)\s+(.+?)(?:\?|$)/i,
    /(?:pre[cç]o|valor|custa|or[cç]amento|estoque|disponibilidade|link)\s+(?:do|da|de|sobre\s+o|sobre\s+a|pro|pra)\s+(.+?)(?:\?|$)/i,
    /(?:quanto\s+custa(?:\s+o|\s+a)?)\s+(.+?)(?:\?|$)/i,
    /(?:tem(?:\s+o|\s+a)?|ainda\s+tem(?:\s+o|\s+a)?)\s+(.+?)(?:\s+dispon[ií]vel|\s+em\s+estoque|\?|$)/i,
    /(?:produto|item)\s+["']?([^"'?.!,]{2,80})["']?/i,
    /["']([^"']{2,80})["']/
  ];

  for (const re of patterns) {
    const m = raw.match(re);
    if (m?.[1]) {
      const term = sanitizeExtractedTerm(m[1]);
      if (term.length >= 2) return term;
    }
  }

  const cleaned = raw
    .replace(
      /\b(quero\s+saber|gostaria\s+de\s+saber|me\s+(?:fala|passa|diz|informa)|pode\s+me\s+dizer|qual(?:\s+[ée])?|quanto\s+custa|o\s+pre[cç]o|o\s+valor|tem\s+dispon[ií]vel|ainda\s+tem|por\s+favor|pfv|pf)\b/gi,
      " "
    )
    .replace(/\b(do|da|de|o|a|um|uma|produto|pre[cç]o|valor)\b/gi, " ")
    .replace(/[?!.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length >= 2 ? sanitizeExtractedTerm(cleaned) : "";
}

function sanitizeExtractedTerm(value: string): string {
  return String(value || "")
    .trim()
    .replace(/^[?\s.,;:!\-–—]+|[?\s.,;:!\-–—]+$/g, "")
    .replace(/\s+(por\s+favor|pfv|pf|please)$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/** Variantes de busca: frase completa + tokens significativos (ex.: "VBSolution CRM" → "VBSolution", "CRM"). */
export function expandProductSearchTerms(term: string): string[] {
  const base = sanitizeExtractedTerm(term);
  if (!base) return [];
  const out: string[] = [base];
  const compact = base.replace(/\s+/g, "");
  if (compact.length >= 3 && compact !== base) out.push(compact);
  const tokens = base
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !/^(do|da|de|o|a|um|uma|the|and|or)$/i.test(t));
  for (const t of tokens) {
    if (!out.some(x => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out.slice(0, 8);
}

export function preferredInventoryActionSlug(kind: InventoryInboundKind): string {
  switch (kind) {
    case "stock":
      return "consultarestoque";
    case "catalog":
      return "consultarprodutos";
    case "buy_link":
      return "enviarlinkproduto";
    case "purchase_intent":
      return "registrarintencaocompra";
    case "price":
    default:
      return "passarpreco";
  }
}

export function inventoryActionFallbackSlugs(kind: InventoryInboundKind): string[] {
  const primary = preferredInventoryActionSlug(kind);
  const all = [
    primary,
    "passarpreco",
    "consultarprodutos",
    "consultarestoque",
    "enviarlinkproduto",
    "registrarintencaocompra"
  ];
  return Array.from(new Set(all));
}

export function buildInventoryNotFoundReply(productName?: string): string {
  if (productName) {
    return `Não encontrei *${productName}* no inventário agora. Pode confirmar o nome do produto (ou o SKU)? Assim te passo o preço e a disponibilidade certinhos.`;
  }
  return `Posso te passar preço e disponibilidade. Qual produto você quer consultar?`;
}

export function appendRoteiroResumeHint(reply: string): string {
  const base = String(reply || "").trim();
  if (!base) return base;
  if (/seguimos de onde|quando quiser.? seguimos|voltando ao/i.test(base)) return base;
  return `${base}\n\nQuando quiser, seguimos de onde paramos.`;
}
