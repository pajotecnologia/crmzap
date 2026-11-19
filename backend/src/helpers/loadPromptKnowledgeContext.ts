/**
 * Carrega a base completa do agente (FAQ + documentos + regras + inventário)
 * para side-quests. Sempre lê a base antes de responder — não depende só de keyword hit.
 */

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import axios from "axios";
import PromptFaqItem from "../models/PromptFaqItem";
import PromptKnowledgeSource from "../models/PromptKnowledgeSource";
import Inventory from "../models/Inventory";
import logger from "../utils/logger";

function fold(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function significantWords(text: string): string[] {
  return fold(text)
    .split(/[^a-z0-9]+/)
    .filter(w => w.length > 2)
    .filter(
      w =>
        !/^(tem|uma|para|como|qual|quais|sobre|isso|este|esta|com|sem|the|and|for|you|que|nao|sim|por|dos|das|uns|voce|voces)$/.test(
          w
        )
    );
}

/** Sinônimos para pontuar relevância (suporte ↔ atendimento, etc.) */
const QUERY_SYNONYMS: Record<string, string[]> = {
  suporte: ["suporte", "atendimento", "helpdesk", "sac", "assistencia", "ajuda", "humano"],
  api: ["api", "webhook", "integracao", "endpoint", "cloud", "meta", "oficial"],
  preco: ["preco", "valor", "plano", "mensalidade", "orcamento", "custa"],
  instalacao: ["instalacao", "instalar", "setup", "deploy", "docker", "vps"],
  hospedagem: ["hospedagem", "hosting", "nuvem", "cloud", "servidor"],
  codigo: ["codigo", "fonte", "repositorio", "github", "source"],
  teste: ["teste", "trial", "demo", "gratis", "experimentar"],
  configuracao: ["configuracao", "configurar", "ajustes", "parametros", "setup"],
  sistema: ["sistema", "plataforma", "crm", "painel", "dashboard", "vbsolution"],
  funcionalidade: ["funcionalidade", "recurso", "modulo", "feature", "incluso", "inclui"]
};

function expandQueryWords(queryWords: string[], queryFold: string): string[] {
  const out = new Set<string>(queryWords);
  for (const [key, syns] of Object.entries(QUERY_SYNONYMS)) {
    if (queryFold.includes(key) || queryWords.some(w => syns.includes(w))) {
      syns.forEach(s => out.add(s));
    }
  }
  if (/o\s+que\s+e|que\s+e\s+o|vb\s*solution|vbsolution/.test(queryFold)) {
    ["vbsolution", "crm", "sistema", "plataforma", "produto"].forEach(s => out.add(s));
  }
  if (/codigo[\s-]?fonte|o\s+que\s+vem|incluso|inclui/.test(queryFold)) {
    ["codigo", "fonte", "incluso", "inclui", "pacote", "entrega", "repositorio"].forEach(s =>
      out.add(s)
    );
  }
  return [...out];
}

function scoreText(haystack: string, queryWords: string[], queryFold: string): number {
  const h = fold(haystack);
  if (!h) return 0;
  let score = 0;
  if (queryFold.length >= 6 && h.includes(queryFold.slice(0, Math.min(48, queryFold.length)))) {
    score += 4;
  }
  for (const w of queryWords) {
    if (h.includes(w)) score += 1.2;
  }
  return score;
}

async function extractTextFromBuffer(buffer: Buffer, filename: string): Promise<string> {
  const lower = filename.toLowerCase();
  try {
    if (lower.endsWith(".pdf") || buffer.slice(0, 5).toString() === "%PDF-") {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = require("pdf-parse");
      const parsed = await pdfParse(buffer);
      return String(parsed?.text || "").trim();
    }
    if (lower.endsWith(".docx")) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return String(result?.value || "").trim();
    }
    if (
      lower.endsWith(".txt") ||
      lower.endsWith(".md") ||
      lower.endsWith(".csv") ||
      lower.endsWith(".json") ||
      lower.endsWith(".html")
    ) {
      return buffer.toString("utf8").trim();
    }
    const asText = buffer.toString("utf8");
    if (asText && !asText.includes("\u0000") && asText.length > 40) {
      return asText.trim();
    }
  } catch (e: any) {
    logger.warn(`[KNOWLEDGE-CTX] extract ${filename}: ${e?.message || e}`);
  }
  return "";
}

async function resolveSourcePlainText(row: PromptKnowledgeSource): Promise<string> {
  const existing = String(row.content || "").trim();
  if (existing.length >= 40) return existing;

  const fileUrl = String(row.fileUrl || "").trim();
  if (!fileUrl) return existing;

  const tryLocalPaths = (rel: string): string[] => {
    const clean = rel.replace(/^\//, "");
    return [
      path.isAbsolute(rel) ? rel : "",
      path.join(process.cwd(), "public", clean),
      path.join(process.cwd(), "backend", "public", clean),
      path.join(process.cwd(), clean)
    ].filter(Boolean);
  };

  try {
    if (/^https?:\/\//i.test(fileUrl)) {
      const { data } = await axios.get<ArrayBuffer>(fileUrl, {
        responseType: "arraybuffer",
        timeout: 45000,
        maxContentLength: 20 * 1024 * 1024
      });
      const buf = Buffer.from(data);
      let name = "source.bin";
      try {
        name = path.basename(new URL(fileUrl).pathname) || name;
      } catch {
        /* ignore */
      }
      return (await extractTextFromBuffer(buf, name)) || existing;
    }

    for (const localPath of tryLocalPaths(fileUrl)) {
      if (!fs.existsSync(localPath)) continue;
      const buf = await fsp.readFile(localPath);
      const extracted = await extractTextFromBuffer(buf, path.basename(localPath));
      if (extracted) return extracted;
    }
  } catch (e: any) {
    logger.warn(`[KNOWLEDGE-CTX] resolve source id=${row.id}: ${e?.message || e}`);
  }
  return existing;
}

export type KnowledgeExcerpt = {
  title: string;
  text: string;
  score: number;
  source: "faq" | "document" | "rules" | "inventory";
};

export type PromptKnowledgeContext = {
  block: string;
  matchedTitles: string[];
  faqHits: number;
  sourceHits: number;
  hasAnyMaterial: boolean;
  /** Trechos mais relevantes à pergunta — preferir estes na resposta. */
  excerpts: KnowledgeExcerpt[];
};

function splitIntoPassages(text: string): string[] {
  return String(text || "")
    .split(/\n{2,}|(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÀÃÕÂÊÔ0-9•\-\*])/)
    .map(p => p.replace(/\s+/g, " ").trim())
    .filter(p => p.length >= 40);
}

function looksLikeInternalAgentDirective(text: string): boolean {
  const t = fold(text);
  if (!t || t.length < 20) return false;
  return (
    /sem titulos de secao|sem ['"]?resposta|colar o roteiro|um turno\s*=\s*uma etapa|infira transicoes|nao avance de forma mecanica|diretrizes de interpretacao|marcadores internos|envie so mensagens naturais|proxima etapa e condicoes|nao encadeie|nao copie blocos|interprete o roteiro|sistema > contexto|actions sao capacidades|antes de responder, consolide|nucleo cognitivo|estado do roteiro|aguardando resposta do cliente \(marcacao/.test(
      t
    ) ||
    /#\s*(etapa|passo)\b|exemplo de resposta|^\s*resposta\s*:/i.test(text) ||
    /com base na documentacao\/faq sobre/.test(t)
  );
}

/**
 * Extrai trechos concretos da base que batem com a pergunta do cliente.
 * Nunca inclui regras internas / diretivas de prompt.
 */
export function extractTopicExcerpts(
  userText: string,
  materials: Array<{ title: string; text: string; source: KnowledgeExcerpt["source"] }>,
  limit = 6
): KnowledgeExcerpt[] {
  const queryFold = fold(userText);
  const queryWords = expandQueryWords(significantWords(userText), queryFold);
  const out: KnowledgeExcerpt[] = [];

  for (const mat of materials) {
    // Regras internas do agente NÃO vão para trechos (vazavam instruções técnicas ao cliente)
    if (mat.source === "rules") continue;

    const title = String(mat.title || "fonte");
    const full = String(mat.text || "");
    if (!full.trim()) continue;
    if (looksLikeInternalAgentDirective(full.slice(0, 500))) continue;

    if (mat.source === "faq") {
      const score = scoreText(full, queryWords, queryFold);
      if (score >= 1.2 && !looksLikeInternalAgentDirective(full)) {
        out.push({
          title,
          text: full.slice(0, 1200),
          score: score + 1,
          source: "faq"
        });
      }
      continue;
    }

    const passages = splitIntoPassages(full);
    for (const passage of passages) {
      if (looksLikeInternalAgentDirective(passage)) continue;
      const score = scoreText(`${title} ${passage}`, queryWords, queryFold);
      if (score < 0.8) continue;
      out.push({
        title,
        text: passage.slice(0, 900),
        score: mat.source === "document" ? score + 0.5 : score,
        source: mat.source
      });
    }

    if (scoreText(title, queryWords, queryFold) >= 1.5) {
      const head = (passages.length ? passages.slice(0, 4).join(" ") : full).slice(
        0,
        1600
      );
      if (head.length >= 40 && !looksLikeInternalAgentDirective(head)) {
        out.push({
          title,
          text: head,
          score: 3.5,
          source: mat.source
        });
      }
    }

    for (const w of queryWords) {
      if (w.length < 4) continue;
      const idx = fold(full).indexOf(w);
      if (idx < 0) continue;
      const start = Math.max(0, idx - 120);
      const slice = full.slice(start, start + 700).trim();
      if (slice.length >= 40 && !looksLikeInternalAgentDirective(slice)) {
        out.push({
          title,
          text: slice,
          score: 2.2,
          source: mat.source
        });
      }
    }
  }

  out.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const unique: KnowledgeExcerpt[] = [];
  for (const e of out) {
    const key = fold(e.text).slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(e);
    if (unique.length >= limit) break;
  }
  return unique;
}

/** NÃO enviar ao cliente — só material interno para a LLM. */
export function formatExcerptsForReply(
  _excerpts: KnowledgeExcerpt[],
  _userText: string
): string {
  return "";
}

function sanitizeLight(s: string): string {
  return String(s || "")
    .replace(/\u200e/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/**
 * Monta bloco com TODA a base útil do agente (FAQ completo, documentos, regras, inventário).
 * Ordena por relevância à pergunta, mas NÃO descarta o restante — a LLM precisa ler tudo.
 */
export async function loadPromptKnowledgeContext(params: {
  promptId: number;
  companyId: number;
  userText: string;
  maxChars?: number;
  /** Texto de regras/persona do prompt (coluna prompt / regras gerais). */
  promptRulesText?: string;
}): Promise<PromptKnowledgeContext> {
  const maxChars = Math.max(4000, Number(params.maxChars) || 28000);
  const queryFold = fold(params.userText);
  const queryWords = expandQueryWords(significantWords(params.userText), queryFold);
  const parts: string[] = [];
  const matchedTitles: string[] = [];
  const materialsForExcerpts: Array<{
    title: string;
    text: string;
    source: KnowledgeExcerpt["source"];
  }> = [];
  let faqHits = 0;
  let sourceHits = 0;
  let budget = maxChars;

  const push = (chunk: string) => {
    const t = String(chunk || "").trim();
    if (!t || budget < 200) return;
    const slice = t.slice(0, budget - 20);
    parts.push(slice);
    budget -= slice.length + 2;
  };

  // 1) Regras gerais — só no bloco interno da LLM, NÃO nos excerpts ao cliente
  const rules = String(params.promptRulesText || "").trim();
  if (rules) {
    push(
      `REGRAS GERAIS (contexto interno — NÃO copiar ao cliente):\n${rules.slice(0, 8000)}`
    );
  }

  // 2) FAQ completo (prioriza hits, mas inclui o resto)
  try {
    const faqs = await PromptFaqItem.findAll({
      where: {
        promptId: params.promptId,
        companyId: params.companyId
      },
      order: [
        ["priority", "DESC"],
        ["id", "ASC"]
      ],
      limit: 120
    });

    const scoredFaq = faqs
      .map(row => {
        const q = String(row.question || "").trim();
        const a = String(row.answer || "").trim();
        const score = scoreText(`${q}\n${a}`, queryWords, queryFold);
        return { score, q, a };
      })
      .filter(x => x.a)
      .sort((a, b) => b.score - a.score);

    faqHits = scoredFaq.filter(x => x.score >= 1).length || scoredFaq.length;
    if (scoredFaq.length) {
      const lines = scoredFaq.map(
        (x, i) => `${i + 1}. P: ${x.q}\n   R: ${x.a.slice(0, 2500)}`
      );
      push(`FAQ COMPLETO DO AGENTE (${scoredFaq.length} itens — use para responder):\n${lines.join("\n\n")}`);
      for (const x of scoredFaq.slice(0, 40)) {
        materialsForExcerpts.push({
          title: `FAQ: ${x.q.slice(0, 80)}`,
          text: `P: ${x.q}\nR: ${x.a}`,
          source: "faq"
        });
      }
    }
  } catch (e: any) {
    logger.warn(`[KNOWLEDGE-CTX] FAQ prompt=${params.promptId}: ${e?.message || e}`);
  }

  // 3) Documentos — TODOS, ordenados por relevância
  try {
    const sources = await PromptKnowledgeSource.findAll({
      where: {
        promptId: params.promptId,
        companyId: params.companyId
      },
      order: [["id", "ASC"]],
      limit: 50
    });

    const scored: Array<{ score: number; title: string; text: string }> = [];
    for (const row of sources) {
      if (String(row.sourceType || "") === "website") {
        const url = String(row.fileUrl || row.title || "").trim();
        if (url) {
          scored.push({
            score: scoreText(url, queryWords, queryFold),
            title: `Website: ${url}`,
            text: `Referência de site cadastrada: ${url}`
          });
        }
        continue;
      }
      const title = String(row.title || row.fileUrl || `fonte-${row.id}`);
      const text = await resolveSourcePlainText(row);
      const body =
        text && text.length >= 20
          ? text
          : `(Documento anexado: ${title}. Conteúdo textual não extraído — use file_search se disponível.)`;
      const score = Math.max(
        0.25,
        scoreText(`${title}\n${body.slice(0, 5000)}`, queryWords, queryFold)
      );
      scored.push({ score, title, text: body });
    }

    scored.sort((a, b) => b.score - a.score);
    sourceHits = scored.length;
    if (scored.length) {
      push("DOCUMENTOS / BASE DE CONHECIMENTO (leia todos os trechos abaixo antes de responder):");
      for (const item of scored) {
        if (budget < 400) break;
        // Docs mais relevantes ganham mais espaço; os demais ainda entram
        const cap = item.score >= 2 ? 8000 : 4500;
        const slice = item.text.slice(0, Math.min(cap, budget - 80));
        matchedTitles.push(item.title);
        push(`### ${item.title}\n${slice}`);
        materialsForExcerpts.push({
          title: item.title,
          text: item.text,
          source: "document"
        });
      }
    }
  } catch (e: any) {
    logger.warn(`[KNOWLEDGE-CTX] sources prompt=${params.promptId}: ${e?.message || e}`);
  }

  // 4) Inventário (resumo) — preços/produtos reais
  try {
    const products = await Inventory.findAll({
      where: { companyId: params.companyId },
      order: [["id", "ASC"]],
      limit: 40
    });
    if (products.length) {
        const lines = products.map((p: any) => {
        const name = String(p.name || `item-${p.id}`).trim();
        const price = p.price != null ? Number(p.price) : null;
        const stock = p.quantity != null ? p.quantity : null;
        const desc = String(p.description || "").trim().slice(0, 120);
        const priceStr =
          price != null && !Number.isNaN(price)
            ? `R$ ${price.toFixed(2)}`
            : "preço sob consulta";
        const stockStr = stock != null ? ` | estoque: ${stock}` : "";
        const descStr = desc ? ` — ${desc}` : "";
        return `- ${name}: ${priceStr}${stockStr}${descStr}`;
      });
      push(
        `INVENTÁRIO / PRODUTOS DA EMPRESA (fatos reais — não invente preço):\n${lines.join("\n")}`
      );
      materialsForExcerpts.push({
        title: "Inventário",
        text: lines.join("\n"),
        source: "inventory"
      });
    }
  } catch (e: any) {
    logger.warn(
      `[KNOWLEDGE-CTX] inventory company=${params.companyId}: ${e?.message || e}`
    );
  }

  const block = parts.join("\n\n").trim().slice(0, maxChars);
  const excerpts = extractTopicExcerpts(
    params.userText,
    materialsForExcerpts,
    8
  );
  return {
    block,
    matchedTitles,
    faqHits,
    sourceHits,
    hasAnyMaterial: block.length > 80 || excerpts.length > 0,
    excerpts
  };
}
