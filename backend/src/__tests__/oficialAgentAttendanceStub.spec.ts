jest.mock("../services/WhatsAppOficial/SendWhatsAppOficialMessage", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../services/WhatsAppOficial/sendMetaCloudTypingIndicator", () => ({
  sendMetaCloudTypingIndicator: jest.fn().mockResolvedValue(true)
}));
jest.mock("axios", () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn() }
}));

import { promptHasAttendanceFlowScript } from "../services/WhatsAppOficial/oficialAgentAttendanceStub";

describe("promptHasAttendanceFlowScript", () => {
  it("detects attendanceFlowSteps array", () => {
    expect(
      promptHasAttendanceFlowScript({
        attendanceFlowSteps: [{ stepNumber: 1, agentPrompt: "Oi" }]
      })
    ).toBe(true);
  });

  it("detects ETAPA markers in script", () => {
    expect(
      promptHasAttendanceFlowScript({
        attendanceScript: "# ETAPA 1\nApresente-se"
      })
    ).toBe(true);
  });

  it("returns false for plain LLM prompt without roteiro", () => {
    expect(
      promptHasAttendanceFlowScript({
        prompt: "Você é um vendedor simpático."
      })
    ).toBe(false);
  });
});

describe("buildOficialAttendanceWbot media URL (inventory parity)", () => {
  const SendWhatsAppOficialMessage = require("../services/WhatsAppOficial/SendWhatsAppOficialMessage")
    .default as jest.Mock;
  const axios = require("axios").default as { get: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    SendWhatsAppOficialMessage.mockResolvedValue({
      idMessageWhatsApp: ["mid1"]
    });
  });

  it("downloads http image url and sends via Cloud API", async () => {
    const fs = require("fs");
    jest.spyOn(fs, "existsSync").mockReturnValue(true);
    jest.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
    jest.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);
    jest.spyOn(fs, "statSync").mockReturnValue({ size: 12 } as any);

    axios.get = jest.fn().mockResolvedValue({
      data: Buffer.from("fake-image-bytes"),
      headers: { "content-type": "image/jpeg" }
    });

    const {
      buildOficialAttendanceWbot
    } = require("../services/WhatsAppOficial/oficialAgentAttendanceStub");

    const wbot = buildOficialAttendanceWbot({
      connection: { id: 1 } as any,
      ticket: { id: 10, companyId: 1 } as any,
      contact: { number: "5511999" } as any,
      inboundMessageId: "wamid.1"
    });

    await wbot.sendMessage("5511999@s.whatsapp.net", {
      image: { url: "https://cdn.example.com/prod.jpg" },
      caption: "foto"
    });

    expect(axios.get).toHaveBeenCalledWith(
      "https://cdn.example.com/prod.jpg",
      expect.objectContaining({ responseType: "arraybuffer" })
    );
    expect(SendWhatsAppOficialMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "image" })
    );
  });
});
