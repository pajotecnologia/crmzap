import {
  assertTemplateMediaFile,
  buildMetaTemplateSend,
  classifyTemplateMediaValue,
  normalizeTemplateLanguage
} from "../services/WhatsAppOficial/buildMetaTemplatePayload";
import { mergeMetaDeliveryStatus } from "../services/WhatsAppOficial/mergeMetaMessageStatus";

const template = (components: any[], language = "pt-BR") =>
  ({
    shortcode: "promo_verao",
    language,
    components
  } as any);

describe("buildMetaTemplateSend", () => {
  it("envia template somente texto sem componentes artificiais", () => {
    const { payload, view } = buildMetaTemplateSend(
      template([
        { type: "BODY", text: "Olá, tudo bem?" },
        { type: "FOOTER", text: "Equipe VB" }
      ])
    );
    expect(payload.name).toBe("promo_verao");
    expect(payload.language).toEqual({ code: "pt_BR" });
    expect(payload.components).toBeUndefined();
    expect(view.body).toBe("Olá, tudo bem?");
    expect(view.footer).toBe("Equipe VB");
    expect(view.previewText).toContain("Olá, tudo bem?");
    expect(view.previewText).toContain("Equipe VB");
  });

  it("monta imagem por link e não reaproveita a mídia de exemplo", () => {
    const { payload, view } = buildMetaTemplateSend(
      template([
        {
          type: "HEADER",
          format: "IMAGE",
          example: JSON.stringify({
            header_handle: ["https://scontent.example/expired-sample.jpg"]
          })
        },
        { type: "BODY", text: "Confira" }
      ]),
      { header: { "1": { value: "https://cdn.exemplo.com/foto.jpg" } } }
    );
    expect(payload.components?.[0]).toEqual({
      type: "header",
      parameters: [
        { type: "image", image: { link: "https://cdn.exemplo.com/foto.jpg" } }
      ]
    });
    expect(JSON.stringify(payload)).not.toContain("expired-sample");
    expect(view.header?.media?.url).toBe("https://cdn.exemplo.com/foto.jpg");
    expect(view.header?.media?.id).toBeUndefined();
  });

  it("envia vídeo e documento com id ou link no tipo correto", () => {
    const video = buildMetaTemplateSend(
      template([{ type: "HEADER", format: "VIDEO" }, { type: "BODY", text: "Veja" }]),
      { header: { "1": { value: "123456789012" } } }
    );
    expect(video.payload.components?.[0].parameters).toEqual([
      { type: "video", video: { id: "123456789012" } }
    ]);

    const doc = buildMetaTemplateSend(
      template([
        { type: "HEADER", format: "DOCUMENT" },
        { type: "BODY", text: "Segue" }
      ]),
      {
        header: {
          "1": {
            value: "https://cdn.exemplo.com/contrato.pdf",
            filename: "contrato.pdf"
          }
        }
      }
    );
    expect(doc.payload.components?.[0].parameters).toEqual([
      {
        type: "document",
        document: {
          link: "https://cdn.exemplo.com/contrato.pdf",
          filename: "contrato.pdf"
        }
      }
    ]);
    expect(doc.view.header?.media?.filename).toBe("contrato.pdf");
  });

  it("preenche variáveis do corpo e do cabeçalho textual na ordem", () => {
    const { payload, view } = buildMetaTemplateSend(
      template([
        { type: "HEADER", format: "TEXT", text: "Olá {{1}}" },
        { type: "BODY", text: "Pedido {{2}} de {{1}}" },
        { type: "FOOTER", text: "Obrigado" }
      ]),
      {
        header: { "1": { value: "Ana" } },
        body: { "1": { value: "Maria" }, "2": { value: "42" } }
      }
    );
    const header = payload.components?.find(item => item.type === "header");
    const body = payload.components?.find(item => item.type === "body");
    expect(header?.parameters).toEqual([{ type: "text", text: "Ana" }]);
    expect(body?.parameters).toEqual([
      { type: "text", text: "Maria" },
      { type: "text", text: "42" }
    ]);
    expect(payload.components?.some(item => item.type === "footer")).toBe(false);
    expect(view.header?.text).toBe("Olá Ana");
    expect(view.body).toBe("Pedido 42 de Maria");
    expect(view.footer).toBe("Obrigado");
  });

  it("aceita variável nomeada no corpo", () => {
    const { payload } = buildMetaTemplateSend(
      template([{ type: "BODY", text: "Oi {{first_name}}" }]),
      { body: { first_name: { value: "Paulo" } } }
    );
    expect(payload.components?.[0].parameters).toEqual([
      { type: "text", text: "Paulo", parameter_name: "first_name" }
    ]);
  });

  it("mostra resposta rápida e telefone sem enviá-los como parâmetro", () => {
    const buttons = JSON.stringify([
      { type: "QUICK_REPLY", text: "Sim" },
      { type: "PHONE_NUMBER", text: "Ligar", phone_number: "+5511999990000" }
    ]);
    const { payload, view } = buildMetaTemplateSend(
      template([
        { type: "BODY", text: "Posso ajudar?" },
        { type: "BUTTONS", buttons }
      ])
    );
    expect(payload.components).toBeUndefined();
    expect(view.buttons.map(item => item.type)).toEqual([
      "QUICK_REPLY",
      "PHONE_NUMBER"
    ]);
    expect(view.buttons[1].phone).toBe("+5511999990000");
  });

  it("monta URL dinâmica e preserva URL estática só na exibição", () => {
    const buttons = JSON.stringify([
      { type: "URL", text: "Site", url: "https://loja.exemplo.com" },
      {
        type: "URL",
        text: "Pedido",
        url: "https://loja.exemplo.com/p/{{1}}",
        example: ["https://loja.exemplo.com/p/abc"]
      }
    ]);
    const { payload, view } = buildMetaTemplateSend(
      template([
        { type: "BODY", text: "Seu pedido" },
        { type: "BUTTONS", buttons }
      ]),
      { button: { "1": { value: "abc", buttonIndex: 1 } } }
    );
    expect(payload.components).toEqual([
      {
        type: "button",
        sub_type: "url",
        index: "1",
        parameters: [{ type: "text", text: "abc" }]
      }
    ]);
    expect(view.buttons[0].url).toBe("https://loja.exemplo.com");
    expect(view.buttons[1].url).toBe("https://loja.exemplo.com/p/abc");
  });

  it("envia mídia, corpo, rodapé e botões juntos", () => {
    const buttons = JSON.stringify([
      { type: "QUICK_REPLY", text: "Ok" },
      {
        type: "URL",
        text: "Abrir",
        url: "https://loja.exemplo.com/{{1}}"
      }
    ]);
    const { payload, view } = buildMetaTemplateSend(
      template([
        { type: "HEADER", format: "IMAGE" },
        { type: "BODY", text: "Oi {{1}}" },
        { type: "FOOTER", text: "VB" },
        { type: "BUTTONS", buttons }
      ]),
      {
        header: { "1": { value: "99887766", localFile: "foto.jpg" } },
        body: { "1": { value: "Lia" } },
        button: { "1": { value: "oferta", buttonIndex: 1 } }
      }
    );
    expect(payload.components?.map(item => item.type)).toEqual([
      "header",
      "body",
      "button"
    ]);
    expect(payload.components?.[0].parameters?.[0]).toEqual({
      type: "image",
      image: { id: "99887766" }
    });
    expect(view.body).toBe("Oi Lia");
    expect(view.footer).toBe("VB");
    expect(view.buttons).toHaveLength(2);
    expect(view.header?.media?.localFile).toBe("foto.jpg");
    expect(view.buttons[1].url).toBe("https://loja.exemplo.com/oferta");
  });

  it("recusa mídia ausente, variável vazia, link privado e botão de cupom sem código", () => {
    expect(() =>
      buildMetaTemplateSend(
        template([{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Oi" }])
      )
    ).toThrow(/mídia/i);

    expect(() =>
      buildMetaTemplateSend(template([{ type: "BODY", text: "Oi {{1}}" }]), {
        body: { "1": { value: "  " } }
      })
    ).toThrow(/BODY/);

    expect(() => classifyTemplateMediaValue("http://localhost/a.jpg")).toThrow(
      /públic/i
    );
    expect(() => classifyTemplateMediaValue("arquivo-local")).toThrow(/inválida/i);

    expect(() =>
      buildMetaTemplateSend(
        template([
          { type: "BODY", text: "Cupom" },
          {
            type: "BUTTONS",
            buttons: JSON.stringify([{ type: "COPY_CODE", text: "Copiar" }])
          }
        ])
      )
    ).toThrow(/código/i);
  });

  it("normaliza idioma e valida arquivo incompatível", () => {
    expect(normalizeTemplateLanguage("pt-BR")).toBe("pt_BR");
    expect(normalizeTemplateLanguage("en_us")).toBe("en_US");
    expect(() =>
      assertTemplateMediaFile(
        { mimetype: "image/gif", size: 1000, originalname: "a.gif" },
        "IMAGE"
      )
    ).toThrow(/incompatível/i);
    expect(() =>
      assertTemplateMediaFile(
        { mimetype: "image/jpeg", size: 6 * 1024 * 1024, originalname: "a.jpg" },
        "IMAGE"
      )
    ).toThrow(/limite/i);
    expect(() =>
      assertTemplateMediaFile(
        { mimetype: "video/mp4", size: 1024, originalname: "a.mp4" },
        "VIDEO"
      )
    ).not.toThrow();
  });
});

describe("mergeMetaDeliveryStatus", () => {
  const base = {
    ack: 1,
    dataJson: JSON.stringify({
      template: { name: "promo_verao", language: { code: "pt_BR" } },
      metaTemplate: {
        name: "promo_verao",
        body: "Oi Lia",
        footer: "VB",
        buttons: [{ type: "QUICK_REPLY", text: "Ok" }],
        header: { format: "IMAGE", media: { kind: "image", localFile: "foto.jpg" } }
      }
    })
  };

  it("atualiza entrega sem alterar o snapshot", () => {
    const patch = mergeMetaDeliveryStatus(base, { status: "delivered" });
    expect(patch).toEqual({ ack: 2 });
  });

  it("registra falha da Meta e preserva mídia, texto e botões", () => {
    const patch = mergeMetaDeliveryStatus(base, {
      status: "failed",
      errors: [
        {
          code: 131026,
          title: "Message undeliverable",
          message: "Message undeliverable",
          error_data: { details: "Número sem WhatsApp" }
        }
      ]
    });
    expect(patch?.ack).toBe(-1);
    const stored = JSON.parse(patch?.dataJson || "{}");
    expect(stored.template.name).toBe("promo_verao");
    expect(stored.metaTemplate.body).toBe("Oi Lia");
    expect(stored.metaTemplate.footer).toBe("VB");
    expect(stored.metaTemplate.buttons[0].text).toBe("Ok");
    expect(stored.metaTemplate.header.media.localFile).toBe("foto.jpg");
    expect(stored.metaTemplate.sendError).toEqual({
      code: 131026,
      title: "Message undeliverable",
      message: "Message undeliverable",
      details: "Número sem WhatsApp"
    });
  });

  it("ignora status mais antigo e não apaga componentes", () => {
    expect(mergeMetaDeliveryStatus({ ...base, ack: 3 }, { status: "sent" })).toBe(
      null
    );
    expect(mergeMetaDeliveryStatus({ ...base, ack: 2 }, { status: "read" })).toEqual({
      ack: 3
    });
  });
});
