import { randomString } from "../../utils/randomCode";

export type AutomationChannel = "instagram" | "facebook" | "whatsapp";

export type AutomationBind =
  | "welcome"
  | "keyword"
  | "ig_comment_reply"
  | "ig_comment_dm";

export interface AutomationTemplateDef {
  id: string;
  name: string;
  defaultMessage: string;
  defaultPhrase?: string;
  channels: AutomationChannel[];
  bind: AutomationBind;
  /** Quando true, o texto do fluxo vira instrução para a IA responder o comentário. */
  useAi?: boolean;
}

export const AUTOMATION_TEMPLATES: AutomationTemplateDef[] = [
  {
    id: "ig_follow_dm",
    name: "Começou a seguir no Instagram → DM",
    defaultMessage:
      "Oi! Vi que você chegou aqui. Obrigada por seguir — em que posso te ajudar?",
    channels: ["instagram"],
    bind: "welcome"
  },
  {
    id: "ig_comment_dm",
    name: "Comentário no post Instagram → DM",
    defaultMessage:
      "VBSolution CRM – resposta automática ao comentário GUIA 001.",
    defaultPhrase: "GUIA",
    channels: ["instagram"],
    bind: "ig_comment_dm"
  },
  {
    id: "ig_comment_reply",
    name: "Responder comentário no Instagram",
    defaultMessage:
      "Obrigada pelo comentário, {{username}}! Já te respondo por aqui.",
    channels: ["instagram"],
    bind: "ig_comment_reply"
  },
  {
    id: "ig_comment_ai_reply",
    name: "Responder comentário no Instagram com IA",
    defaultMessage:
      "Você é o atendimento da marca no Instagram. Responda o comentário público de forma curta, amigável e em português do Brasil. Não invente promoções nem dados.",
    channels: ["instagram"],
    bind: "ig_comment_reply",
    useAi: true
  },
  {
    id: "fb_first_dm",
    name: "Primeira mensagem no Facebook → Messenger",
    defaultMessage:
      "Olá! Obrigada por escrever. Como posso te ajudar hoje?",
    channels: ["facebook"],
    bind: "welcome"
  },
  {
    id: "ig_fb_welcome",
    name: "Primeira DM no Instagram e no Facebook",
    defaultMessage:
      "Oi! Que bom ter você por aqui. Me conta como posso ajudar?",
    channels: ["instagram", "facebook"],
    bind: "welcome"
  },
  {
    id: "ig_keyword_dm",
    name: "Palavra-chave na DM do Instagram",
    defaultMessage: "Recebi sua mensagem! Já te respondo por aqui.",
    defaultPhrase: "oi",
    channels: ["instagram"],
    bind: "keyword"
  },
  {
    id: "fb_keyword_dm",
    name: "Palavra-chave no Messenger",
    defaultMessage: "Recebi sua mensagem! Já te respondo por aqui.",
    defaultPhrase: "oi",
    channels: ["facebook"],
    bind: "keyword"
  },
  {
    id: "wa_first_msg",
    name: "Primeira mensagem no WhatsApp",
    defaultMessage:
      "Olá! Obrigada por nos chamar. Em que posso ajudar?",
    channels: ["whatsapp"],
    bind: "welcome"
  }
];

export const getAutomationTemplate = (
  templateId: string
): AutomationTemplateDef | undefined =>
  AUTOMATION_TEMPLATES.find(item => item.id === templateId);

export const buildSimpleMessageFlow = (
  messageText: string,
  opts?: { useAi?: boolean; igCommentKeyword?: string }
) => {
  const startId = "1";
  const messageId = randomString(18);
  const text = (messageText || "").trim() || "Olá! Como posso ajudar?";
  const keyword = String(opts?.igCommentKeyword || "").trim();

  const meta: Record<string, unknown> = {};
  if (opts?.useAi) meta.igCommentUseAi = true;
  if (keyword) meta.igCommentKeyword = keyword;

  return {
    meta: Object.keys(meta).length ? meta : undefined,
    nodes: [
      {
        id: startId,
        position: { x: 80, y: 180 },
        data: { label: "Inicio do fluxo" },
        type: "start"
      },
      {
        id: messageId,
        position: { x: 360, y: 180 },
        data: { label: text },
        type: "message"
      }
    ],
    connections: [
      {
        id: `e-${startId}-${messageId}`,
        source: startId,
        target: messageId,
        sourceHandle: null,
        targetHandle: null
      }
    ]
  };
};
