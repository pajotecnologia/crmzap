/** Remove bloco OBJEÇÕES (alinhado ao strip do roteiro). */
const RE_OBJEÇÕES_BLOCO = /(^|\n)\s*#?\s*OBJE[CÇ][AÃ]O(E)?S\b[\s\S]*/i;

/**
 * Trecho após "EXEMPLO DE RESPOSTA…" é simulação: fala do lead + RESPOSTA do agente **depois** da resposta real.
 * Na apresentação inicial da etapa, só enviar o que vem **antes** desse marcador —
 * EXCETO etapas-ramo (só EXEMPLO + RESPOSTA), onde o corpo ao cliente É a RESPOSTA.
 */
const RE_EXEMPLO_RESPOSTA_CUT = /EXEMPLO\s+DE\s+RESPOSTA/i;

const RE_STEP_HEADING_IN_BLOCK = String.raw`\n\s*#?\s*(?:(?:pr[oó]xima\s+etapa|pr[oó]ximo\s+passo|nova\s+etapa|next\s+step)\b|(?:etapa|passo)\s*\d+|(?:etapa|passo)\b|\d+[\.)]\s+\S)`;
const RE_FIRST_RESPOSTA_BODY = new RegExp(
  String.raw`RESPOSTA\s*:\s*\n*([\s\S]*?)(?=\n\s*---\s*\n|\nEXEMPLO\s+DE\s+RESPOSTA|${RE_STEP_HEADING_IN_BLOCK}|$)`,
  "i"
);

function headHasCustomerSpeech(head: string): boolean {
  const lines = String(head || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((t) => !/^mensagem\s*:?\s*$/i.test(t))
    .filter((t) => !/^#+\s+\S/.test(t))
    .filter((t) => !/^[\s\-=*_·•]{3,}$/.test(t));
  const joined = lines.join("\n").trim();
  if (!joined) return false;
  const letters = joined.replace(/[^A-Za-zÀ-ÿ]/g, "");
  return letters.length >= 12 || joined.replace(/\s/g, "").length >= 40;
}

/**
 * Texto do roteiro a enviar ao cliente ao apresentar a etapa:
 * - Com "Mensagem:" antes do EXEMPLO → só a abertura (RESPOSTA fica para depois da resposta do lead).
 * - Etapa-ramo (só EXEMPLO + RESPOSTA, ex. ETAPA 2 do Pajo) → corpo da RESPOSTA intacto
 *   (URLs, quebras de linha, /mídia).
 */
export function sliceAgentStepTextForInitialSend(stepText: string): string {
  let s = String(stepText || "").replace(/\r\n/g, "\n");
  s = s.replace(RE_OBJEÇÕES_BLOCO, "").trimEnd();
  const cut = s.search(RE_EXEMPLO_RESPOSTA_CUT);
  if (cut < 0) return s;

  const head = s.slice(0, cut).trimEnd();
  if (headHasCustomerSpeech(head)) {
    return head;
  }

  const resp = RE_FIRST_RESPOSTA_BODY.exec(s);
  if (resp && resp[1] != null) {
    return String(resp[1]).replace(/\s+$/g, "");
  }
  return head;
}

/** Slug de comando de roteiro: /agendamento, /transferirchamado, etc. */
const RE_CMD_FULL_LINE = /^\/([a-zA-Z][a-zA-Z0-9_-]*)\s*$/;
/** Comando no fim da linha; exige espaço ou início antes de `/` (evita `...com/agendamento` em URL). */
const RE_CMD_LINE_TAIL = /(?:^|\s)\/([a-zA-Z][a-zA-Z0-9_-]*)\s*$/;

/**
 * Mídia anexada ao roteiro: #nome-da-midia (sem espaço após #).
 * Diferente de cabeçalhos estruturais: "# ETAPA 1", "# PASSO", "# 1. Título".
 */
const RE_MEDIA_FULL_LINE = /^#([a-zA-Z][a-zA-Z0-9_-]*)\s*$/;
const RE_MEDIA_LINE_TAIL = /(?:^|\s)#([a-zA-Z][a-zA-Z0-9_-]*)\s*$/;

/** Cabeçalho de etapa/passo do roteiro (# + espaço + texto) — não é mídia. */
export function isScriptStructuralHeadingLine(rawLine: string): boolean {
  return /^#+\s+\S/.test(String(rawLine || "").replace(/\u200e/g, "").trim());
}

/**
 * True se o `/slug` no fim da linha faz parte de uma URL (http/https/www ou path colado).
 * Garante que links no roteiro sejam texto comum, não comando.
 */
export function lineLooksLikeUrlNotCommand(rawLine: string): boolean {
  const line = String(rawLine || "").replace(/\u200e/g, "").trim();
  if (!line) return false;
  if (/https?:\/\//i.test(line) || /^www\./i.test(line)) return true;
  // Path absoluto de site sem protocolo no meio do texto (ex.: site.com/path)
  if (/[a-z0-9.-]+\.[a-z]{2,}\/[a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=%-]+/i.test(line)) {
    return true;
  }
  return false;
}

/** Uma linha do roteiro é comando somente se for EXATAMENTE `/slug` (linha isolada).
 *  Nunca interpreta `/` no meio do texto, URLs ou "Olá /teste".
 */
export function matchScriptCommandSlugFromLine(rawLine: string): string | null {
  const line = String(rawLine || "").replace(/\u200e/g, "").trim();
  if (!line) return null;
  if (/^https?:\/\//i.test(line) || /^www\./i.test(line)) return null;
  const m = line.match(RE_CMD_FULL_LINE);
  return m ? m[1] : null;
}

/**
 * Mídia do roteiro via hashtag: #catalogo, #nome-da-midia.
 * Não confunde com "# ETAPA" / "# PASSO" (espaço após #).
 */
export function matchScriptMediaSlugFromLine(rawLine: string): string | null {
  const line = String(rawLine || "").replace(/\u200e/g, "").trim();
  if (!line) return null;
  if (isScriptStructuralHeadingLine(line)) return null;
  let m = line.match(RE_MEDIA_FULL_LINE);
  if (!m) m = line.match(RE_MEDIA_LINE_TAIL);
  return m ? m[1] : null;
}

/** Remove `/slug` ou `#slug` do fim da linha, preservando o texto anterior. */
export function stripTrailingScriptToken(
  rawLine: string,
  slug: string,
  kind: "command" | "media"
): string {
  const line = String(rawLine || "");
  const token = kind === "media" ? `#${slug}` : `/${slug}`;
  const re = new RegExp(`(?:^|\\s)${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);
  return line.replace(re, "").replace(/\s+$/g, "");
}

/**
 * Extrai slugs de comandos `/slug` de um bloco de texto (uma ou mais linhas).
 * Aceita linha só com o comando ou texto antes do comando no fim da linha.
 * Preserva ordem; remove duplicatas do mesmo slug.
 */
export function extractSlashCommandSlugsFromScriptBlock(block: string): string[] {
  const slugs: string[] = [];
  const seen = new Set<string>();
  for (const rawLine of String(block || "").split("\n")) {
    const slug = matchScriptCommandSlugFromLine(rawLine);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    slugs.push(slug);
  }
  return slugs;
}

/**
 * Extrai slugs de mídia `#slug` do bloco (ignora cabeçalhos "# ETAPA").
 */
export function extractHashMediaSlugsFromScriptBlock(block: string): string[] {
  const slugs: string[] = [];
  const seen = new Set<string>();
  for (const rawLine of String(block || "").split("\n")) {
    const slug = matchScriptMediaSlugFromLine(rawLine);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    slugs.push(slug);
  }
  return slugs;
}

/**
 * Linhas `/comando` que ficam após "EXEMPLO DE RESPOSTA" foram removidas do slice inicial (não são fala ao cliente).
 * Ainda assim precisam virar ações adiadas (agendamento, transferência, etc.) após a resposta do cliente.
 */
export function extractSlashCommandsFromTrainingTail(fullStepText: string): string[] {
  let s = String(fullStepText || "").replace(/\r\n/g, "\n");
  s = s.replace(RE_OBJEÇÕES_BLOCO, "").trimEnd();
  const cut = s.search(RE_EXEMPLO_RESPOSTA_CUT);
  if (cut < 0) return [];
  const tail = s.slice(cut);
  return extractSlashCommandSlugsFromScriptBlock(tail);
}

function slugLooksLikeAgendamento(slug: string): boolean {
  const l = String(slug || "").toLowerCase();
  return l === "agendamento" || l === "agendar" || l.includes("marcarhorario") || l.includes("marcar_horario");
}

/** Primeiro slug de comando no passo que parece agendamento (corpo ou tail após EXEMPLO). */
export function findAgendamentoSlugInStepScript(stepText: string): string | null {
  const raw = String(stepText || "");
  for (const s of extractSlashCommandSlugsFromScriptBlock(raw)) {
    if (slugLooksLikeAgendamento(s)) return s;
  }
  for (const s of extractSlashCommandsFromTrainingTail(raw)) {
    if (slugLooksLikeAgendamento(s)) return s;
  }
  return null;
}

export function stepScriptMentionsAgendamentoCommand(stepText: string): boolean {
  return findAgendamentoSlugInStepScript(stepText) != null;
}

function slugLooksLikeTransfer(slug: string): boolean {
  const l = String(slug || "").toLowerCase();
  return l.includes("transferir") || l.includes("transfer") || l === "transferirchamado" || l === "transferiratendimento";
}

/** Primeiro slug no passo que parece transferência (para inferir ação adiada perdida). */
export function findTransferSlugInStepScript(stepText: string): string | null {
  const raw = String(stepText || "");
  for (const s of extractSlashCommandSlugsFromScriptBlock(raw)) {
    if (slugLooksLikeTransfer(s)) return s;
  }
  for (const s of extractSlashCommandsFromTrainingTail(raw)) {
    if (slugLooksLikeTransfer(s)) return s;
  }
  return null;
}
