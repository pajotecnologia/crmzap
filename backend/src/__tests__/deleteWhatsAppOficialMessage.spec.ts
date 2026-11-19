/**
 * @jest-environment node
 */
describe("DeleteWhatsAppMessage oficial branching", () => {
  it("isOficialChannel reconhece canais Cloud API", () => {
    const isOficial = (channel?: string | null) => {
      const c = String(channel || "").toLowerCase();
      return c === "whatsapp_oficial" || c === "whatsapp_oficial_api";
    };

    expect(isOficial("whatsapp_oficial")).toBe(true);
    expect(isOficial("whatsapp_oficial_api")).toBe(true);
    expect(isOficial("whatsapp")).toBe(false);
    expect(isOficial(null)).toBe(false);
  });
});

describe("deleteMetaCloudMessage result contract", () => {
  it("sem wamid ainda permite soft-delete local", async () => {
    jest.resetModules();
    jest.doMock("../services/WhatsAppOficial/metaWhatsAppAuth", () => ({
      getMetaAccessToken: () => "token",
      sanitizeMetaToken: (t: string) => t || ""
    }));
    jest.doMock("axios", () => ({
      __esModule: true,
      default: { post: jest.fn(), delete: jest.fn() }
    }));

    const {
      deleteMetaCloudMessage
    } = require("../services/WhatsAppOficial/deleteMetaCloudMessage");

    const result = await deleteMetaCloudMessage(
      { phone_number_id: "123", send_token: "tok" },
      ""
    );

    expect(result.allowLocalDelete).toBe(true);
    expect(result.remoteDeleted).toBe(false);
  });

  it("Meta rejeitando status=deleted ainda permite soft-delete", async () => {
    jest.resetModules();
    jest.doMock("../services/WhatsAppOficial/metaWhatsAppAuth", () => ({
      getMetaAccessToken: () => "EAAtest",
      sanitizeMetaToken: (t: string) => t || ""
    }));
    jest.doMock("axios", () => ({
      __esModule: true,
      default: {
        post: jest.fn().mockResolvedValue({
          status: 400,
          data: { error: { message: "Invalid status" } }
        }),
        delete: jest.fn().mockResolvedValue({ status: 400, data: {} })
      }
    }));

    const {
      deleteMetaCloudMessage
    } = require("../services/WhatsAppOficial/deleteMetaCloudMessage");

    const result = await deleteMetaCloudMessage(
      { phone_number_id: "106540352242922", send_token: "EAAtest" },
      "wamid.HBgLTEST"
    );

    expect(result.allowLocalDelete).toBe(true);
    expect(result.remoteDeleted).toBe(false);
  });
});
