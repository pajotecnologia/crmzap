jest.mock("../services/WhatsAppOficial/deliverWhatsAppOficialAgentReply", () => ({
  deliverWhatsAppOficialAgentReply: jest.fn().mockResolvedValue(1)
}));
jest.mock("../services/PromptServices/tryHandleInventoryProductInbound", () => ({
  tryHandleInventoryProductInbound: jest.fn()
}));
jest.mock("../helpers/sendInventoryReplyMedia", () => ({
  sendInventoryReplyMedia: jest.fn().mockResolvedValue(0)
}));
jest.mock("../services/TicketServices/markTicketUnderAgentAttendance", () => ({
  markTicketUnderAgentAttendance: jest.fn().mockResolvedValue(undefined)
}));
jest.mock("../services/WhatsAppOficial/oficialAgentAttendanceStub", () => ({
  buildOficialAttendanceWbot: jest.fn(() => ({
    sendMessage: jest.fn().mockResolvedValue({ key: { id: "x" } })
  })),
  buildOficialStubMsg: jest.fn((contact: any, wid: string) => ({
    key: { remoteJid: `${contact.number}@s.whatsapp.net`, id: wid }
  })),
  promptHasAttendanceFlowScript: jest.fn().mockReturnValue(false)
}));
jest.mock("../models/Message", () => ({
  __esModule: true,
  default: { findAll: jest.fn().mockResolvedValue([]) }
}));
jest.mock("../services/IntegrationsServices/OpenAiService", () => ({
  tryScheduleMeeting: jest.fn().mockResolvedValue({ handled: false })
}));
jest.mock("../providers/gemini/agents/geminiWhatsappMedia", () => ({
  sendGeminiImagesToWhatsapp: jest.fn().mockResolvedValue(1)
}));

import { deliverWhatsAppOficialAgentReply } from "../services/WhatsAppOficial/deliverWhatsAppOficialAgentReply";
import { tryHandleInventoryProductInbound } from "../services/PromptServices/tryHandleInventoryProductInbound";
import { tryScheduleMeeting } from "../services/IntegrationsServices/OpenAiService";
import {
  softDeclineReplyIfNeeded,
  tryOficialInventoryEarly,
  tryOficialInventoryLate,
  tryOficialScheduleMeeting,
  tryOficialSoftDeclineFallback
} from "../services/WhatsAppOficial/oficialAgentParitySteps";

describe("oficialAgentParitySteps (paridade Baileys)", () => {
  const baseCtx = () =>
    ({
      connection: { id: 9 } as any,
      ticket: {
        id: 11,
        companyId: 1,
        update: jest.fn().mockResolvedValue(undefined),
        setDataValue: jest.fn(),
        dataWebhook: {}
      } as any,
      contact: { id: 2, number: "5511999999999" } as any,
      prompt: { id: 3, name: "Agente" },
      userText: "quanto custa o plano premium?",
      messageWid: "wamid.TEST"
    }) as const;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("softDeclineReplyIfNeeded", () => {
    it("preserves non-empty reply", () => {
      expect(softDeclineReplyIfNeeded("não quero", "Ok, sem problemas.")).toBe(
        "Ok, sem problemas."
      );
    });

    it("fills soft-decline when reply empty", () => {
      const out = softDeclineReplyIfNeeded("não quero agora", "");
      expect(out.length).toBeGreaterThan(10);
      expect(out.toLowerCase()).toMatch(/depois|tudo bem|quando quiser|sem problema/);
    });

    it("keeps empty when not a decline", () => {
      expect(softDeclineReplyIfNeeded("olá", "")).toBe("");
    });
  });

  describe("tryOficialInventoryEarly", () => {
    it("delivers inventory reply before flow (Baileys parity)", async () => {
      (tryHandleInventoryProductInbound as jest.Mock).mockResolvedValue({
        handled: true,
        reply: "O plano premium custa R$ 199.",
        reason: "product_found",
        media: { images: [], documentUrl: "", documentName: "" }
      });

      const result = await tryOficialInventoryEarly(baseCtx() as any);
      expect(result).toEqual({ handled: true, replied: true });
      expect(deliverWhatsAppOficialAgentReply).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "O plano premium custa R$ 199."
        })
      );
    });

    it("skips when not inventory query", async () => {
      (tryHandleInventoryProductInbound as jest.Mock).mockResolvedValue({
        handled: false,
        reply: "",
        reason: "not_inventory_query"
      });
      const ctx = { ...baseCtx(), userText: "oi" };
      const result = await tryOficialInventoryEarly(ctx as any);
      expect(result.handled).toBe(false);
      expect(deliverWhatsAppOficialAgentReply).not.toHaveBeenCalled();
    });
  });

  describe("tryOficialSoftDeclineFallback", () => {
    it("sends soft decline text", async () => {
      const ctx = { ...baseCtx(), userText: "acho que não" };
      const result = await tryOficialSoftDeclineFallback(ctx as any);
      expect(result.replied).toBe(true);
      expect(deliverWhatsAppOficialAgentReply).toHaveBeenCalled();
      const text = (deliverWhatsAppOficialAgentReply as jest.Mock).mock
        .calls[0][0].text;
      expect(String(text).length).toBeGreaterThan(5);
    });

    it("ignores non-decline", async () => {
      const ctx = { ...baseCtx(), userText: "quero sim" };
      const result = await tryOficialSoftDeclineFallback(ctx as any);
      expect(result.handled).toBe(false);
    });
  });

  describe("tryOficialInventoryLate", () => {
    it("never silences inventory query", async () => {
      (tryHandleInventoryProductInbound as jest.Mock).mockResolvedValue({
        handled: false,
        reply: "",
        reason: "empty"
      });
      const result = await tryOficialInventoryLate(baseCtx() as any);
      expect(result.replied).toBe(true);
      expect(deliverWhatsAppOficialAgentReply).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringMatching(/preço|disponibilidade|produto/i)
        })
      );
    });
  });

  describe("tryOficialScheduleMeeting", () => {
    it("confirms meeting when schedule service handles", async () => {
      (tryScheduleMeeting as jest.Mock).mockResolvedValue({
        handled: true,
        when: new Date("2026-06-10T15:00:00.000Z")
      });
      const ctx = {
        ...baseCtx(),
        userText: "vamos marcar reunião dia 10/06 às 12h"
      };
      const result = await tryOficialScheduleMeeting(ctx as any);
      expect(result.handled).toBe(true);
      expect(result.replied).toBe(true);
      expect(deliverWhatsAppOficialAgentReply).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringMatching(/Reunião agendada/i)
        })
      );
    });
  });
});
