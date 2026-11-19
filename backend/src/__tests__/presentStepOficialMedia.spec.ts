jest.mock("../database", () => ({
  __esModule: true,
  default: {
    transaction: (fn: (t: unknown) => Promise<unknown>) => fn({}),
    define: jest.fn(),
    models: {}
  }
}));

jest.mock("axios", () => ({
  __esModule: true,
  default: { get: jest.fn() }
}));

jest.mock("../services/WhatsAppOficial/SendWhatsAppOficialMessage", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../models/PromptAgentMedia", () => ({
  __esModule: true,
  default: {
    findAll: jest.fn().mockResolvedValue([
      {
        slug: "catalogo",
        fileUrl: "company1/fake-media/catalogo.pdf",
        fileType: "documento",
        caption: "",
        name: "catalogo.pdf"
      }
    ])
  }
}));
jest.mock("../models/PromptKnowledgeSource", () => ({
  __esModule: true,
  default: { findAll: jest.fn().mockResolvedValue([]) }
}));
jest.mock("../models/PromptSmartAction", () => ({
  __esModule: true,
  default: { findAll: jest.fn().mockResolvedValue([]) }
}));
jest.mock("../models/Inventory", () => ({
  __esModule: true,
  default: { findOne: jest.fn() }
}));
jest.mock("../models/Ticket", () => ({ __esModule: true, default: {} }));
jest.mock("../models/Contact", () => ({ __esModule: true, default: {} }));
jest.mock("../models/TicketTraking", () => ({ __esModule: true, default: {} }));
jest.mock("../models/Prompt", () => ({ __esModule: true, default: {} }));
jest.mock("../services/WbotServices/SendWhatsAppMedia", () => ({
  getMessageOptions: jest.fn()
}));
jest.mock("../services/ConvertedLeadServices/CreateService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../services/PromptServices/PromptSmartActionExecutorService", () => ({
  executeSmartAction: jest.fn()
}));
jest.mock("../services/TicketServices/CreateLogTicketService", () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock("fs", () => {
  const actual = jest.requireActual("fs");
  return {
    ...actual,
    existsSync: jest.fn((p: string) => {
      if (String(p).includes("fake-media")) return true;
      return actual.existsSync(p);
    }),
    statSync: jest.fn((p: string) => {
      if (String(p).includes("fake-media")) return { size: 128 };
      return actual.statSync(p);
    }),
    readFileSync: jest.fn((p: string, ...args: any[]) => {
      if (String(p).includes("fake-media")) return Buffer.from("PDFDATA");
      return actual.readFileSync(p, ...args);
    }),
    mkdirSync: actual.mkdirSync,
    writeFileSync: actual.writeFileSync
  };
});

import fs from "fs";
import SendWhatsAppOficialMessage from "../services/WhatsAppOficial/SendWhatsAppOficialMessage";
import { presentStepWithScriptCommands } from "../services/PromptServices/presentStepWithScriptCommands";

describe("presentStepWithScriptCommands — mídia Oficial", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (SendWhatsAppOficialMessage as jest.Mock).mockResolvedValue({
      idMessageWhatsApp: ["mid.1"]
    });
  });

  it("envia #catalogo via Cloud API com contactId/whatsappId preenchidos", async () => {
    const connection = { id: 10, channel: "whatsapp_oficial" };
    const contact = { id: 5, number: "5511999999999", name: "Ana" };
    const ticket: any = {
      id: 2,
      companyId: 1,
      contactId: undefined,
      whatsappId: undefined,
      dataWebhook: {}
    };
    const prompt: any = {
      id: 3,
      midias: null,
      getDataValue: (k: string) => (k === "midias" ? null : undefined)
    };

    const wbot: any = {
      __oficialCloudApi: true,
      __oficialConnection: connection,
      sendMessage: jest.fn().mockResolvedValue({ key: { id: "stub" } })
    };

    const sentTexts: string[] = [];
    const result = await presentStepWithScriptCommands({
      stepText: "Segue o material:\n\n#catalogo\n\nQualquer dúvida me chama.",
      stepAttachments: [],
      wbot,
      msg: { key: { remoteJid: "5511999999999@s.whatsapp.net", id: "w1" } } as any,
      ticket,
      contact: contact as any,
      ticketTraking: undefined,
      prompt,
      verifyMessage: jest.fn(),
      verifyMediaMessage: jest.fn(),
      sendStepTextBlocks: async (_vm, _w, _m, _t, _c, _tt, text) => {
        sentTexts.push(String(text || ""));
      },
      transferQueue: jest.fn()
    });

    expect(result.executedCommands.some(c => c.kind === "media" && c.slug === "catalogo")).toBe(
      true
    );
    expect(SendWhatsAppOficialMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "document",
        fromAgent: true,
        media: expect.objectContaining({
          path: expect.stringContaining("fake-media")
        })
      })
    );
    expect(ticket.contactId).toBe(5);
    expect(ticket.whatsappId).toBe(10);
    expect(sentTexts.join("\n")).toMatch(/Segue o material|dúvida|duvida/i);
  });

  it("fallback stub quando SendWhatsAppOficialMessage falha", async () => {
    (SendWhatsAppOficialMessage as jest.Mock).mockRejectedValueOnce(
      new Error("Meta upload fail")
    );
    const connection = { id: 10 };
    const contact = { id: 5, number: "5511999" };
    const ticket: any = { id: 2, companyId: 1, contactId: 5, whatsappId: 10 };
    const prompt: any = {
      id: 3,
      getDataValue: () => null
    };
    const wbot: any = {
      __oficialCloudApi: true,
      __oficialConnection: connection,
      sendMessage: jest.fn().mockResolvedValue({ key: { id: "ok" } })
    };

    const result = await presentStepWithScriptCommands({
      stepText: "#catalogo",
      stepAttachments: [],
      wbot,
      msg: { key: { remoteJid: "5511999@s.whatsapp.net", id: "w2" } } as any,
      ticket,
      contact: contact as any,
      ticketTraking: undefined,
      prompt,
      verifyMessage: jest.fn(),
      verifyMediaMessage: jest.fn(),
      sendStepTextBlocks: async () => undefined,
      transferQueue: jest.fn()
    });

    expect(result.executedCommands.some(c => c.kind === "media")).toBe(true);
    expect(wbot.sendMessage).toHaveBeenCalled();
    expect(fs.readFileSync).toHaveBeenCalled();
  });
});
