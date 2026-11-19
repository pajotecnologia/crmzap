jest.mock("../models/Ticket", () => ({
  __esModule: true,
  default: { findByPk: jest.fn() }
}));
jest.mock("../models/Contact", () => ({
  __esModule: true,
  default: { findByPk: jest.fn() }
}));
jest.mock("../models/Whatsapp", () => ({
  __esModule: true,
  default: { findByPk: jest.fn() }
}));
jest.mock("../services/WhatsappService/ShowWhatsAppService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../services/PromptServices/ShowPromptService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../providers/anthropic/services/resolveConnectionAgent", () => ({
  resolveConnectionAgentFromWhatsapp: jest.fn(),
  whatsappHasConnectionAgent: jest.fn().mockReturnValue(true),
  isSyntheticAnthropicPromptId: jest.fn().mockReturnValue(false)
}));
jest.mock("../helpers/ticketHumanAccept", () => ({
  isHumanAttendantTicket: jest.fn().mockReturnValue(false)
}));
jest.mock("../services/AgentProactiveServices/onUserInboundAgent", () => ({
  onAgentUserInboundText: jest.fn().mockResolvedValue(undefined)
}));
jest.mock("../helpers/syncTicketConnectionAiContext", () => ({
  syncTicketConnectionAiContext: jest.fn().mockResolvedValue({})
}));
jest.mock("../helpers/agentConversationalMemory", () => ({
  updateAgentConversationalMemory: jest.fn().mockResolvedValue(undefined)
}));
jest.mock("../services/PromptServices/AgentInboundQueueService", () => ({
  enqueueAgentInboundJob: jest.fn().mockResolvedValue(false),
  isAgentInboundQueueEnabled: jest.fn().mockReturnValue(false)
}));
jest.mock("../queues", () => ({ agentInboundQueue: null }));
jest.mock("../services/PromptServices/AgentOrchestratorService", () => ({
  isAgentLlmFirstRuntimeEnabled: jest.fn().mockReturnValue(true),
  runAgentOrchestrator: jest.fn(),
  runProviderDirectReplyFallback: jest.fn().mockResolvedValue({ handled: false })
}));
jest.mock("../services/PromptServices/IntentTriggerEngine", () => ({
  classifyAgentOutbound: jest.fn().mockResolvedValue({ intents: [] }),
  filterIntentsToEnabledSmartActions: jest.fn().mockResolvedValue([]),
  registerPendingIntents: jest.fn().mockResolvedValue(undefined),
  shouldRunSmartActionTriggersForPrompt: jest.fn().mockResolvedValue(false)
}));
jest.mock("../services/PromptServices/PendingIntentResolver", () => ({
  resolvePendingIntents: jest.fn().mockResolvedValue({ handled: false })
}));
jest.mock("../services/PromptServices/AttendanceFlowTurnService", () => ({
  tryHandlePromptAttendanceFlowTurn: jest.fn().mockResolvedValue({
    handled: false,
    consumedReply: false,
    sentCount: 0,
    actionCount: 0,
    allowLlmFallback: false,
    source: "v1",
    reason: "not_consumed"
  })
}));
jest.mock("../services/WhatsAppOficial/deliverWhatsAppOficialAgentReply", () => ({
  deliverWhatsAppOficialAgentReply: jest.fn().mockResolvedValue(1)
}));
jest.mock("../services/WhatsAppOficial/oficialAgentAttendanceStub", () => ({
  buildOficialAttendanceWbot: jest.fn(() => ({ sendMessage: jest.fn() })),
  buildOficialStubMsg: jest.fn(() => ({ key: { remoteJid: "x@s.whatsapp.net", id: "w" } })),
  promptHasAttendanceFlowScript: jest.fn().mockReturnValue(false)
}));
jest.mock("../services/WhatsAppOficial/oficialAgentParitySteps", () => ({
  softDeclineReplyIfNeeded: jest.fn((_u: string, r: string) => r),
  tryOficialInventoryEarly: jest.fn().mockResolvedValue({ handled: false, replied: false }),
  tryOficialInventoryLate: jest.fn().mockResolvedValue({ handled: false, replied: false }),
  tryOficialScheduleMeeting: jest.fn().mockResolvedValue({ handled: false, replied: false }),
  tryOficialSendGeminiImages: jest.fn().mockResolvedValue(0),
  tryOficialSoftDeclineFallback: jest.fn().mockResolvedValue({ handled: false, replied: false })
}));
jest.mock("../services/WhatsAppOficial/oficialRoteiroParity", () => ({
  restoreOficialRoteiroLlmFlagsAfterReload: jest.fn()
}));
jest.mock("../services/TicketServices/markTicketUnderAgentAttendance", () => ({
  markTicketUnderAgentAttendance: jest.fn().mockResolvedValue(undefined)
}));
jest.mock("../helpers/loadPromptKnowledgeContext", () => ({
  loadPromptKnowledgeContext: jest.fn().mockResolvedValue({
    block: "",
    hasAnyMaterial: false,
    faqHits: 0,
    sourceHits: 0
  })
}));
jest.mock("../models/PromptFaqItem", () => ({
  __esModule: true,
  default: { findAll: jest.fn().mockResolvedValue([]) }
}));
jest.mock("../models/Message", () => ({
  __esModule: true,
  default: { findAll: jest.fn().mockResolvedValue([]) }
}));
jest.mock("openai", () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [] }) } }
  }));
});

import Ticket from "../models/Ticket";
import Contact from "../models/Contact";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import ShowPromptService from "../services/PromptServices/ShowPromptService";
import {
  resolveConnectionAgentFromWhatsapp,
  whatsappHasConnectionAgent
} from "../providers/anthropic/services/resolveConnectionAgent";
import { runAgentOrchestrator } from "../services/PromptServices/AgentOrchestratorService";
import { deliverWhatsAppOficialAgentReply } from "../services/WhatsAppOficial/deliverWhatsAppOficialAgentReply";
import { processWhatsAppOficialAgentInbound } from "../services/WhatsAppOficial/processWhatsAppOficialAgentInbound";
import { AGENT_PROCESSING_STALE_MS } from "../services/PromptServices/AgentProcessingStateService";

function makeTicket(overrides: Record<string, unknown> = {}) {
  const ticket: any = {
    id: 42,
    companyId: 1,
    status: "pending",
    userId: null,
    channel: "whatsapp_oficial",
    whatsappId: 10,
    dataWebhook: {},
    update: jest.fn(async function (this: any, patch: any) {
      Object.assign(this, patch);
      if (patch.dataWebhook) this.dataWebhook = patch.dataWebhook;
    }),
    reload: jest.fn(async function (this: any) {
      return this;
    }),
    setDataValue: jest.fn(function (this: any, k: string, v: any) {
      this[k] = v;
    }),
    ...overrides
  };
  return ticket;
}

describe("processWhatsAppOficialAgentInbound — responde / não trava", () => {
  const connection = { id: 10, promptId: 3, channel: "whatsapp_oficial" } as any;
  const contact = {
    id: 5,
    number: "5511999999999",
    name: "Cliente",
    disableBot: false
  } as any;
  const prompt = {
    id: 3,
    name: "Agente",
    apiKey: "sk-test",
    model: "gpt-4o-mini",
    prompt: "Você é um vendedor.",
    attendanceScript: ""
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (whatsappHasConnectionAgent as jest.Mock).mockReturnValue(true);
    (ShowWhatsAppService as jest.Mock).mockResolvedValue(connection);
    (resolveConnectionAgentFromWhatsapp as jest.Mock).mockResolvedValue({
      prompt,
      llmProvider: "openai",
      ref: { kind: "prompt", promptId: 3 }
    });
    (ShowPromptService as jest.Mock).mockResolvedValue(prompt);
    (runAgentOrchestrator as jest.Mock).mockResolvedValue({
      handled: true,
      reply: "Olá! Como posso ajudar?"
    });
    (deliverWhatsAppOficialAgentReply as jest.Mock).mockResolvedValue(1);
  });

  it("envia resposta via Cloud API no caminho feliz", async () => {
    const ticket = makeTicket();
    (Ticket.findByPk as jest.Mock).mockResolvedValue(ticket);
    (Contact.findByPk as jest.Mock).mockResolvedValue(contact);

    const ok = await processWhatsAppOficialAgentInbound({
      connection,
      ticket,
      contact,
      body: "Oi",
      messageWid: "wamid.1"
    });

    expect(ok).toBe(true);
    expect(deliverWhatsAppOficialAgentReply).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringMatching(/Olá|ajudar/i)
      })
    );
    expect(isAgentProcessingLockCleared(ticket)).toBe(true);
  });

  it("lock stale NÃO bloqueia — limpa e responde", async () => {
    const startedAt = new Date(
      Date.now() - AGENT_PROCESSING_STALE_MS - 10_000
    ).toISOString();
    const ticket = makeTicket({
      dataWebhook: {
        agentState: {
          processing: { active: true, status: "processing", startedAt }
        }
      }
    });
    (Ticket.findByPk as jest.Mock).mockResolvedValue(ticket);
    (Contact.findByPk as jest.Mock).mockResolvedValue(contact);

    const ok = await processWhatsAppOficialAgentInbound({
      connection,
      ticket,
      contact,
      body: "Oi de novo",
      messageWid: "wamid.2"
    });

    expect(ok).toBe(true);
    expect(deliverWhatsAppOficialAgentReply).toHaveBeenCalled();
  });

  it("lock fresco ainda ativo bloqueia duplicata", async () => {
    const ticket = makeTicket({
      dataWebhook: {
        agentState: {
          processing: {
            active: true,
            status: "processing",
            startedAt: new Date().toISOString()
          }
        }
      }
    });
    (Ticket.findByPk as jest.Mock).mockResolvedValue(ticket);
    (Contact.findByPk as jest.Mock).mockResolvedValue(contact);

    const ok = await processWhatsAppOficialAgentInbound({
      connection,
      ticket,
      contact,
      body: "Oi",
      messageWid: "wamid.3"
    });

    expect(ok).toBe(true);
    expect(deliverWhatsAppOficialAgentReply).not.toHaveBeenCalled();
    expect(runAgentOrchestrator).not.toHaveBeenCalled();
  });

  it("orquestrador vazio ainda dispara anti-silêncio final", async () => {
    (runAgentOrchestrator as jest.Mock).mockResolvedValue({
      handled: true,
      reply: ""
    });
    const ticket = makeTicket();
    (Ticket.findByPk as jest.Mock).mockResolvedValue(ticket);
    (Contact.findByPk as jest.Mock).mockResolvedValue(contact);

    const ok = await processWhatsAppOficialAgentInbound({
      connection,
      ticket,
      contact,
      body: "teste",
      messageWid: "wamid.4"
    });

    expect(ok).toBe(true);
    expect(deliverWhatsAppOficialAgentReply).toHaveBeenCalled();
    const lastCall = (deliverWhatsAppOficialAgentReply as jest.Mock).mock.calls.at(
      -1
    )?.[0];
    expect(String(lastCall?.text || "")).toMatch(/instabilidade|repetir/i);
  });

  it("resolve sem prompt NÃO deixa lock ativo (não trava próximos turnos)", async () => {
    (resolveConnectionAgentFromWhatsapp as jest.Mock).mockResolvedValue({
      prompt: null
    });
    const ticket = makeTicket();
    (Ticket.findByPk as jest.Mock).mockResolvedValue(ticket);
    (Contact.findByPk as jest.Mock).mockResolvedValue(contact);

    const ok = await processWhatsAppOficialAgentInbound({
      connection,
      ticket,
      contact,
      body: "Oi",
      messageWid: "wamid.5"
    });

    expect(ok).toBe(false);
    expect(isAgentProcessingLockCleared(ticket)).toBe(true);
    expect(deliverWhatsAppOficialAgentReply).not.toHaveBeenCalled();
  });
});

function isAgentProcessingLockCleared(ticket: any): boolean {
  const p = ticket?.dataWebhook?.agentState?.processing;
  if (!p) return true;
  return p.active !== true && p.status !== "processing";
}
