/**
 * Detecta quando a mensagem do cliente é uma solicitação paralela ao roteiro
 * (suporte, sistema, API, preços, instalação, etc.) e o fluxo deve ceder à LLM.
 */

import { userMessageLooksLikeInventoryQuery } from "./inventoryInboundIntent";
import { looksLikePricingOrOffTopicVersusDateQuestion } from "./agentAttendanceFlowMemory";

export type CustomerSideQuestKind =
  | "support"
  | "system"
  | "pricing"
  | "features"
  | "api"
  | "install"
  | "hosting"
  | "source_code"
  | "free_trial"
  | "settings"
  | "technical"
  | "inventory"
  | "other_question";

function normalize(text: string): string {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const SIDE_QUEST_PATTERNS: Array<{ kind: CustomerSideQuestKind; re: RegExp }> = [
  {
    kind: "support",
    re: /\b(suporte|tem\s+suporte|possui\s+suporte|atendimento\s+humano|falar\s+com\s+(o\s+)?(suporte|humano|alguem|atendente)|preciso\s+de\s+ajuda|quero\s+ajuda|me\s+ajuda|pode\s+me\s+ajudar|quero\s+(retirar|tirar)\s+duvidas?|retirar\s+duvidas?|tirar\s+duvidas?|tenho\s+duvidas?|minha\s+duvida|algumas\s+duvidas?|duvidas?|nao\s+estou\s+conseguindo|nao\s+consigo|erro|bug|problema\s+com|travou|falha|help\s*desk|sac)\b/
  },
  {
    kind: "api",
    re: /\b(api|webhook|token\s+da\s+api|integracao|integrar|endpoint|rest\s+api|baileys|oficial\s+meta)\b/
  },
  {
    kind: "install",
    re: /\b(instalacao|instalar|como\s+instalo|setup|deploy|docker|vps|servidor)\b/
  },
  {
    kind: "hosting",
    re: /\b(hospedagem|hosting|onde\s+hospedo|nuvem|cloud|railway|vps)\b/
  },
  {
    kind: "source_code",
    re: /\b(codigo[\s-]?fonte|codigo\s+fonte|source\s+code|repositorio|github|o\s+que\s+vem\s+(no\s+)?codigo)\b/
  },
  {
    kind: "free_trial",
    re: /\b(teste\s+gratis|trial|demo|periodo\s+de\s+teste|experimentar)\b/
  },
  {
    kind: "settings",
    re: /\b(configurar|configuracao|configuracoes|como\s+configuro|ajustes|parametros)\b/
  },
  {
    kind: "features",
    re: /\b(funcionalidade|funciona\s+como|como\s+funciona|o\s+que\s+(e|é)\s+(o\s+)?(vb\s*solution|sistema|crm)|o\s+que\s+(o\s+sistema\s+)?faz|quais\s+(sao\s+)?(os\s+)?recursos|features|modulos?\s+do\s+sistema|o\s+que\s+vem\s+(incluso|incluido|no)|o\s+que\s+inclui)\b/
  },
  {
    kind: "system",
    re: /\b(sistema|plataforma|painel\s+admin|dashboard|problema\s+no\s+login|sem\s+acesso|permissao\s+de\s+usuario|vbsolution)\b/
  },
  {
    kind: "technical",
    re: /\b(tecnico|documentacao|docs|sdk|biblioteca|banco\s+de\s+dados|migracao|ssl|dominio)\b/
  },
  {
    kind: "pricing",
    re: /\b(preco|precos|valor|valores|custa|orcamento|plano|planos|mensalidade|assinatura|pagamento)\b/
  }
];

/**
 * True quando a mensagem do cliente pede algo que o roteiro comercial
 * não deve engolir avançando etapa — a prioridade é responder a intenção.
 */
export function userMessageLooksLikeSideQuest(body: string): boolean {
  return classifyCustomerSideQuest(body) != null;
}

/**
 * Side-quests com tópico claro (API, suporte, preço…) — nunca devem ser
 * tratadas como “resposta plausível” à etapa do roteiro.
 * `other_question` permanece ambígua e pode ceder se a resposta casar com a etapa.
 */
export function isClearTopicSideQuest(body: string): boolean {
  const kind = classifyCustomerSideQuest(body);
  return kind != null && kind !== "other_question";
}

export function classifyCustomerSideQuest(body: string): CustomerSideQuestKind | null {
  const raw = String(body || "").trim();
  if (!raw || raw.length < 3) return null;

  if (userMessageLooksLikeInventoryQuery(raw) || looksLikePricingOrOffTopicVersusDateQuestion(raw)) {
    return "inventory";
  }

  const t = normalize(raw);

  // Respostas curtas típicas de etapa (sim/não/data/número) NÃO são side-quest
  if (
    /^(sim|nao|n[aã]o|ok|okay|pode|claro|isso|quero|beleza|fechado|valeu|obrigad[oa]|oi|ola|bom dia|boa tarde|boa noite)[\s!.?]*$/i.test(
      raw
    )
  ) {
    return null;
  }
  if (/^\d{1,2}([\/.\-]\d{1,2})?([\/.\-]\d{2,4})?(\s+[àa]s?\s*\d{1,2}([:h]\d{2})?)?$/i.test(raw)) {
    return null;
  }
  if (/^\d{1,4}([.,]\d+)?\s*(reais|r\$|%|un|und|unidades?)?$/i.test(raw)) {
    return null;
  }

  for (const { kind, re } of SIDE_QUEST_PATTERNS) {
    if (re.test(t)) return kind;
  }

  // Pergunta própria (inclui curtas: "Tem API?" / "Tem API oficial?")
  if (/\?/.test(raw) && raw.length >= 8) {
    return "other_question";
  }

  // Frases longas de pedido ("preciso...", "quero saber...", "me explica...", "retirar dúvidas")
  if (
    /\b(preciso|quero\s+saber|quero\s+(retirar|tirar)\s+duvidas?|me\s+(explica|ajuda|fala|diz)|pode\s+(me\s+)?(ajudar|explicar|dizer)|como\s+(eu\s+)?(faco|configuro|instalo|uso)|nao\s+entendi|tem\s+(api|suporte|integracao|teste)|duvidas?\s+sobre)\b/.test(
      t
    ) &&
    raw.length >= 10
  ) {
    return "other_question";
  }

  return null;
}

/** Não acrescenta frase de retorno ao roteiro — poluía respostas factuais. */
export function appendSideQuestResumeHint(reply: string): string {
  return String(reply || "").trim();
}

/** "Sim", "ok", "quero", "pode" — confirma a última pergunta do agente, não a etapa do funil. */
export function looksLikeBareAffirmationOrAck(body: string): boolean {
  const raw = String(body || "").trim();
  if (!raw || raw.length > 48) return false;
  return /^(sim(m+)?|sii+m|yes|yeah|yep|ok(ay)?|pode|claro|isso|quero|beleza|blz|fechado|show|top|legal|com certeza|pode ser|quero sim|me explica|explica|manda|manda ver|pode explicar|quero saber|quero saber mais|mais|detalha|detalhe)[\s!.?]*$/i.test(
    raw
  );
}

/** Cliente pede explicitamente retomar o funil comercial. */
export function userWantsResumeAttendanceScript(body: string): boolean {
  const t = normalize(body);
  if (!t) return false;
  return /\b(vamos\s+(seguir|continuar|voltar|avancar)|pode\s+(seguir|continuar|voltar|avancar)|voltar\s+(pro|ao|para\s+o)\s+(roteiro|assunto|atendimento)|continua(r)?\s+(de\s+onde|o\s+atendimento|a\s+conversa)|seguimos|seguir\s+(com\s+)?(o\s+)?(atendimento|roteiro)|pode\s+seguir\s+(com|o)|retomar|voltar\s+pro\s+comercial)\b/.test(
    t
  );
}

/**
 * Side-quest pausada: permanece nela até o cliente pedir retorno ao roteiro
 * ou dar resposta substantiva à etapa pendente (não "Sim" curto).
 */
export function shouldStayInPausedSideQuest(body: string): boolean {
  if (userWantsResumeAttendanceScript(body)) return false;
  if (looksLikeBareAffirmationOrAck(body)) return true;
  // Nova dúvida / aprofundamento — continua side-quest
  if (classifyCustomerSideQuest(body) != null) return true;
  // Texto curto sem conteúdo de etapa → continua no tema
  if (String(body || "").trim().length <= 40 && !/\b(vender|revender|dia\s+a\s+dia|uso\s+interno|meus\s+clientes|proprios\s+clientes)\b/i.test(normalize(body))) {
    return true;
  }
  return false;
}

/** Expande "Sim"/"quero saber mais" para o LLM continuar o tópico pausado. */
export function expandPausedSideQuestUserText(
  body: string,
  kind: CustomerSideQuestKind | string | null | undefined
): string {
  const raw = String(body || "").trim();
  if (!looksLikeBareAffirmationOrAck(raw) && classifyCustomerSideQuest(raw) != null) {
    return raw;
  }
  if (!looksLikeBareAffirmationOrAck(raw) && raw.length >= 12) {
    return raw;
  }
  const k = String(kind || "").trim() || "other_question";
  const map: Record<string, string> = {
    api:
      "Quero saber mais sobre a API Oficial da Meta no Pajo: como funciona, diferença do WhatsApp Web via QR Code, o que preciso e como encaixa no atendimento/CRM. Explique de forma clara e completa.",
    support:
      "Quero saber mais sobre o suporte / pós-venda / como vocês acompanham após a compra. Explique de forma clara.",
    pricing:
      "Quero saber mais sobre preços e condições comerciais documentadas. Responda só com o que estiver nas fontes.",
    source_code:
      "Quero saber mais sobre o código-fonte, o que vem incluso e white-label. Explique de forma clara.",
    install:
      "Quero saber mais sobre instalação e como colocar o sistema no ar. Explique de forma clara.",
    hosting:
      "Quero saber mais sobre hospedagem / VPS / requisitos do servidor. Explique de forma clara.",
    features:
      "Quero saber mais sobre as funcionalidades do Pajo CRM. Explique o essencial de forma clara.",
    system:
      "Quero saber mais sobre o sistema / plataforma Pajo. Explique de forma clara.",
    technical:
      "Quero um pouco mais de detalhe técnico sobre o que perguntei. Explique com base nas fontes.",
    free_trial:
      "Quero saber mais sobre teste / demonstração. Explique o que estiver documentado.",
    settings:
      "Quero saber mais sobre configurações do sistema. Explique de forma clara.",
    inventory: raw,
    other_question:
      "Quero que você aprofunde a resposta anterior com mais detalhes úteis, com base nas fontes (FAQ/documentos/regras)."
  };
  return map[k] || map.other_question;
}
