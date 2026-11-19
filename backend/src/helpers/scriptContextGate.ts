/**
 * Decide se a mensagem inbound deve disparar a etapa 1 do roteiro
 * com base no "Contexto do roteiro" (scriptContext) salvo no agente.
 *
 * Sem contexto → comportamento legado (pode iniciar).
 * Com contexto pedindo gatilho → só inicia se a mensagem casar com a oferta/gatilho.
 */

function fold(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractQuotedTriggers(ctx: string): string[] {
  const out: string[] = [];
  const re = /["“”']([^"“”']{8,280})["“”']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(ctx || ""))) != null) {
    const q = fold(m[1]);
    if (q.length >= 8) out.push(q);
  }
  return out;
}

function significantWords(s: string): string[] {
  return fold(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3)
    .filter((w) => !/^(para|como|quando|onde|isso|esta|este|pelo|pela|uma|com|sem|mais|menos)$/.test(w));
}

/** Pedido de dúvida / suporte / ajuda — NÃO dispara etapa 1 mesmo com overlap lexical no gatilho. */
export function userLooksLikeScriptContextDoubt(userText: string): boolean {
  const u = fold(userText);
  if (!u) return false;
  if (
    /\b(quero\s+(retirar|tirar)\s+duvidas?|retirar\s+duvidas?|tirar\s+duvidas?)\b/.test(u)
  ) {
    return true;
  }
  if (
    /\b(duvida|duvidas|tenho\s+duvidas?|minha\s+duvida|algumas\s+duvidas?)\b/.test(u)
  ) {
    return true;
  }
  if (
    /\b(quero\s+ajuda|preciso\s+de\s+ajuda|me\s+ajuda|pode\s+me\s+ajudar|ajuda)\b/.test(u)
  ) {
    return true;
  }
  if (
    /\b(suporte|falar\s+com\s+(o\s+)?suporte|atendimento|como\s+funciona|preco|precos|nao\s+entendi)\b/.test(
      u
    )
  ) {
    return true;
  }
  if (
    /\b(instalacao|instalar|marca|recorrencia|mensalidade|configurar|hospedagem)\b/.test(u) &&
    !/\b(garantir.{0,40}vaga|quero\s+garantir)\b/.test(u)
  ) {
    return true;
  }
  if (/^(oi|ola|hey|eai|e ai)\b/.test(u) && u.length < 40) {
    return true;
  }
  return false;
}

function ctxDescribesStartGate(scriptContext: string): boolean {
  const ctxFolded = fold(scriptContext);
  return /comece|inicie|iniciar|dispare|somente quando|so quando|apenas quando|comece o roteiro|inicie o roteiro|quando o cliente|use o roteiro|nao use o roteiro|nao dispare|nao inicie|so entre no roteiro|entre no roteiro/.test(
    ctxFolded
  );
}

function looksLikeOfferIntent(u: string): boolean {
  if (/\b(duvida|duvidas|suporte|ajuda|instalacao|instalar|recorrencia)\b/.test(u)) {
    // Ainda pode ser oferta se pedir vaga/garantir explicitamente
    if (!/garantir.{0,40}vaga|\boferta\b|\bquero\s+garantir\b/.test(u)) {
      return false;
    }
  }
  return (
    /garantir.{0,40}vaga/.test(u) ||
    (/\boferta\b/.test(u) && /(crm|vaga|codigo|fonte)/.test(u)) ||
    (/\bquero\b/.test(u) && /\bvaga\b/.test(u) && /(crm|codigo|fonte|oferta)/.test(u)) ||
    (/codigo[-\s]?fonte/.test(u) &&
      /\b(garantir|vaga|oferta|adquirir|comprar|interesse|quero)\b/.test(u))
  );
}

function quoteMatchIsStrongEnough(quote: string, user: string): boolean {
  if (!quote || !user) return false;
  // Contém trecho longo do gatilho literal
  if (user.includes(quote.slice(0, Math.min(56, quote.length)))) return true;
  // Intenção comercial alinhada ao gatilho (vaga / oferta / garantir)
  if (looksLikeOfferIntent(user)) return true;
  const qw = significantWords(quote);
  const hits = qw.filter((w) => user.includes(w));
  // Exige overlap alto E pelo menos um sinal comercial do gatilho
  const commercial =
    hits.filter((w) => /^(oferta|garantir|vaga|adquirir|comprar)$/.test(w)).length > 0;
  return commercial && hits.length >= Math.max(3, Math.ceil(qw.length * 0.45));
}

/**
 * True = pode apresentar etapa 1 do roteiro.
 * False = deixar a LLM / FAQ / conhecimento responder (dúvida genérica etc.).
 */
export function inboundShouldStartAttendanceScript(
  userText: string,
  scriptContext: string
): boolean {
  const ctx = String(scriptContext || "").trim();
  if (!ctx) return true;

  const u = fold(userText);
  if (!u) return false;

  // Dúvida/suporte/ajuda sempre bloqueia abertura do funil — mesmo se a frase
  // citar "código-fonte" (overlap lexical com o gatilho entre aspas).
  if (userLooksLikeScriptContextDoubt(userText)) {
    return false;
  }

  const quotes = extractQuotedTriggers(ctx);
  if (quotes.length) {
    return quotes.some((q) => quoteMatchIsStrongEnough(q, u));
  }

  const ctxAsksGate = ctxDescribesStartGate(ctx);

  if (!ctxAsksGate) return true;

  if (looksLikeOfferIntent(u)) return true;

  // Sem match claro de oferta: não forçar etapa 1
  return false;
}

export function readPromptScriptContext(prompt: {
  cargo?: any;
  attendanceScriptContext?: string | null;
  attendanceSettings?: { scriptContext?: string } | null;
}): string {
  const col = String((prompt as any)?.attendanceScriptContext || "").trim();
  if (col) return col;
  let cargo = (prompt as any)?.cargo;
  if (typeof cargo === "string") {
    try {
      cargo = JSON.parse(cargo);
    } catch {
      cargo = {};
    }
  }
  const fromCargo = String(cargo?.guimoV2Attendance?.scriptContext || "").trim();
  if (fromCargo) return fromCargo;
  return String((prompt as any)?.attendanceSettings?.scriptContext || "").trim();
}

/**
 * Mid-funnel: com "Contexto do roteiro" pedindo gatilho, dúvidas genéricas /
 * perguntas fora da oferta NÃO devem avançar o roteiro — ceder à personalização
 * (FAQ, regras, base, LLM). Respostas curtas de etapa (sim/não/número) seguem.
 */
export function inboundShouldYieldToAgentPersonalization(
  userText: string,
  scriptContext: string,
  opts?: { flowInProgress?: boolean }
): boolean {
  const ctx = String(scriptContext || "").trim();
  if (!ctx) return false;

  const u = fold(userText);
  if (!u || u.length < 3) return false;

  // Respostas típicas de etapa: manter no roteiro
  if (
    /^(sim|nao|n[aã]o|ok|okay|pode|claro|isso|quero|beleza|fechado|valeu|obrigad[oa]|1|2|3)[\s!.?]*$/i.test(
      String(userText || "").trim()
    )
  ) {
    return false;
  }
  if (/^\d{1,4}([.,]\d+)?$/.test(String(userText || "").trim())) {
    return false;
  }

  const quotes = extractQuotedTriggers(ctx);
  if (
    quotes.length &&
    quotes.some((q) => quoteMatchIsStrongEnough(q, u)) &&
    !userLooksLikeScriptContextDoubt(userText)
  ) {
    return false; // casa com gatilho do contexto → pode usar roteiro
  }

  const ctxAsksGate = ctxDescribesStartGate(ctx);

  const looksLikeDoubtOrOffScript =
    userLooksLikeScriptContextDoubt(userText) ||
    /\?/.test(String(userText || "")) ||
    /\b(ajuda|suporte|duvida|duvidas|api|preco|precos|como funciona|instalar|configurar|hospedagem|codigo[\s-]?fonte|teste gratis|webhook|integracao)\b/.test(
      u
    ) ||
    /\b(preciso|quero saber|me explica|me ajuda|tem\s+(api|suporte))\b/.test(u);

  if (looksLikeDoubtOrOffScript) {
    if (ctxAsksGate || opts?.flowInProgress) return true;
  }

  return false;
}
