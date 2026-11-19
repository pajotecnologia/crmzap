import { AGENT_OUTBOUND_BUBBLE_MAX_CHARS } from "../config/openAiDefaults";

const WHATSAPP_HARD_MAX = 4000;
const URL_PLACEHOLDER = (i: number) => `\uE000URL${i}\uE001`;
/** Quebra visual na mesma bolha (— / – → \n). */
const SOFT_BREAK = "\uE010";
/** Parágrafo na mesma bolha (hífen ASCII "-" → \n\n interno, sem nova bolha). */
const PARA_BREAK = "\uE011";
/** Travessão tipográfico (em) e en-dash usados no roteiro. */
const EM_DASH_CHARS = "\u2014\u2013";
const SOFT_BREAK_LINE_MARKERS = EM_DASH_CHARS;

/**
 * Protege URLs (http/https/www) antes de qualquer split por pontuação.
 */
export function protectUrlsForSplit(text: string): { text: string; urls: string[] } {
  const urls: string[] = [];
  let out = String(text || "");
  out = out.replace(/https?:\/\/[^\s<>"']+/gi, (m) => {
    const idx = urls.length;
    urls.push(m);
    return URL_PLACEHOLDER(idx);
  });
  out = out.replace(/\bwww\.[^\s<>"']+/gi, (m) => {
    const idx = urls.length;
    urls.push(m);
    return URL_PLACEHOLDER(idx);
  });
  return { text: out, urls };
}

export function restoreUrlsAfterSplit(text: string, urls: string[]): string {
  let out = String(text || "");
  for (let i = 0; i < urls.length; i++) {
    out = out.split(URL_PLACEHOLDER(i)).join(urls[i]);
  }
  return out;
}

/**
 * Linha só com hífen ASCII "-" → parágrafo na MESMA bolha (PARA_BREAK → \n\n depois do split).
 * Linha em branco real (\n\n) continua separando bolhas.
 * Listas "- item" permanecem intactas.
 */
export function applyAsciiDashParagraphBreaks(text: string): string {
  let s = String(text || "").replace(/\r\n/g, "\n");
  s = s.replace(/\n[ \t]*-[ \t]*\n/g, `\n${PARA_BREAK}\n`);
  s = s.replace(/^[ \t]*-[ \t]*$/gm, PARA_BREAK);
  // Não deixar PARA_BREAK virar \n\n antes do split de bolhas
  s = s.replace(new RegExp(`\\n*${PARA_BREAK}\\n*`, "g"), PARA_BREAK);
  return s;
}

/** @deprecated use applyAsciiDashParagraphBreaks */
export function applyAsciiDashBubbleBreaks(text: string): string {
  return applyAsciiDashParagraphBreaks(text);
}

/**
 * Travessão — / – sozinho na linha = mesma bolha + quebra visual (\n).
 */
export function applyScriptEmDashSoftBreaks(text: string): string {
  let s = String(text || "").replace(/\r\n/g, "\n");
  const alone = `[${SOFT_BREAK_LINE_MARKERS}]`;
  const emDash = `[${EM_DASH_CHARS}]`;
  s = s.replace(new RegExp(`\\n[ \\t]*${alone}[ \\t]*\\n`, "g"), `\n${SOFT_BREAK}\n`);
  s = s.replace(new RegExp(`^[ \\t]*${alone}[ \\t]*$`, "gm"), SOFT_BREAK);
  s = s.replace(new RegExp(`\\n[ \\t]*${emDash}[ \\t]*(?=\\S)`, "g"), `\n${SOFT_BREAK}`);
  s = s.replace(new RegExp(emDash, "g"), "");
  s = s.replace(new RegExp(`\\n*${SOFT_BREAK}\\n*`, "g"), SOFT_BREAK);
  return s;
}

/** Espaçamento legível sem destruir URLs nem quebras do roteiro. */
export function formatAgentReplyReadableSpacing(text: string): string {
  const { text: protectedText, urls } = protectUrlsForSplit(text);
  let s = protectedText.trim();
  if (!s) return String(text || "").trim();
  s = s.replace(/([!?])([A-Za-zÀ-ÿ])/g, "$1 $2");
  s = s.replace(/([.])([A-ZÀ-Ü])/g, "$1 $2");
  s = s.replace(/([,;])([^\s\d\uE000])/g, "$1 $2");
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  return restoreUrlsAfterSplit(s.trim(), urls);
}

export function splitLongSentence(sentence: string, maxChars: number): string[] {
  const { text: protectedText, urls } = protectUrlsForSplit(sentence);
  const parts: string[] = [];
  let rest = protectedText.trim();
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars + 1);
    const commaIdx = Math.max(window.lastIndexOf(", "), window.lastIndexOf("; "), window.lastIndexOf(": "));
    const spaceIdx = window.lastIndexOf(" ");
    const cut = commaIdx > maxChars * 0.45 ? commaIdx + 1 : spaceIdx > maxChars * 0.55 ? spaceIdx : maxChars;
    parts.push(restoreUrlsAfterSplit(rest.slice(0, cut).trim(), urls));
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(restoreUrlsAfterSplit(rest, urls));
  return parts;
}

export function splitParagraphIntoSentences(paragraph: string): string[] {
  const { text: protectedText, urls } = protectUrlsForSplit(paragraph);
  const text = protectedText.replace(/[^\S\n]+/g, " ").replace(/[ \t]+/g, " ").trim();
  if (!text) return [];
  const flat = text.replace(/\n+/g, " ").trim();
  const out: string[] = [];
  const re = /[^.!?\n]+[.!?]+(?:["')\]]+)?|[^.!?\n]+$/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(flat))) {
    const sentence = restoreUrlsAfterSplit(match[0].trim(), urls);
    if (sentence) out.push(sentence);
  }
  return out.length ? out : [restoreUrlsAfterSplit(flat, urls)];
}

export type SplitAgentBlocksOpts = {
  maxChars?: number;
  maxBlocks?: number;
  /**
   * Roteiro:
   * - Quebra simples (`\n`) → mesma bolha.
   * - Linha em branco (`\n\n`) → nova bolha.
   * - Linha só com "-" → mesma bolha com parágrafo (\n\n interno).
   * - Linha com — / – → mesma bolha + quebra visual (\n).
   */
  preserveScriptStructure?: boolean;
  /** Inventário / preço: uma única bolha WhatsApp (parágrafos internos ok). */
  forceSingleBubble?: boolean;
  /** Se true, nunca descarta o restante do texto ao atingir maxBlocks. */
  neverDropRemainder?: boolean;
};

/** Texto parece roteiro (hífen sozinho, checklist, #mídia) — não sentence-split. */
export function looksLikeScriptStructuredOutbound(text: string): boolean {
  const s = String(text || "").replace(/\r\n/g, "\n");
  if (!s.trim()) return false;
  if (/(^|\n)[ \t]*-[ \t]*(\n|$)/m.test(s)) return true;
  if (/(^|\n)[ \t]*#[a-zA-Z][a-zA-Z0-9_-]*[ \t]*(\n|$)/m.test(s)) return true;
  if (/[✅☑️✔︎🟢📦]/.test(s) && /\n/.test(s)) return true;
  if (/\*[^*\n]{2,}\*/.test(s) && (s.match(/\n/g) || []).length >= 2) return true;
  return false;
}

/**
 * Divide o texto em bolhas WhatsApp conforme regras do roteiro.
 * Regra universal: "-" sozinho = parágrafo na mesma bolha; só linha em branco real = bolha nova.
 * Inventário: forceSingleBubble → sempre 1 bolha.
 */
export function splitAgentReplyIntoSmartBlocks(
  reply: string,
  opts?: SplitAgentBlocksOpts
): string[] {
  const forceSingle = opts?.forceSingleBubble === true;
  const preserveScript =
    opts?.preserveScriptStructure === true ||
    forceSingle ||
    looksLikeScriptStructuredOutbound(String(reply || ""));
  const neverDrop = opts?.neverDropRemainder === true || preserveScript;
  const maxChars = preserveScript
    ? WHATSAPP_HARD_MAX
    : Math.max(220, Math.min(Number(opts?.maxChars || AGENT_OUTBOUND_BUBBLE_MAX_CHARS), 900));
  const maxBlocks = forceSingle
    ? 1
    : Math.max(1, Math.min(Number(opts?.maxBlocks || 40), neverDrop ? 100 : 30));

  let clean = String(reply || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  if (!clean) return [];

  // Universal: "-" / "—" antes de qualquer split de bolha
  clean = applyAsciiDashParagraphBreaks(clean);
  clean = applyScriptEmDashSoftBreaks(clean);

  const materializeBubble = (segment: string): string => {
    let bubble = segment
      .split(/\n/)
      .map((l) => l.replace(/[ \t]+$/g, "").replace(/^[ \t]+/g, ""))
      .join("\n");
    bubble = bubble
      .split(SOFT_BREAK)
      .map((x) => x.trim())
      .filter(Boolean)
      .join("\n");
    bubble = bubble
      .split(PARA_BREAK)
      .map((x) => x.trim())
      .filter(Boolean)
      .join("\n\n")
      .trim();
    return bubble;
  };

  if (forceSingle) {
    // Colapsa separadores de bolha em parágrafo interno — 1 mensagem só
    const collapsed = clean.replace(/\n{2,}/g, `\n${PARA_BREAK}\n`);
    const one = formatAgentReplyReadableSpacing(materializeBubble(collapsed));
    if (!one) return [];
    if (one.length <= WHATSAPP_HARD_MAX) return [one];
    // Texto > 4096: parte sem descartar
    const parts: string[] = [];
    const { text: protectedText, urls } = protectUrlsForSplit(one);
    let rest = protectedText;
    while (rest.length > WHATSAPP_HARD_MAX) {
      let cut = rest.lastIndexOf("\n", WHATSAPP_HARD_MAX);
      if (cut < WHATSAPP_HARD_MAX * 0.4) cut = rest.lastIndexOf(" ", WHATSAPP_HARD_MAX);
      if (cut < WHATSAPP_HARD_MAX * 0.4) cut = WHATSAPP_HARD_MAX;
      parts.push(restoreUrlsAfterSplit(rest.slice(0, cut).trim(), urls));
      rest = rest.slice(cut).trim();
    }
    if (rest) parts.push(restoreUrlsAfterSplit(rest, urls));
    return parts.filter(Boolean);
  }

  const blocks: string[] = [];

  const pushSentenceBlocks = (flatText: string) => {
    const { text: protectedText, urls } = protectUrlsForSplit(flatText);
    const normalized = protectedText.replace(/\n+/g, " ").trim();
    const restored = restoreUrlsAfterSplit(normalized, urls);
    const sentences = splitParagraphIntoSentences(restored).flatMap((sentence) =>
      sentence.length > maxChars ? splitLongSentence(sentence, maxChars) : [sentence]
    );
    for (const sentence of sentences) {
      const s = sentence.trim();
      if (!s) continue;
      blocks.push(s);
      if (!neverDrop && blocks.length >= maxBlocks) return;
    }
  };

  const pushBubbleRespectingLimit = (bubble: string) => {
    if (bubble.length <= WHATSAPP_HARD_MAX) {
      blocks.push(bubble);
      return;
    }
    const { text: protectedText, urls } = protectUrlsForSplit(bubble);
    let rest = protectedText;
    while (rest.length > WHATSAPP_HARD_MAX) {
      if (!neverDrop && blocks.length >= maxBlocks) return;
      let cut = rest.lastIndexOf("\n", WHATSAPP_HARD_MAX);
      if (cut < WHATSAPP_HARD_MAX * 0.4) cut = rest.lastIndexOf(" ", WHATSAPP_HARD_MAX);
      if (cut < WHATSAPP_HARD_MAX * 0.4) cut = WHATSAPP_HARD_MAX;
      blocks.push(restoreUrlsAfterSplit(rest.slice(0, cut).trim(), urls));
      rest = rest.slice(cut).trim();
    }
    if (rest && (neverDrop || blocks.length < maxBlocks)) {
      blocks.push(restoreUrlsAfterSplit(rest, urls));
    }
  };

  // Somente linha em branco real (\n\n) separa bolhas — PARA_BREAK ainda não é \n\n
  const majorSegments = clean
    .split(/\n{2,}/)
    .map((s) => s.replace(/^\n+|\n+$/g, ""))
    .filter((s) => s.length > 0);

  for (const segment of majorSegments) {
    if (!neverDrop && blocks.length >= maxBlocks) break;
    const bubble = materializeBubble(segment);
    if (!bubble) continue;

    if (preserveScript || bubble.length <= maxChars || bubble.includes("\n")) {
      pushBubbleRespectingLimit(bubble);
      continue;
    }

    // LLM legado: só sentence-split em bloco único sem quebra de linha e acima do limite
    pushSentenceBlocks(bubble);
  }

  const formatted = blocks
    .map((b) => formatAgentReplyReadableSpacing(b))
    .filter(Boolean);

  if (neverDrop) return formatted;
  return formatted.slice(0, maxBlocks);
}
