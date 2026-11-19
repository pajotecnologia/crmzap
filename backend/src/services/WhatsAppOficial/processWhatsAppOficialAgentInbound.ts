import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import ShowPromptService from "../PromptServices/ShowPromptService";
import {
  resolveConnectionAgentFromWhatsapp,
  whatsappHasConnectionAgent,
  isSyntheticAnthropicPromptId
} from "../../providers/anthropic/services/resolveConnectionAgent";
import { isHumanAttendantTicket } from "../../helpers/ticketHumanAccept";
import { onAgentUserInboundText } from "../AgentProactiveServices/onUserInboundAgent";
import { syncTicketConnectionAiContext } from "../../helpers/syncTicketConnectionAiContext";
import { updateAgentConversationalMemory } from "../../helpers/agentConversationalMemory";
import {
  enqueueAgentInboundJob,
  isAgentInboundQueueEnabled
} from "../PromptServices/AgentInboundQueueService";
import { agentInboundQueue } from "../../queues";
import {
  isAgentLlmFirstRuntimeEnabled,
  runAgentOrchestrator,
  runProviderDirectReplyFallback
} from "../PromptServices/AgentOrchestratorService";
import {
  clearStaleAgentProcessingLock,
  isAgentProcessingLockActive,
  markAgentProcessingFinished,
  markAgentProcessingStarted
} from "../PromptServices/AgentProcessingStateService";
import {
  classifyAgentOutbound,
  filterIntentsToEnabledSmartActions,
  registerPendingIntents,
  shouldRunSmartActionTriggersForPrompt
} from "../PromptServices/IntentTriggerEngine";
import { resolvePendingIntents } from "../PromptServices/PendingIntentResolver";
import { sanitizeAgentCustomerVisibleText } from "../../helpers/sanitizeAgentCustomerVisibleText";
import { tryHandlePromptAttendanceFlowTurn } from "../PromptServices/AttendanceFlowTurnService";
import {
  buildAttendanceFlowLlmAnchor,
  normalizeAttendanceFlowMemory
} from "../../helpers/agentAttendanceFlowMemory";
import { normalizeTicketDataWebhook } from "../AgentProactiveServices/agentProactiveTicketState";
import { deliverWhatsAppOficialAgentReply } from "./deliverWhatsAppOficialAgentReply";
import {
  buildOficialAttendanceWbot,
  buildOficialStubMsg,
  promptHasAttendanceFlowScript
} from "./oficialAgentAttendanceStub";
import {
  softDeclineReplyIfNeeded,
  tryOficialInventoryEarly,
  tryOficialInventoryLate,
  tryOficialScheduleMeeting,
  tryOficialSendGeminiImages,
  tryOficialSoftDeclineFallback
} from "./oficialAgentParitySteps";
import { restoreOficialRoteiroLlmFlagsAfterReload } from "./oficialRoteiroParity";
import { markTicketUnderAgentAttendance } from "../TicketServices/markTicketUnderAgentAttendance";
import Message from "../../models/Message";
import logger from "../../utils/logger";
import OpenAI from "openai";
import { readPromptScriptContext } from "../../helpers/scriptContextGate";
import {
  appendSideQuestResumeHint,
  classifyCustomerSideQuest,
  expandPausedSideQuestUserText,
  looksLikeBareAffirmationOrAck,
  userMessageLooksLikeSideQuest
} from "../../helpers/customerSideQuestIntent";
import PromptFaqItem from "../../models/PromptFaqItem";
import { loadPromptKnowledgeContext } from "../../helpers/loadPromptKnowledgeContext";
import { buildAgentKnowledgeRuntime } from "../PromptServices/AgentKnowledgeRuntimeService";
import { createOpenAiAgentResponse } from "../OpenAI/OpenAiResponsesService";
import {
  buildSoftDeclineDeferralReply,
  userExpressesSoftDeclineOrDeferral
} from "../../helpers/assistantUserDeclineIntent";
import type { GeminiParsedImage } from "../../providers/gemini/utils/parseGeminiResponse";

function buildAgentSystemPrompt(prompt: any, ticket?: Ticket): string {
  const scriptContext = readPromptScriptContext(prompt);
  const parts = [
    String(prompt.prompt || "").trim(),
    String(prompt.attendanceScript || "").trim(),
    String(prompt.role || prompt.cargo || "").trim()
  ].filter(Boolean);

  const flowAnchor = ticket
    ? buildAttendanceFlowLlmAnchor(ticket, Number(prompt.id))
    : "";

  const header = [
    "Você é o agente de atendimento configurado no CRM.",
    "O roteiro é orientação comercial — NÃO é sequência rígida nem obrigatória.",
    "Prioridade: ENTENDER A MENSAGEM → IDENTIFICAR A INTENÇÃO → RESPONDER À SOLICITAÇÃO → CONTINUAR O ROTEIRO SÓ SE FIZER SENTIDO.",
    "Se o cliente perguntar sobre sistema, suporte, preços, funcionalidades, API, instalação, hospedagem, código-fonte, teste grátis, configurações ou dúvida técnica: responda isso primeiro com FAQ/base/regras. NÃO ignore e NÃO repita a etapa já enviada.",
    "Não invente identidade genérica. Use a persona do agente. Português do Brasil."
  ];

  if (scriptContext) {
    header.push(
      "",
      "CONTEXTO DO ROTEIRO (quando usar o roteiro vs outras personalizações):",
      scriptContext.slice(0, 2500)
    );
  }

  if (flowAnchor) {
    header.push("", flowAnchor.slice(0, 3500));
  }

  if (!parts.length) {
    return [...header, "", "Responda em português do Brasil."].join("\n");
  }
  return [...header, "", parts.join("\n\n")].join("\n");
}

/** Prompt side-quest para fallbacks OpenAI/direct — inclui Regras Gerais. */
function buildSideQuestSystemPrompt(
  prompt: any,
  knowledgeBlock?: string,
  userText?: string
): string {
  return buildSalesSideQuestSystemPrompt({
    prompt,
    userText: String(userText || ""),
    rulesText: promptRulesTextForKnowledge(prompt),
    scriptContext: readPromptScriptContext(prompt),
    sourcesForLlm: String(knowledgeBlock || "")
  });
}

/** Extrai Regras Gerais comerciais (identidade/vendedor) sem blocos de roteiro/treino. */
function promptRulesTextForKnowledge(prompt: any): string {
  const raw = String(prompt?.prompt || "").trim();
  let rules = raw;

  // Preferir seção explícita de Regras Gerais / Identidade
  const sectionMatch = raw.match(
    /(?:^|\n)\s*(?:#{1,3}\s*)?(?:REGRAS\s+GERAIS|IDENTIDADE\s+DO\s+AGENTE|1\.\s*OBJETIVO\s+PRINCIPAL)[\s\S]{200,20000}?(?=(?:\n\s*#{1,3}\s*(?:ROTEIRO|FAQ|BASE\s+DE\s+CONHECIMENTO|ETAPA|PASSO)\b)|$)/i
  );
  if (sectionMatch?.[0]) {
    rules = sectionMatch[0].trim();
  }

  rules = rules
    .replace(
      /(?:^|\n)\s*#{0,3}\s*(?:ETAPA|PASSO|ROTEIRO|RESPOSTA|Mensagem|EXEMPLO DE RESPOSTA)\b[\s\S]{0,4000}?(?=(?:\n\s*#{0,3}\s*(?:ETAPA|PASSO|REGRAS|FAQ|BASE|IDENTIDADE)|$))/gi,
      "\n"
    )
    .replace(
      /(?:diretrizes de interpreta[cç][aã]o|sem t[ií]tulos de se[cç][aã]o|colar o roteiro|um turno\s*=\s*uma etapa)[\s\S]{0,800}/gi,
      " "
    )
    .replace(/(?:^|\n)\s*---+\s*(?:\n|$)/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/:contentReference\[[^\]]*\]\{[^}]*\}/g, "")
    .trim()
    .slice(0, 14000);

  const role = String(prompt?.role || "").trim().slice(0, 1500);
  return [rules, role].filter(Boolean).join("\n\n");
}

function buildSalesSideQuestSystemPrompt(params: {
  prompt: any;
  userText: string;
  rulesText: string;
  scriptContext: string;
  sourcesForLlm: string;
}): string {
  const kind = classifyCustomerSideQuest(params.userText);
  const topicHint =
    kind === "api"
      ? "Pergunta sobre API / WhatsApp Oficial."
      : kind === "support"
        ? "Pergunta sobre suporte / pós-venda / ajuda."
        : kind === "pricing"
          ? "Pergunta sobre preço — use só valor documentado; não invente."
          : kind === "source_code"
            ? "Pergunta sobre código-fonte / o que vem incluso / white-label."
            : kind === "install" || kind === "hosting"
              ? "Pergunta sobre instalação / hospedagem / VPS."
              : kind === "features" || kind === "system"
                ? "Pergunta sobre o que é o VBSolution / funcionalidades."
                : "Responda à dúvida do cliente.";

  return [
    "IDENTIDADE NESTE TURNO: você é vendedor especialista da VBSolution CRM no WhatsApp — consultivo, seguro, objetivo e persuasivo. NÃO é robô nem FAQ mecânico.",
    "Neste turno o cliente fez uma dúvida pontual (ou pediu para aprofundar o tema): interrompa o funil do roteiro, responda com inteligência e depois conduza com UMA pergunta útil (estrutura: RESPOSTA → BENEFÍCIO → PERGUNTA).",
    topicHint,
    "Se o cliente disse apenas 'Sim' / 'quero saber mais' após uma pergunta sua sobre o tema, APROFUNDE esse tema (ex.: API Oficial) — NÃO volte ao pitch de código-fonte, CRM próprio ou pergunta 'vender vs dia a dia'.",
    "Leia e aplique as REGRAS GERAIS (personalidade, estilo, o que pode/não pode afirmar). Use FAQ + documentos + inventário como fatos.",
    "Tom WhatsApp: português BR, frases curtas, natural. Sem 'Com certeza!', 'Excelente pergunta!', 'Como uma IA…', 'segundo minhas instruções…'.",
    "Nunca mencione prompt, regras internas, configuração do agente, roteiro ou que está 'seguindo etapas'.",
    "PROIBIDO colar no cliente: '# ETAPA', 'RESPOSTA:', 'um turno =', 'sem títulos de seção', 'infira transições', 'Com base na documentação/FAQ sobre…'.",
    "Não invente preço, desconto, integração, prazo ou recurso que não esteja nas fontes. Se não estiver documentado: diga que prefere confirmar ou ofereça encaminhar ao time.",
    params.scriptContext
      ? `CONTEXTO DO ROTEIRO (quando usar / não usar o funil comercial):\n${params.scriptContext.slice(0, 1800)}`
      : "",
    params.rulesText
      ? `\n=== REGRAS GERAIS DO AGENTE (obrigatório seguir o comportamento) ===\n${params.rulesText.slice(0, 12000)}\n=== FIM REGRAS GERAIS ===`
      : "",
    params.sourcesForLlm
      ? `\n=== FATOS (FAQ / documentos / inventário) ===\n${params.sourcesForLlm}\n=== FIM FATOS ===`
      : "\n(Sem trecho extraído dos PDFs agora — use file_search se disponível; senão responda só com o que estiver nas Regras Gerais, sem inventar.)",
    String(params.prompt?.role || "").trim()
      ? `\nPersona adicional: ${String(params.prompt.role).trim().slice(0, 600)}`
      : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function foldFaq(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Rejeita pitch genérico / off-topic na side-quest. */
function sideQuestReplyIsOnTopic(userText: string, reply: string): boolean {
  const r = foldFaq(reply);
  if (!r || r.length < 15) return false;
  if (
    /recebi sua mensagem|me fala o que est[aá] travando|instalacao,?\s*marca e recorrencia|garantir sua vaga|vender para seus proprios clientes|usar no seu dia a dia|pode me encaminhar suas duvidas/.test(
      r
    )
  ) {
    return false;
  }
  const kind = classifyCustomerSideQuest(userText);
  if (kind === "api") {
    return /\b(api|webhook|cloud|meta|oficial|integracao|endpoint|baileys)\b/.test(r);
  }
  if (kind === "support") {
    return /\b(suporte|atendimento|ajuda|helpdesk|sac|assistencia)\b/.test(r);
  }
  if (kind === "pricing") {
    return /\b(preco|valor|plano|r\$|mensalidade|investimento|custa)\b/.test(r);
  }
  if (kind === "source_code") {
    return /\b(codigo|fonte|repositorio|github|incluso|inclui|pacote)\b/.test(r);
  }
  if (kind === "install" || kind === "hosting") {
    return /\b(instal|hospeda|servidor|vps|deploy|docker|nuvem)\b/.test(r);
  }
  if (kind === "features" || kind === "system") {
    return /\b(sistema|crm|vbsolution|funciona|recurso|modulo|plataforma)\b/.test(r);
  }
  return true;
}

async function replyFromPromptFaq(params: {
  prompt: any;
  ticket: Ticket;
  userText: string;
}): Promise<string> {
  try {
    const rows = await PromptFaqItem.findAll({
      where: {
        promptId: Number(params.prompt.id),
        companyId: params.ticket.companyId
      },
      order: [
        ["priority", "DESC"],
        ["id", "ASC"]
      ],
      limit: 80
    });
    if (!rows.length) return "";

    const u = foldFaq(params.userText);
    const kind = classifyCustomerSideQuest(params.userText);
    const words = u
      .split(/[^a-z0-9]+/)
      .filter(w => w.length > 2)
      .filter(w => !/^(tem|uma|para|como|qual|sobre|isso|este|esta|com|sem)$/.test(w));

    let best: { score: number; answer: string } | null = null;
    for (const row of rows) {
      const q = foldFaq(row.question);
      const a = String(row.answer || "").trim();
      if (!q || !a) continue;
      let score = 0;
      if (u.includes(q.slice(0, Math.min(40, q.length))) || q.includes(u.slice(0, 40))) {
        score += 5;
      }
      for (const w of words) {
        if (q.includes(w)) score += 1.5;
        if (foldFaq(a).includes(w)) score += 0.5;
      }
      if (/\bapi\b/.test(u) && /\bapi\b/.test(q)) score += 5;
      if (/\bsuporte\b/.test(u) && /\bsuporte\b/.test(q)) score += 5;
      if (/\bduvidas?\b/.test(u) && /\b(duvida|suporte|instalacao|marca|recorrencia|ajuda)\b/.test(q)) {
        score += 4;
      }
      if (
        /\b(instalacao|marca|recorrencia)\b/.test(u) &&
        /\b(instalacao|marca|recorrencia)\b/.test(q)
      ) {
        score += 3;
      }
      if (kind === "api" && !/\bapi\b/.test(q) && !/\bapi\b/.test(foldFaq(a))) {
        continue;
      }
      if (
        kind === "support" &&
        !/\b(suporte|atendimento|ajuda|duvida|instalacao|marca|recorrencia)\b/.test(
          `${q} ${foldFaq(a)}`
        )
      ) {
        continue;
      }
      if (score >= 3 && (!best || score > best.score)) {
        best = { score, answer: a };
      }
    }
    if (!best) return "";
    const safe = sanitizeAgentCustomerVisibleText(best.answer);
    if (!sideQuestReplyIsOnTopic(params.userText, safe)) return "";
    return appendSideQuestResumeHint(safe);
  } catch (e: any) {
    logger.warn(
      `[WA-OFICIAL-AGENT] FAQ side-quest ticket=${params.ticket.id}: ${e?.message || e}`
    );
    return "";
  }
}

function buildSideQuestHardFallback(userText: string, hadDocs: boolean): string {
  const kind = classifyCustomerSideQuest(userText);
  if (kind === "api") {
    if (/saber mais|explique|como funciona|diferenca|oficial da meta/i.test(userText)) {
      return "A API Oficial da Meta conecta o WhatsApp Cloud API ao CRM: filas, histórico, templates e atendimento centralizado. O WhatsApp Web via QR Code é a outra opção, mais rápida de conectar.\n\nA aprovação do número depende da Meta — a gente te guia no processo. Quer que eu te explique o caminho de ativação ou como a equipe usa isso no dia a dia?";
    }
    return "Sim. O VBSolution trabalha com WhatsApp Web via QR Code e também com a API Oficial da Meta, para centralizar os atendimentos no CRM.\n\nVocê quer entender mais a parte da API Oficial ou como encaixa no seu atendimento?";
  }
  if (kind === "support") {
    return "Sim — a gente acompanha no pós-venda e na implantação. Me conta o que você precisa (instalação, API, uso do CRM ou outra dúvida) que eu te oriento com precisão.";
  }
  if (kind === "source_code") {
    return "O código-fonte do VBSolution permite instalar, personalizar com a sua marca e evoluir o sistema. Você está pensando em usar internamente ou também revender?";
  }
  if (kind === "features" || kind === "system") {
    return "O VBSolution CRM reúne atendimento, vendas, tarefas, campanhas e agentes de IA em um só lugar. O que você mais precisa resolver hoje: WhatsApp, funil de vendas ou automação com IA?";
  }
  return hadDocs
    ? "Posso te explicar com base no material do produto. Me diga o ponto principal da sua dúvida que eu respondo direto."
    : "Me conta o que você quer saber (API, suporte, preço, código-fonte ou instalação) que eu te respondo de forma direta.";
}

/**
 * Resposta side-quest: Regras Gerais (vendedor) + docs/FAQ → resposta humana.
 * Nunca envia texto interno de prompt ao cliente.
 */
async function runSideQuestKnowledgeReply(params: {
  prompt: any;
  ticket: Ticket;
  contact: Contact;
  userText: string;
}): Promise<string> {
  const apiKey = String(params.prompt?.apiKey || "").trim();
  const rulesText = promptRulesTextForKnowledge(params.prompt);
  const scriptContext = readPromptScriptContext(params.prompt);

  const knowledge = await loadPromptKnowledgeContext({
    promptId: Number(params.prompt.id),
    companyId: params.ticket.companyId,
    userText: params.userText,
    maxChars: 36000,
    promptRulesText: "" // fatos = FAQ/docs; regras vão no system à parte
  });

  const excerpts = (knowledge.excerpts || []).filter(
    e => e.source === "faq" || e.source === "document" || e.source === "inventory"
  );
  const excerptBlock = excerpts
    .map((e, i) => `[Fonte ${i + 1}: ${e.title}]\n${e.text}`)
    .join("\n\n");

  const docBlock = String(knowledge.block || "")
    .split(/\n/)
    .filter(line => {
      const t = line.trim();
      if (!t) return true;
      if (/REGRAS GERAIS/i.test(t)) return false;
      if (
        /sem titulos de secao|colar o roteiro|um turno\s*=|infira transi|diretrizes de interpretacao|envie so mensagens naturais/i.test(
          t
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
        )
      ) {
        return false;
      }
      return true;
    })
    .join("\n")
    .replace(/REGRAS GERAIS[\s\S]*?(?=FAQ COMPLETO|DOCUMENTOS \/|$)/i, "")
    .trim();

  logger.info(
    `[WA-OFICIAL-AGENT] knowledge side-quest ticket=${params.ticket.id} faq=${knowledge.faqHits} docs=${knowledge.sourceHits} excerpts=${excerpts.length} rulesChars=${rulesText.length}`
  );

  if (!apiKey) {
    return buildSideQuestHardFallback(
      params.userText,
      knowledge.hasAnyMaterial || excerpts.length > 0 || rulesText.length > 100
    );
  }

  const knowledgeRuntime = await buildAgentKnowledgeRuntime({
    companyId: params.ticket.companyId,
    promptId: Number(params.prompt.id),
    forceForSideQuest: true
  });

  const sourcesForLlm = [
    excerptBlock ? `TRECHOS MAIS RELEVANTES:\n${excerptBlock}` : "",
    docBlock ? `BASE (FAQ + documentos):\n${docBlock.slice(0, 20000)}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");

  const system = buildSalesSideQuestSystemPrompt({
    prompt: params.prompt,
    userText: params.userText,
    rulesText,
    scriptContext,
    sourcesForLlm
  });

  try {
    const openai = new OpenAI({ apiKey });
    const result = await createOpenAiAgentResponse({
      client: openai,
      models: [
        String(params.prompt.model || "").trim() || "gpt-4o-mini",
        "gpt-4o-mini"
      ],
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            `Pergunta do cliente: ${params.userText}`,
            "Escreva só a mensagem final no WhatsApp.",
            "Formato: responda a dúvida → mostre valor em 1 frase se couber → 1 pergunta para avançar.",
            knowledgeRuntime.enabled
              ? "Se faltar fato nos trechos, use file_search nos documentos indexados."
              : ""
          ]
            .filter(Boolean)
            .join("\n")
        }
      ],
      maxTokens: Math.min(
        Math.max(Number(params.prompt.maxTokens) || 2500, 2000),
        4096
      ),
      timeoutMs: Number(process.env.AGENT_SIDE_QUEST_TIMEOUT_MS || 55000),
      temperature: 0.4,
      tools: knowledgeRuntime.enabled ? knowledgeRuntime.tools : undefined,
      preferResponses: true,
      metadata: {
        ticketId: String(params.ticket.id),
        promptId: String(params.prompt.id),
        sideQuest: "1"
      }
    });
    let text = sanitizeAgentCustomerVisibleText(String(result.content || ""));
    if (
      text &&
      (!sideQuestReplyIsOnTopic(params.userText, text) ||
        /um turno\s*=|sem t[ií]tulos de se[cç]|infira transi|com base na documenta[cç][aã]o\/faq|segundo minhas instru[cç]|sou uma (ia|intelig[eê]ncia)/i.test(
          text
        ))
    ) {
      logger.warn(
        `[WA-OFICIAL-AGENT] side-quest resposta inválida descartada ticket=${params.ticket.id}`
      );
      text = "";
    }
    if (text) return text;

    if (excerptBlock || rulesText) {
      const retry = await createOpenAiAgentResponse({
        client: openai,
        models: ["gpt-4o-mini"],
        messages: [
          {
            role: "system",
            content: [
              "Vendedor VBSolution no WhatsApp. Resposta natural, 3–6 frases.",
              "Aplique as regras gerais de tom (consultivo + fechamento suave).",
              rulesText ? `Regras:\n${rulesText.slice(0, 6000)}` : "",
              excerptBlock ? `Fatos:\n${excerptBlock.slice(0, 10000)}` : ""
            ]
              .filter(Boolean)
              .join("\n\n")
          },
          {
            role: "user",
            content: `Pergunta: ${params.userText}\nResposta (WhatsApp):`
          }
        ],
        maxTokens: 2500,
        timeoutMs: 35000,
        temperature: 0.35
      });
      text = sanitizeAgentCustomerVisibleText(String(retry.content || ""));
      if (
        text &&
        sideQuestReplyIsOnTopic(params.userText, text) &&
        !/um turno\s*=|sem t[ií]tulos|infira transi|sou uma ia/i.test(text)
      ) {
        return text;
      }
    }
  } catch (e: any) {
    logger.warn(
      `[WA-OFICIAL-AGENT] side-quest knowledge LLM ticket=${params.ticket.id}: ${
        e?.message || e
      }`
    );
  }

  return buildSideQuestHardFallback(
    params.userText,
    knowledge.hasAnyMaterial || excerpts.length > 0 || rulesText.length > 100
  );
}

async function runOpenAiOficialDirectReply(params: {
  prompt: any;
  ticket: Ticket;
  contact: Contact;
  userText: string;
  sideQuest?: boolean;
}): Promise<string> {
  const apiKey = String(params.prompt?.apiKey || "").trim();
  if (!apiKey) {
    logger.warn(
      `[WA-OFICIAL-AGENT] OpenAI direct sem apiKey promptId=${params.prompt?.id}`
    );
    return "";
  }
  const openai = new OpenAI({ apiKey });
  const maxMessages = Math.min(Number(params.prompt.maxMessages) || 10, 20);
  const history = await Message.findAll({
    where: { ticketId: params.ticket.id, companyId: params.ticket.companyId },
    order: [["createdAt", "DESC"]],
    limit: maxMessages
  });
  let systemContent = buildAgentSystemPrompt(params.prompt, params.ticket);
  if (params.sideQuest) {
    const kn = await loadPromptKnowledgeContext({
      promptId: Number(params.prompt.id),
      companyId: params.ticket.companyId,
      userText: params.userText,
      maxChars: 20000,
      promptRulesText: promptRulesTextForKnowledge(params.prompt)
    });
    systemContent = buildSideQuestSystemPrompt(
      params.prompt,
      kn.block,
      params.userText
    );
  }
  const messagesOpenAi: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [{ role: "system", content: systemContent }];
  for (const message of [...history].reverse()) {
    const line = String(message.body || "")
      .replace(/\u200e/g, "")
      .trim();
    if (!line) continue;
    messagesOpenAi.push({
      role: message.fromMe ? "assistant" : "user",
      content: line
    });
  }
  messagesOpenAi.push({
    role: "user",
    content: params.sideQuest
      ? `Responda esta dúvida do cliente (não reinicie o roteiro): ${params.userText}`
      : params.userText
  });

  const chat = await openai.chat.completions.create({
    model: String(params.prompt.model || "gpt-4o-mini"),
    messages: messagesOpenAi,
    max_tokens: Math.min(Math.max(Number(params.prompt.maxTokens) || 2500, 2000), 4096),
    temperature:
      typeof params.prompt.temperature === "number"
        ? params.prompt.temperature
        : 0.7
  });
  return String(chat?.choices?.[0]?.message?.content || "").trim();
}

async function generateOficialAgentReplyText(params: {
  prompt: any;
  ticket: Ticket;
  contact: Contact;
  userText: string;
}): Promise<{ reply: string; geminiImages: GeminiParsedImage[] }> {
  const { prompt, ticket, contact } = params;
  let userText = String(params.userText || "").trim();
  const provider = String((prompt as any).__llmProvider || "openai");
  let reply = "";
  let geminiImages: GeminiParsedImage[] = [];

  let pausedKind =
    String((ticket as any).__pausedSideQuestKind || "").trim() || null;
  try {
    const dw = normalizeTicketDataWebhook((ticket as any).dataWebhook) as any;
    const af = normalizeAttendanceFlowMemory(dw?.attendanceFlow, prompt.id);
    if (af.pausedForSideQuest && af.sideQuestKind) {
      pausedKind = pausedKind || String(af.sideQuestKind);
      (ticket as any).__pausedSideQuestKind = pausedKind;
    }
    if (
      (ticket as any).__sideQuestDeferToLlm === true ||
      af.pausedForSideQuest === true
    ) {
      if (looksLikeBareAffirmationOrAck(userText) || !classifyCustomerSideQuest(userText)) {
        userText = expandPausedSideQuestUserText(userText, pausedKind);
      }
    }
  } catch {
    if (
      (ticket as any).__sideQuestDeferToLlm === true &&
      looksLikeBareAffirmationOrAck(userText)
    ) {
      userText = expandPausedSideQuestUserText(userText, pausedKind);
    }
  }

  const sideQuest =
    (ticket as any).__sideQuestDeferToLlm === true ||
    userMessageLooksLikeSideQuest(userText);

  // Side-quest: documentos/FAQ primeiro (resposta sincera, não tangenciar)
  if (sideQuest) {
    const fromFaq = await replyFromPromptFaq({ prompt, ticket, userText });
    if (fromFaq) {
      logger.info(
        `[WA-OFICIAL-AGENT] reply via FAQ side-quest ticket=${ticket.id}`
      );
      return { reply: fromFaq, geminiImages: [] };
    }
    try {
      const fromDocs = await runSideQuestKnowledgeReply({
        prompt,
        ticket,
        contact,
        userText
      });
      if (fromDocs) {
        logger.info(
          `[WA-OFICIAL-AGENT] reply via knowledge side-quest ticket=${ticket.id}`
        );
        return { reply: fromDocs, geminiImages: [] };
      }
    } catch (e: any) {
      logger.warn(
        `[WA-OFICIAL-AGENT] knowledge side-quest ticket=${ticket.id}: ${
          e?.message || e
        }`
      );
    }
  }

  try {
    const orchestrated = await runAgentOrchestrator({
      prompt,
      ticket,
      contact,
      userText
    });
    geminiImages = Array.isArray(orchestrated.geminiImages)
      ? orchestrated.geminiImages
      : [];
    reply = softDeclineReplyIfNeeded(userText, String(orchestrated.reply || ""));
    if (reply || geminiImages.length) {
      if (!reply && userExpressesSoftDeclineOrDeferral(userText)) {
        reply = buildSoftDeclineDeferralReply(userText);
      }
      logger.info(
        `[WA-OFICIAL-AGENT] reply via orchestrator ticket=${ticket.id} provider=${provider} images=${geminiImages.length}`
      );
      return { reply, geminiImages };
    }
    logger.info(
      `[WA-OFICIAL-AGENT] orchestrator vazio ticket=${ticket.id} reason=${
        orchestrated.fallbackReason || "empty"
      }`
    );
  } catch (e: any) {
    logger.warn(
      `[WA-OFICIAL-AGENT] orchestrator erro ticket=${ticket.id}: ${e?.message || e}`
    );
  }

  try {
    let sideQuestSystem = "";
    if (sideQuest) {
      const kn = await loadPromptKnowledgeContext({
        promptId: Number(prompt.id),
        companyId: ticket.companyId,
        userText,
        maxChars: 20000,
        promptRulesText: promptRulesTextForKnowledge(prompt)
      });
      sideQuestSystem = buildSideQuestSystemPrompt(prompt, kn.block, userText);
    }
    const direct = await runProviderDirectReplyFallback({
      prompt,
      ticket,
      contact,
      userText,
      ...(sideQuest ? { systemPrompt: sideQuestSystem } : {})
    });
    if (Array.isArray(direct.geminiImages) && direct.geminiImages.length) {
      geminiImages = direct.geminiImages;
    }
    reply = softDeclineReplyIfNeeded(userText, String(direct.reply || ""));
    if (reply || geminiImages.length) {
      logger.info(
        `[WA-OFICIAL-AGENT] reply via direct ${provider} ticket=${ticket.id}`
      );
      return { reply, geminiImages };
    }
  } catch (e: any) {
    logger.warn(
      `[WA-OFICIAL-AGENT] direct ${provider} ticket=${ticket.id}: ${e?.message || e}`
    );
  }

  try {
    const openAiReply = await runOpenAiOficialDirectReply({
      prompt,
      ticket,
      contact,
      userText,
      sideQuest
    });
    reply = softDeclineReplyIfNeeded(userText, openAiReply);
    if (reply) {
      logger.info(
        `[WA-OFICIAL-AGENT] reply via openai chat ticket=${ticket.id} sideQuest=${!!sideQuest}`
      );
      return { reply, geminiImages };
    }
  } catch (e: any) {
    logger.warn(
      `[WA-OFICIAL-AGENT] openai chat ticket=${ticket.id}: ${e?.message || e}`
    );
  }

  // Paridade Baileys: NÃO despejar texto da etapa como fallback LLM
  if (sideQuest) {
    const kn = await loadPromptKnowledgeContext({
      promptId: Number(prompt.id),
      companyId: ticket.companyId,
      userText,
      maxChars: 8000,
      promptRulesText: promptRulesTextForKnowledge(prompt)
    });
    const hard = buildSideQuestHardFallback(userText, kn.hasAnyMaterial);
    logger.warn(
      `[WA-OFICIAL-AGENT] anti-silêncio side-quest ticket=${ticket.id}`
    );
    return { reply: hard, geminiImages };
  }

  if (userExpressesSoftDeclineOrDeferral(userText)) {
    const soft = buildSoftDeclineDeferralReply(userText);
    logger.warn(
      `[WA-OFICIAL-AGENT] soft-decline pós-LLM ticket=${ticket.id}`
    );
    return { reply: soft, geminiImages };
  }

  logger.error(
    `[WA-OFICIAL-AGENT] sem resposta LLM nem roteiro ticket=${ticket.id} promptId=${prompt.id}`
  );
  return { reply: "", geminiImages };
}

function isAgentProcessingActive(ticket: Ticket): boolean {
  return isAgentProcessingLockActive((ticket as any).dataWebhook);
}

/**
 * Agente de IA WhatsApp Oficial (Cloud API) — mesmo roteiro/config de /prompts
 * (igual WhatsApp Web / Instagram / Facebook / Telegram).
 */
export async function processWhatsAppOficialAgentInbound(params: {
  connection: Whatsapp;
  ticket: Ticket;
  contact: Contact;
  body: string;
  messageWid: string;
}): Promise<boolean> {
  const bodyMessage = String(params.body || "").trim();
  const messageWid = String(params.messageWid || "").trim();

  if (!bodyMessage) {
    logger.info(
      `[WA-OFICIAL-AGENT] skip sem texto ticket=${params.ticket?.id}`
    );
    return false;
  }

  let ticket =
    (await Ticket.findByPk(params.ticket.id)) || params.ticket;
  let contact =
    (await Contact.findByPk(params.contact.id)) || params.contact;

  if (contact?.disableBot) {
    logger.info(`[WA-OFICIAL-AGENT] skip disableBot contact=${contact.id}`);
    return false;
  }
  if (isHumanAttendantTicket(ticket)) {
    logger.info(
      `[WA-OFICIAL-AGENT] skip humano ticket=${ticket.id} userId=${ticket.userId}`
    );
    return false;
  }

  const status = String(ticket.status || "");
  if (!["pending", "open", "chatbot"].includes(status)) {
    logger.info(
      `[WA-OFICIAL-AGENT] skip status=${status} ticket=${ticket.id}`
    );
    return false;
  }

  // Lock órfão (ex.: crash após claim cedo) — limpa e segue; senão silêncio eterno
  try {
    await clearStaleAgentProcessingLock({ ticket });
    await ticket.reload();
  } catch {
    /* ignore */
  }

  if (isAgentProcessingActive(ticket)) {
    logger.info(
      `[WA-OFICIAL-AGENT] já processando ticket=${ticket.id} — evita duplicar`
    );
    return true;
  }

  let whatsappConn: Whatsapp = params.connection;
  try {
    whatsappConn = await ShowWhatsAppService(
      params.connection.id,
      ticket.companyId
    );
  } catch (e: any) {
    logger.warn(
      `[WA-OFICIAL-AGENT] ShowWhatsAppService falhou id=${params.connection.id}: ${e?.message}`
    );
    whatsappConn =
      (await Whatsapp.findByPk(params.connection.id)) || params.connection;
  }

  if (!whatsappHasConnectionAgent(whatsappConn)) {
    logger.info(
      `[WA-OFICIAL-AGENT] conexão sem agente whatsappId=${whatsappConn.id}`
    );
    return false;
  }

  let prompt: any;
  let llmProvider = "openai";
  try {
    const resolved = await resolveConnectionAgentFromWhatsapp(
      whatsappConn,
      ticket.companyId
    );
    if (!resolved?.prompt) {
      logger.warn(
        `[WA-OFICIAL-AGENT] resolve sem prompt ticket=${ticket.id}`
      );
      return false;
    }
    llmProvider =
      resolved.llmProvider ||
      (resolved.prompt as any).__llmProvider ||
      "openai";

    if (!isSyntheticAnthropicPromptId(Number(resolved.prompt.id))) {
      try {
        const full = await ShowPromptService({
          promptId: resolved.prompt.id,
          companyId: ticket.companyId
        });
        const plain =
          typeof (full as any).get === "function"
            ? (full as any).get({ plain: true })
            : { ...(full as any) };
        prompt = {
          ...plain,
          apiKey: resolved.prompt.apiKey || plain.apiKey,
          model: resolved.prompt.model || plain.model,
          __llmProvider: llmProvider,
          __anthropicMultiAgentId: (resolved.prompt as any)
            .__anthropicMultiAgentId
        };
      } catch {
        prompt = {
          ...resolved.prompt,
          __llmProvider: llmProvider
        };
      }
    } else {
      prompt = {
        ...resolved.prompt,
        __llmProvider: llmProvider
      };
    }
  } catch (e: any) {
    logger.error(
      `[WA-OFICIAL-AGENT] resolve agente ticket=${ticket.id}: ${e?.message || e}`
    );
    return false;
  }

  try {
    // Igual WhatsApp Web: permanece pending/Aguardando até o agente ENVIAR resposta
    // (markTicketUnderAgentAttendance). Só marca isBot/useIntegration aqui.
    await ticket.update({
      useIntegration: true,
      isBot: true,
      userId: null,
      channel: ticket.channel || "whatsapp_oficial",
      whatsappId: ticket.whatsappId || whatsappConn.id
    });
    await ticket.reload();
  } catch (e: any) {
    logger.warn(
      `[WA-OFICIAL-AGENT] ticket state ticket=${ticket.id}: ${e?.message || e}`
    );
  }

  (ticket as any).whatsapp = whatsappConn;
  (ticket as any).contact = contact;
  (ticket as any).promptId = prompt.id;
  (ticket as any).__agentOutboundPrompt = prompt;

  try {
    await onAgentUserInboundText(ticket, bodyMessage);
  } catch {
    /* ignore */
  }

  try {
    await syncTicketConnectionAiContext(ticket, prompt.id);
  } catch (e: any) {
    logger.warn(
      `[WA-OFICIAL-AGENT] sync context ticket=${ticket.id}: ${e?.message || e}`
    );
  }

  try {
    await updateAgentConversationalMemory({
      ticket,
      promptId: prompt.id,
      userText: bodyMessage
    });
  } catch (e) {
    logger.warn(
      `[WA-OFICIAL-AGENT] memória conversacional ticket=${ticket.id}:`,
      e as any
    );
  }

  logger.info(
    `[WA-OFICIAL-AGENT] processando ticket=${ticket.id} promptId=${prompt.id} provider=${llmProvider} recipient=${contact.number}`
  );

  if (messageWid) {
    (ticket as any).__lastInboundWamid = messageWid;
  }
  (ticket as any).__oficialTypingSentForTurn = false;

  // Digitando… assim que o agente começa a processar
  if (messageWid) {
    try {
      const { sendMetaCloudTypingIndicator } = await import(
        "./sendMetaCloudTypingIndicator"
      );
      await sendMetaCloudTypingIndicator({
        whatsapp: whatsappConn,
        messageId: messageWid
      });
      (ticket as any).__oficialTypingSentForTurn = true;
    } catch (e: any) {
      logger.warn(
        `[WA-OFICIAL-AGENT] typing inicial falhou ticket=${ticket.id}: ${e?.message || e}`
      );
    }
  }

  await markAgentProcessingStarted({
    ticket,
    promptId: prompt.id,
    wid: messageWid || null,
    userText: bodyMessage
  });

  let replied = false;
  let flowEarly: Awaited<
    ReturnType<typeof tryHandlePromptAttendanceFlowTurn>
  > | null = null;

  try {
    if (await shouldRunSmartActionTriggersForPrompt(prompt, ticket)) {
      try {
        const r = await resolvePendingIntents(
          ticket,
          contact,
          prompt,
          bodyMessage
        );
        if (r.handled) {
          const safeIntentMessage = sanitizeAgentCustomerVisibleText(
            String(r.message || "")
          );
          if (safeIntentMessage) {
            const n = await deliverWhatsAppOficialAgentReply({
              connection: whatsappConn,
              ticket,
              contact,
              prompt,
              text: safeIntentMessage
            });
            replied = n > 0;
            await markAgentProcessingFinished({
              ticket,
              promptId: prompt.id,
              wid: messageWid || null,
              ok: replied
            });
            return replied;
          }
          logger.warn(
            `[WA-OFICIAL-AGENT] intent handled sem texto ticket=${ticket.id} — segue roteiro/LLM`
          );
        }
      } catch (e) {
        logger.warn(
          `[WA-OFICIAL-AGENT] intents ticket=${ticket.id}:`,
          e as any
        );
      }
    }

    const parityCtx = {
      connection: whatsappConn,
      ticket,
      contact,
      prompt,
      userText: bodyMessage,
      messageWid
    };

    // Inventário ANTES do roteiro (paridade handleOpenAi — schedule fica depois do LLM)
    const invEarly = await tryOficialInventoryEarly(parityCtx);
    if (invEarly.handled && invEarly.replied) {
      await markAgentProcessingFinished({
        ticket,
        promptId: prompt.id,
        wid: messageWid || null,
        ok: true
      });
      return true;
    }

    // 1) Roteiro visual ANTES da fila — igual handleOpenAi (WhatsApp Web)
    try {
      const ofcWbot = buildOficialAttendanceWbot({
        connection: whatsappConn,
        ticket,
        contact,
        inboundMessageId: messageWid
      });
      const stubMsg = buildOficialStubMsg(contact, messageWid);
      flowEarly = await tryHandlePromptAttendanceFlowTurn({
        wbot: ofcWbot as any,
        msg: stubMsg,
        ticket,
        contact,
        ticketTraking: undefined,
        prompt,
        bodyMessage
      });
      if (
        flowEarly.handled &&
        (Number(flowEarly.sentCount) > 0 || Number(flowEarly.actionCount) > 0)
      ) {
        if (Number(flowEarly.sentCount) > 0) {
          await markTicketUnderAgentAttendance(ticket);
        }
        logger.info(
          `[WA-OFICIAL-AGENT] roteiro enviou ticket=${ticket.id} sent=${flowEarly.sentCount} reason=${flowEarly.reason}`
        );
        await markAgentProcessingFinished({
          ticket,
          promptId: prompt.id,
          wid: messageWid || null,
          ok: true
        });
        return true;
      }
      // Dedup inbound / consumed sem LLM — não gerar segunda bolha
      if (
        flowEarly.reason === "dedup_inbound" ||
        (flowEarly.consumedReply && flowEarly.allowLlmFallback === false)
      ) {
        logger.info(
          `[WA-OFICIAL-AGENT] skip LLM (dedup/consumed) ticket=${ticket.id} reason=${flowEarly.reason}`
        );
        await markAgentProcessingFinished({
          ticket,
          promptId: prompt.id,
          wid: messageWid || null,
          ok: true
        });
        return true;
      }
      if (flowEarly.consumedReply && flowEarly.allowLlmFallback) {
        logger.info(
          `[WA-OFICIAL-AGENT] roteiro cedeu ao LLM ticket=${ticket.id} reason=${flowEarly.reason}`
        );
      }
      try {
        await ticket.reload();
      } catch {
        /* ignore */
      }
      restoreOficialRoteiroLlmFlagsAfterReload({
        ticket,
        promptId: prompt.id,
        bodyMessage,
        flowEarly
      });
    } catch (flowErr: any) {
      logger.warn(
        `[WA-OFICIAL-AGENT] attendance flow ticket=${ticket.id}: ${
          flowErr?.message || flowErr
        }`
      );
    }

    /**
     * Fila assíncrona só sem roteiro visual (igual WhatsApp Web).
     * Com roteiro, resposta deve ser síncrona etapa a etapa.
     */
    const hasFlowScript = promptHasAttendanceFlowScript(prompt);
    if (
      isAgentInboundQueueEnabled() &&
      agentInboundQueue &&
      isAgentLlmFirstRuntimeEnabled() &&
      messageWid &&
      !flowEarly?.consumedReply &&
      !hasFlowScript
    ) {
      const queued = await enqueueAgentInboundJob(agentInboundQueue, {
        companyId: ticket.companyId,
        ticketId: ticket.id,
        whatsappId: whatsappConn.id,
        promptId: prompt.id,
        wid: messageWid,
        enqueuedAt: new Date().toISOString(),
        userText: bodyMessage,
        contactId: contact.id,
        channel: "whatsapp_oficial"
      });
      if (queued) {
        logger.info(
          `[WA-OFICIAL-AGENT] enfileirado ticket=${ticket.id} wid=${messageWid}`
        );
        await markAgentProcessingFinished({
          ticket,
          promptId: prompt.id,
          wid: messageWid || null,
          ok: true
        });
        return true;
      }
    }

    const generated = await generateOficialAgentReplyText({
      prompt,
      ticket,
      contact,
      userText: bodyMessage
    });
    let reply = String(generated.reply || "");
    const geminiImages = generated.geminiImages || [];

    const isSideQuestTurn =
      (ticket as any).__sideQuestDeferToLlm === true ||
      userMessageLooksLikeSideQuest(bodyMessage) ||
      flowEarly?.reason === "side_quest_llm_fallback" ||
      flowEarly?.reason === "script_context_yield_llm" ||
      flowEarly?.reason === "script_context_block_start";

    if (!reply && isSideQuestTurn) {
      try {
        const kn = await loadPromptKnowledgeContext({
          promptId: Number(prompt.id),
          companyId: ticket.companyId,
          userText: bodyMessage,
          maxChars: 4000,
          promptRulesText: promptRulesTextForKnowledge(prompt)
        });
        reply = buildSideQuestHardFallback(bodyMessage, kn.hasAnyMaterial);
      } catch {
        reply = buildSideQuestHardFallback(bodyMessage, false);
      }
      logger.warn(
        `[WA-OFICIAL-AGENT] reply vazio — forçando anti-silêncio ticket=${ticket.id}`
      );
    }

    if (reply) {
      if (await shouldRunSmartActionTriggersForPrompt(prompt, ticket)) {
        try {
          const cls = await classifyAgentOutbound(reply, prompt, ticket);
          const enabledIntents = await filterIntentsToEnabledSmartActions(
            cls.intents,
            prompt,
            ticket.companyId
          );
          if (enabledIntents.length) {
            await registerPendingIntents(ticket, enabledIntents);
          }
        } catch (e) {
          logger.warn(
            `[WA-OFICIAL-AGENT] classifier ticket=${ticket.id}:`,
            e as any
          );
        }
      }

      const n = await deliverWhatsAppOficialAgentReply({
        connection: whatsappConn,
        ticket,
        contact,
        prompt,
        text: reply
      });
      replied = n > 0;
      // Se o guard bloqueou tudo em side-quest, tenta fallback curto diferente
      if (!replied && isSideQuestTurn) {
        const alt = buildSideQuestHardFallback(bodyMessage, true);
        const n2 = await deliverWhatsAppOficialAgentReply({
          connection: whatsappConn,
          ticket,
          contact,
          prompt,
          text: alt
        });
        replied = n2 > 0;
        logger.warn(
          `[WA-OFICIAL-AGENT] reenvio anti-silêncio após guard ticket=${ticket.id} ok=${replied}`
        );
      }
      logger.info(
        `[WA-OFICIAL-AGENT] enviado ticket=${ticket.id} bubbles=${n} replied=${replied}`
      );
    }

    if (geminiImages.length) {
      const imgSent = await tryOficialSendGeminiImages({
        ctx: parityCtx,
        images: geminiImages,
        caption: reply || undefined
      });
      if (imgSent > 0) replied = true;
    }

    // Fallbacks pós-LLM iguais ao Baileys: soft-decline + inventário late + schedule
    if (!replied) {
      const soft = await tryOficialSoftDeclineFallback(parityCtx);
      if (soft.replied) {
        replied = true;
      }
    }
    if (!replied) {
      const invLate = await tryOficialInventoryLate(parityCtx);
      if (invLate.replied) {
        replied = true;
      }
    }
    // tryScheduleMeeting só depois do roteiro/LLM (igual handleOpenAi)
    if (!replied) {
      const scheduled = await tryOficialScheduleMeeting(parityCtx);
      if (scheduled.replied) {
        replied = true;
      }
    }

    // Anti-silêncio final: nunca terminar o turno sem bolha (paridade Baileys)
    if (!replied) {
      const hard =
        isSideQuestTurn
          ? buildSideQuestHardFallback(bodyMessage, true)
          : "Desculpe, tive uma instabilidade agora. Pode repetir sua mensagem em uma frase?";
      try {
        const n = await deliverWhatsAppOficialAgentReply({
          connection: whatsappConn,
          ticket,
          contact,
          prompt,
          text: hard
        });
        replied = n > 0;
        logger.warn(
          `[WA-OFICIAL-AGENT] anti-silêncio final ticket=${ticket.id} ok=${replied}`
        );
      } catch (e: any) {
        logger.error(
          `[WA-OFICIAL-AGENT] anti-silêncio final falhou ticket=${ticket.id}: ${
            e?.message || e
          }`
        );
      }
    }

    await markAgentProcessingFinished({
      ticket,
      promptId: prompt.id,
      wid: messageWid || null,
      ok: replied
    });
  } catch (e: any) {
    await markAgentProcessingFinished({
      ticket,
      promptId: prompt.id,
      wid: messageWid || null,
      ok: false,
      error: e
    });
    logger.error(
      `[WA-OFICIAL-AGENT] erro ticket=${ticket.id}: ${e?.message || e}`
    );
  }

  return replied;
}
