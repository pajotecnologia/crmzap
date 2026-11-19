jest.mock("../services/WhatsAppOficial/SendWhatsAppOficialMessage", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue({ idMessageWhatsApp: ["wamid.TEST"] })
}));
jest.mock("../models/Whatsapp", () => ({
  __esModule: true,
  default: { findByPk: jest.fn() }
}));
jest.mock("../models/Contact", () => ({
  __esModule: true,
  default: { findByPk: jest.fn() }
}));
jest.mock("../models/Ticket", () => ({
  __esModule: true,
  default: { findByPk: jest.fn() }
}));
jest.mock("../services/TicketServices/markTicketUnderAgentAttendance", () => ({
  markTicketUnderAgentAttendance: jest.fn().mockResolvedValue(undefined)
}));
jest.mock("../services/TicketServices/ShowTicketService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../libs/socket", () => ({
  getIO: jest.fn(() => ({
    of: () => ({ emit: jest.fn() })
  }))
}));
jest.mock("../services/PromptServices/AgentOutboundGuard", () => ({
  isAgentOutboundGuardEnabled: jest.fn().mockReturnValue(false),
  shouldSendOutbound: jest.fn(),
  recordSentOutbound: jest.fn()
}));
jest.mock("../services/PromptServices/AgentOrchestratorService", () => ({
  splitAgentReplyIntoSmartBlocks: jest.fn((text: string) => [text])
}));
jest.mock("../models/PromptAgentMedia", () => ({
  __esModule: true,
  default: { findAll: jest.fn().mockResolvedValue([]) }
}));
jest.mock("../services/PromptServices/ShowPromptService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("axios", () => ({
  __esModule: true,
  default: { get: jest.fn() }
}));

import SendWhatsAppOficialMessage from "../services/WhatsAppOficial/SendWhatsAppOficialMessage";
import Whatsapp from "../models/Whatsapp";
import Contact from "../models/Contact";
import Ticket from "../models/Ticket";
import { markTicketUnderAgentAttendance } from "../services/TicketServices/markTicketUnderAgentAttendance";
import { deliverWhatsAppOficialAgentReply } from "../services/WhatsAppOficial/deliverWhatsAppOficialAgentReply";

describe("deliverWhatsAppOficialAgentReply", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sends via Cloud API with fromAgent, expands {nome_contato}, marks attendance", async () => {
    const connection = { id: 10, channel: "whatsapp_oficial" } as any;
    const contact = { id: 5, number: "5511999999999", name: "Silvana" } as any;
    const ticket = {
      id: 2,
      companyId: 1,
      channel: "whatsapp_oficial",
      whatsappId: 10
    } as any;

    (Whatsapp.findByPk as jest.Mock).mockResolvedValue(connection);
    (Contact.findByPk as jest.Mock).mockResolvedValue(contact);
    (Ticket.findByPk as jest.Mock).mockResolvedValue(ticket);

    const sent = await deliverWhatsAppOficialAgentReply({
      connection,
      ticket,
      contact,
      prompt: { id: 3, name: "Leonardo" } as any,
      text: "Opa {nome_contato}! Quem fala é o Leonardo."
    });

    expect(sent).toBe(1);
    expect(SendWhatsAppOficialMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "text",
        fromAgent: true,
        body: expect.stringContaining("Silvana")
      })
    );
    const bodyArg = (SendWhatsAppOficialMessage as jest.Mock).mock.calls[0][0]
      .body;
    expect(bodyArg).not.toContain("{nome_contato}");
    expect(markTicketUnderAgentAttendance).toHaveBeenCalled();
  });

  it("throws when contact has no number", async () => {
    const connection = { id: 10 } as any;
    const contact = { id: 5, number: "" } as any;
    const ticket = { id: 2, companyId: 1 } as any;
    (Whatsapp.findByPk as jest.Mock).mockResolvedValue(connection);
    (Contact.findByPk as jest.Mock).mockResolvedValue(contact);
    (Ticket.findByPk as jest.Mock).mockResolvedValue(ticket);

    await expect(
      deliverWhatsAppOficialAgentReply({
        connection,
        ticket,
        contact,
        prompt: { id: 3 },
        text: "Oi"
      })
    ).rejects.toThrow(/sem number/);
  });
});
