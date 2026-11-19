jest.mock("axios", () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn() }
}));
jest.mock("../services/WhatsAppOficial/metaWhatsAppAuth", () => ({
  getMetaAccessToken: () => "EAAtesttoken",
  sanitizeMetaToken: (t: string) => String(t || "").trim()
}));

import axios from "axios";
import {
  sendMetaCloudTypingIndicator
} from "../services/WhatsAppOficial/sendMetaCloudTypingIndicator";

describe("sendMetaCloudTypingIndicator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("posts typing_indicator with read status and inbound wamid", async () => {
    (axios.post as jest.Mock).mockResolvedValue({ data: { success: true } });
    const whatsapp = {
      phone_number_id: "12345",
      send_token: "EAAtesttoken"
    } as any;

    const ok = await sendMetaCloudTypingIndicator({
      whatsapp,
      messageId: "wamid.INBOUND123"
    });

    expect(ok).toBe(true);
    expect(axios.post).toHaveBeenCalledWith(
      "https://graph.facebook.com/v21.0/12345/messages",
      expect.objectContaining({
        messaging_product: "whatsapp",
        status: "read",
        message_id: "wamid.INBOUND123",
        typing_indicator: { type: "text" }
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringContaining("Bearer")
        })
      })
    );
  });

  it("returns false without messageId", async () => {
    const ok = await sendMetaCloudTypingIndicator({
      whatsapp: { phone_number_id: "1", send_token: "t" } as any,
      messageId: ""
    });
    expect(ok).toBe(false);
    expect(axios.post).not.toHaveBeenCalled();
  });
});
