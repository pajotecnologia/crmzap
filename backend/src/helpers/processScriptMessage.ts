import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Contexto do contato/conversa para resolução de variáveis do roteiro.
 * Usar sempre o contato que receberá a mensagem (nunca mock / outro contato).
 */
export type ScriptMessageContactContext = {
  contact?: {
    name?: string | null;
    number?: string | null;
    email?: string | null;
    extraInfo?: Array<{ name?: string | null; value?: string | null }> | null;
  } | null;
  ticket?: {
    id?: number | string | null;
    user?: { name?: string | null } | null;
    queue?: { name?: string | null } | null;
    whatsapp?: { name?: string | null } | null;
    company?: { name?: string | null } | null;
  } | null;
  agentName?: string | null;
  companyName?: string | null;
  now?: Date;
  /** Overrides explícitos (ex.: número_pedido vindo de ação/estado). */
  extras?: Record<string, string | null | undefined> | null;
};

const safe = (v: unknown): string => String(v ?? "").trim();

function firstNameFrom(full: string): string {
  const parts = safe(full).split(/\s+/).filter(Boolean);
  return parts[0] || "";
}

function normalizeVarKey(raw: string): string {
  return safe(raw)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Monta o mapa completo de variáveis disponíveis a partir do contato/ticket.
 * Inclui aliases do editor ({nome_contato}), Mustache ({{nome}}) e extraInfo.
 */
export function buildScriptVariableMap(
  ctx: ScriptMessageContactContext
): Record<string, string> {
  const now = ctx.now instanceof Date && !Number.isNaN(ctx.now.getTime()) ? ctx.now : new Date();
  const contactName = safe(ctx.contact?.name);
  const phone = safe(ctx.contact?.number);
  const email = safe(ctx.contact?.email);
  const agentName = safe(ctx.agentName) || safe(ctx.ticket?.user?.name);
  const companyName =
    safe(ctx.companyName) || safe(ctx.ticket?.company?.name);
  const queueName = safe(ctx.ticket?.queue?.name);
  const connectionName = safe(ctx.ticket?.whatsapp?.name);
  const ticketId = ctx.ticket?.id != null ? String(ctx.ticket.id) : "";
  const first = firstNameFrom(contactName);

  const dd = format(now, "dd", { locale: ptBR });
  const mm = format(now, "MM", { locale: ptBR });
  const yyyy = format(now, "yyyy", { locale: ptBR });
  const data = `${dd}/${mm}/${yyyy}`;
  const hora = format(now, "HH:mm:ss", { locale: ptBR });
  const dataHora = format(now, "dd/MM/yyyy HH:mm", { locale: ptBR });
  const mesLongo = format(now, "MMMM", { locale: ptBR });

  const map: Record<string, string> = {
    // Editor / roteiro Agente IA
    nome_contato: contactName,
    nome_cliente: contactName,
    nome_agente: agentName,
    nome_empresa: companyName,
    data_hora: dataHora,
    ano: yyyy,
    mes_atual: mesLongo,
    telefone: phone,
    data_completa: data,

    // Mustache / campanhas / templates comuns
    nome: contactName,
    name: contactName,
    firstname: first,
    primeiro_nome: first,
    empresa: companyName,
    name_company: companyName,
    email,
    data,
    hora,
    mes: mesLongo,
    ticket: ticketId,
    ticket_id: ticketId,
    atendente: agentName,
    username: agentName,
    queue: queueName,
    fila: queueName,
    connection: connectionName,
    conexao: connectionName
  };

  const extras = ctx.extras || {};
  for (const [k, v] of Object.entries(extras)) {
    const key = normalizeVarKey(k);
    if (key) map[key] = safe(v);
  }

  const extraInfo = ctx.contact?.extraInfo;
  if (Array.isArray(extraInfo)) {
    for (const info of extraInfo) {
      const key = normalizeVarKey(String(info?.name || ""));
      if (!key) continue;
      // extraInfo não sobrescreve chaves de sistema já preenchidas com valor
      if (map[key] !== undefined && map[key] !== "") continue;
      map[key] = safe(info?.value);
    }
  }

  return map;
}

/**
 * Substitui {{var}} e {var} pelos valores do mapa.
 * Preserva *, _, ~, emojis, URLs e demais formatação ao redor.
 * Variáveis desconhecidas permanecem intactas (não quebra o envio).
 */
export function resolveScriptVariables(
  message: string,
  variables: Record<string, string>
): string {
  if (!message || typeof message !== "string") return "";
  if (!variables || typeof variables !== "object") return message;

  let out = message;

  // {{chave}} primeiro (evita deixar um par residual)
  out = out.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (full, key) => {
    const k = String(key || "").toLowerCase();
    if (Object.prototype.hasOwnProperty.call(variables, k)) {
      return variables[k];
    }
    return full;
  });

  // {chave} — single brace (editor do roteiro)
  out = out.replace(/\{([a-zA-Z0-9_]+)\}/g, (full, key) => {
    const k = String(key || "").toLowerCase();
    if (Object.prototype.hasOwnProperty.call(variables, k)) {
      return variables[k];
    }
    return full;
  });

  return out;
}

/**
 * Converte marcadores de espaço/quebra do roteiro:
 * - Linha só com "-" (ASCII) → parágrafo na mesma bolha (marcador interno → \n\n no envio).
 * - Linha só com — / – → quebra visual na mesma bolha (\n).
 * - Linha em branco real no roteiro permanece (\n\n) e vira bolha nova no split.
 *
 * NÃO trata "- item" (listas).
 */
export function convertScriptLineBreakMarkers(message: string): string {
  let s = String(message || "").replace(/\r\n/g, "\n");
  if (!s) return "";

  /** Marcador interno: parágrafo na mesma bolha (não é \n\n de split). */
  const PARA = "\uE011";

  const isAsciiDashLine = (line: string): boolean => {
    const t = line.replace(/[ \t\u00A0\u2000-\u200B\uFEFF]+/g, " ").trim();
    return t === "-";
  };
  const isEmDashLine = (line: string): boolean => {
    const t = line.replace(/[ \t\u00A0\u2000-\u200B\uFEFF]+/g, " ").trim();
    return t === "\u2014" || t === "\u2013" || t === "–" || t === "—";
  };

  const lines = s.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isAsciiDashLine(lines[i])) {
      // Mantém marcador de parágrafo (mesma bolha); o split de bolhas trata depois.
      out.push(PARA);
      continue;
    }
    if (isEmDashLine(lines[i])) {
      continue;
    }
    out.push(lines[i].replace(/[ \t]+$/g, ""));
  }

  s = out.join("\n");

  // Travessão tipográfico colado no início da linha: "A\n—B" → "A\nB"
  s = s.replace(/\n[ \t]*[\u2014\u2013][ \t]*(?=\S)/g, "\n");
  s = s.replace(/[\u2014\u2013]/g, "");

  // Colapsa PARA entre newlines em um único marcador (evita \n\n prematuro)
  s = s.replace(new RegExp(`\\n*${PARA}\\n*`, "g"), PARA);
  // Restaura PARA como delimitador de linha para o split AgentOutboundBubbles
  s = s.replace(new RegExp(PARA, "g"), `\n${PARA}\n`);

  s = s.replace(/^\n+/, "").replace(/\n+$/, "");
  // Não colapsar \n\n reais do autor — só triplo+
  s = s.replace(/\n{3,}/g, "\n\n");
  return s;
}

/**
 * Processamento centralizado do texto do roteiro antes do payload WhatsApp:
 * 1) resolve todas as variáveis do contato/conversa
 * 2) preserva formatação (*, _, ~, links, emojis, \\n)
 * 3) converte `-` sozinho em parágrafo na mesma bolha e `—`/`–` em quebra simples; linha em branco real = bolha nova
 * 4) retorna exclusivamente o texto final a enviar
 */
export function processScriptMessage(
  message: string,
  contactContext: ScriptMessageContactContext
): string {
  const raw = String(message ?? "");
  if (!raw.trim()) return "";

  const variables = buildScriptVariableMap(contactContext || {});
  const withVars = resolveScriptVariables(raw, variables);
  return convertScriptLineBreakMarkers(withVars);
}

export default processScriptMessage;
