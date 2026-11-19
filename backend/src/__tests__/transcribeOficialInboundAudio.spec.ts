jest.mock("fs", () => ({
  existsSync: jest.fn(),
  createReadStream: jest.fn()
}));
jest.mock("openai", () => {
  return jest.fn().mockImplementation(() => ({
    audio: {
      transcriptions: {
        create: jest.fn()
      }
    }
  }));
});

import fs from "fs";
import OpenAI from "openai";
import { transcribeOficialInboundAudio } from "../services/WhatsAppOficial/transcribeOficialInboundAudio";

describe("transcribeOficialInboundAudio", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns empty without apiKey or fileName", async () => {
    await expect(
      transcribeOficialInboundAudio({
        companyId: 1,
        fileName: "",
        apiKey: "sk"
      })
    ).resolves.toBe("");
    await expect(
      transcribeOficialInboundAudio({
        companyId: 1,
        fileName: "a.ogg",
        apiKey: ""
      })
    ).resolves.toBe("");
  });

  it("returns empty when file missing", async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    await expect(
      transcribeOficialInboundAudio({
        companyId: 1,
        fileName: "a.ogg",
        apiKey: "sk-test"
      })
    ).resolves.toBe("");
  });

  it("returns whisper text when file exists", async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.createReadStream as jest.Mock).mockReturnValue({} as any);
    const create = jest.fn().mockResolvedValue({ text: "  Olá, quero o preço  " });
    (OpenAI as unknown as jest.Mock).mockImplementation(() => ({
      audio: { transcriptions: { create } }
    }));

    const text = await transcribeOficialInboundAudio({
      companyId: 7,
      fileName: "audio.ogg",
      apiKey: "sk-test",
      ticketId: 99
    });
    expect(text).toBe("Olá, quero o preço");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ model: "whisper-1" })
    );
  });
});
