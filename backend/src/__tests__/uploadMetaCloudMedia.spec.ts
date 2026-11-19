import fs from "fs";
import path from "path";
import os from "os";

jest.mock("axios", () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn() }
}));
jest.mock("../services/WhatsAppOficial/metaWhatsAppAuth", () => ({
  getMetaAccessToken: () => "EAAtesttoken123456789"
}));

import axios from "axios";
import { uploadMetaCloudMedia } from "../services/WhatsAppOficial/uploadMetaCloudMedia";

describe("uploadMetaCloudMedia", () => {
  let tmpFile: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpFile = path.join(os.tmpdir(), `vb-test-${Date.now()}.pdf`);
    fs.writeFileSync(tmpFile, Buffer.from("%PDF-1.4 test"));
  });

  afterEach(() => {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
  });

  it("uploads with type MIME and filename to Meta media endpoint", async () => {
    (axios.post as jest.Mock).mockResolvedValue({ data: { id: "media_abc" } });
    const whatsapp = {
      phone_number_id: "999",
      send_token: "EAAtest"
    } as any;

    const result = await uploadMetaCloudMedia(
      whatsapp,
      tmpFile,
      "application/pdf",
      "apresentacao.pdf"
    );

    expect(result.id).toBe("media_abc");
    expect(axios.post).toHaveBeenCalledWith(
      "https://graph.facebook.com/v21.0/999/media",
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer EAAtesttoken123456789"
        })
      })
    );
    const form = (axios.post as jest.Mock).mock.calls[0][1];
    expect(form).toBeTruthy();
    // form-data instance exposes getBuffer / _streams; assert via getHeaders presence
    expect(typeof form.getHeaders).toBe("function");
  });

  it("throws when Meta returns no media id", async () => {
    (axios.post as jest.Mock).mockResolvedValue({ data: {} });
    await expect(
      uploadMetaCloudMedia(
        { phone_number_id: "1", send_token: "t" } as any,
        tmpFile,
        "application/pdf"
      )
    ).rejects.toThrow(/não retornou id/);
  });
});
