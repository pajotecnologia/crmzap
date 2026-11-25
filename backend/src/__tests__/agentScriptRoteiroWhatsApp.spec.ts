/**
 * 40+ testes: roteiro do Agente IA — URLs, #mídia, /ações, MIME e bolhas WhatsApp.
 */
import {
  extractHashMediaSlugsFromScriptBlock,
  extractSlashCommandSlugsFromScriptBlock,
  isScriptStructuralHeadingLine,
  lineLooksLikeUrlNotCommand,
  matchScriptCommandSlugFromLine,
  matchScriptMediaSlugFromLine,
  stripTrailingScriptToken
} from "../helpers/agentScriptInitialSendSlice";
import { splitAgentReplyIntoSmartBlocks } from "../helpers/agentOutboundBubbles";
import {
  protectUrlsForSplit,
  restoreUrlsAfterSplit,
  splitParagraphIntoSentences
} from "../helpers/agentOutboundBubbles";
import { resolveWhatsAppMediaKindFromMime } from "../helpers/whatsAppMediaKind";
import { sanitizeAgentCustomerVisibleText } from "../helpers/sanitizeAgentCustomerVisibleText";

describe("Roteiro Agente IA — URLs não são comandos /", () => {
  it("1) rejeita URL https completa como comando", () => {
    expect(matchScriptCommandSlugFromLine("https://site.com/agendamento")).toBeNull();
  });

  it("2) rejeita URL http", () => {
    expect(matchScriptCommandSlugFromLine("http://vb.com.br/proposta/final")).toBeNull();
  });

  it("3) rejeita www. sem protocolo", () => {
    expect(matchScriptCommandSlugFromLine("www.exemplo.com/catalogo")).toBeNull();
  });

  it("4) URL no meio da frase não vira comando", () => {
    expect(
      matchScriptCommandSlugFromLine("Acesse https://app.example.com/demo/agora")
    ).toBeNull();
  });

  it("5) path colado em domínio não é comando", () => {
    expect(matchScriptCommandSlugFromLine("Veja bit.ly/abc123")).toBeNull();
  });

  it("6) comando isolado /agendamento continua válido", () => {
    expect(matchScriptCommandSlugFromLine("/agendamento")).toBe("agendamento");
  });

  it("7) texto + /slug no fim NÃO é comando (só linha isolada)", () => {
    expect(matchScriptCommandSlugFromLine("Perfeito /agendamento")).toBeNull();
  });

  it("8) URL + /comando no fim NÃO dispara (roteiro: / só linha isolada)", () => {
    expect(
      matchScriptCommandSlugFromLine("Link: https://a.com/x /transferirchamado")
    ).toBeNull();
  });

  it("9) lineLooksLikeUrlNotCommand detecta https", () => {
    expect(lineLooksLikeUrlNotCommand("https://x.com/y")).toBe(true);
  });

  it("10) extractSlash não puxa path de URL", () => {
    expect(
      extractSlashCommandSlugsFromScriptBlock(
        "Olá\nhttps://crm.example.com/onboarding/start\n/agendamento"
      )
    ).toEqual(["agendamento"]);
  });
});

describe("Roteiro Agente IA — mídia via #slug", () => {
  it("11) #catalogo é mídia", () => {
    expect(matchScriptMediaSlugFromLine("#catalogo")).toBe("catalogo");
  });

  it("12) #nome-da-midia com hífen", () => {
    expect(matchScriptMediaSlugFromLine("#nome-da-midia")).toBe("nome-da-midia");
  });

  it("13) # ETAPA 1 NÃO é mídia (cabeçalho)", () => {
    expect(matchScriptMediaSlugFromLine("# ETAPA 1 — Boas-vindas")).toBeNull();
  });

  it("14) # PASSO não é mídia", () => {
    expect(matchScriptMediaSlugFromLine("# PASSO: Qualificação")).toBeNull();
  });

  it("15) isScriptStructuralHeadingLine true para # ETAPA", () => {
    expect(isScriptStructuralHeadingLine("# ETAPA 2")).toBe(true);
  });

  it("16) isScriptStructuralHeadingLine false para #catalogo", () => {
    expect(isScriptStructuralHeadingLine("#catalogo")).toBe(false);
  });

  it("17) mídia no fim da linha", () => {
    expect(matchScriptMediaSlugFromLine("Segue o PDF #proposta")).toBe("proposta");
  });

  it("18) stripTrailingScriptToken preserva texto antes da mídia", () => {
    expect(stripTrailingScriptToken("Segue o PDF #proposta", "proposta", "media")).toBe(
      "Segue o PDF"
    );
  });

  it("19) stripTrailingScriptToken em linha só com #slug", () => {
    expect(stripTrailingScriptToken("#catalogo", "catalogo", "media")).toBe("");
  });

  it("20) extractHashMediaSlugsFromScriptBlock ignora cabeçalhos", () => {
    expect(
      extractHashMediaSlugsFromScriptBlock(
        "# ETAPA 1\nOlá\n#catalogo\n# PASSO 2\n#video-demo"
      )
    ).toEqual(["catalogo", "video-demo"]);
  });

  it("21) / continua sendo comando, não mídia hash", () => {
    expect(matchScriptMediaSlugFromLine("/catalogo")).toBeNull();
    expect(matchScriptCommandSlugFromLine("/catalogo")).toBe("catalogo");
  });

  it("22) LRM do WhatsApp não quebra #mídia", () => {
    expect(matchScriptMediaSlugFromLine("\u200e #folder")).toBe("folder");
  });
});

describe("Roteiro Agente IA — bolhas e quebras de linha", () => {
  const scriptOpts = { preserveScriptStructure: true, maxChars: 520, maxBlocks: 12 };

  it("23) quebra simples = 1 bolha preservando \\n", () => {
    const blocks = splitAgentReplyIntoSmartBlocks(
      "Olá, tudo bem?\nEstou entrando em contato com você.",
      scriptOpts
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain("\n");
    expect(blocks[0]).toMatch(/Olá/);
    expect(blocks[0]).toMatch(/Estou entrando/);
  });

  it("24) linha em branco (\\n\\n) = 2 bolhas", () => {
    const blocks = splitAgentReplyIntoSmartBlocks(
      "Olá, tudo bem?\n\nEstou entrando em contato com você.",
      scriptOpts
    );
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatch(/Olá/);
    expect(blocks[1]).toMatch(/Estou entrando/);
  });

  it("25) três linhas com \\n simples = 1 bolha", () => {
    const blocks = splitAgentReplyIntoSmartBlocks("Mensagem 1\nMensagem 2\nMensagem 3", scriptOpts);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].split("\n")).toEqual(["Mensagem 1", "Mensagem 2", "Mensagem 3"]);
  });

  it("26) — sozinho une na mesma bolha e some", () => {
    const blocks = splitAgentReplyIntoSmartBlocks("Mensagem 1\n—\nMensagem 2", scriptOpts);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toBe("Mensagem 1\nMensagem 2");
    expect(blocks[0]).not.toMatch(/—/);
    expect(blocks[0]).not.toContain("\u2014");
  });

  it("26b) exemplo completo com —", () => {
    const blocks = splitAgentReplyIntoSmartBlocks(
      "Olá, tudo bem?\n—\nEstou entrando em contato com você.",
      scriptOpts
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toBe("Olá, tudo bem?\nEstou entrando em contato com você.");
  });

  it("26c) blank + —: 2 bolhas (blank separa; — une dentro da 2ª)", () => {
    const blocks = splitAgentReplyIntoSmartBlocks(
      "Mensagem 1\n\nMensagem 2\n—\nMensagem 3",
      scriptOpts
    );
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toBe("Mensagem 1");
    expect(blocks[1]).toBe("Mensagem 2\nMensagem 3");
  });

  it("26d) hífen ASCII - sozinho = 1 bolha com parágrafo em branco", () => {
    const blocks = splitAgentReplyIntoSmartBlocks("Mensagem 1\n-\nMensagem 2", scriptOpts);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toBe("Mensagem 1\n\nMensagem 2");
    expect(blocks[0]).not.toMatch(/(^|\n)-\s*(\n|$)/);
  });

  it("26d2) exemplo Leonardo: - = mesma bolha com espaço entre parágrafos", () => {
    const blocks = splitAgentReplyIntoSmartBlocks(
      "Opa João! Quem fala é o Leonardo Sena, co-fundador do Pajo CRM.\n-\nAntes de te passar o material e o link para garantir sua vaga, quero entender uma coisa:\nVocê pretende utilizar a ferramenta para *vender para seus próprios clientes* ou para *usar no seu dia a dia*?",
      scriptOpts
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatch(/Leonardo Sena/);
    expect(blocks[0]).toMatch(/co-fundador/);
    expect(blocks[0]).toMatch(/Antes de te passar/);
    expect(blocks[0]).toContain("\n\n");
    expect(blocks[0]).not.toMatch(/(^|\n)-\s*(\n|$)/);
  });

  it("26d3) linha em branco real (sem -) = bolhas separadas", () => {
    const blocks = splitAgentReplyIntoSmartBlocks(
      "Opa João! Quem fala é o Leonardo.\n\nAntes de te passar o material?",
      scriptOpts
    );
    expect(blocks).toHaveLength(2);
  });

  it("26e) lista com - item NÃO vira soft-break (preserva marcador de lista)", () => {
    const blocks = splitAgentReplyIntoSmartBlocks("Opções:\n- item um\n- item dois", scriptOpts);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain("- item um");
    expect(blocks[0]).toContain("- item dois");
  });

  it("27) sanitize preserva quebra simples", () => {
    const out = sanitizeAgentCustomerVisibleText("Olá\nTudo bem?");
    expect(out).toBe("Olá\nTudo bem?");
  });

  it("28) sanitize preserva linha em branco entre blocos", () => {
    const out = sanitizeAgentCustomerVisibleText("Olá\n\nTudo bem?");
    expect(out).toContain("\n\n");
  });

  it("29) URL completa sobrevive ao sanitize", () => {
    const url = "https://app.example.com/proposta/abc-123";
    expect(sanitizeAgentCustomerVisibleText(`Confira: ${url}`)).toContain(url);
  });

  it("30) URL intacta no modo roteiro com \\n simples", () => {
    const url = "https://vb.com.br/path/to/page";
    const blocks = splitAgentReplyIntoSmartBlocks(`Olá!\n${url}\n\nPosso ajudar?`, scriptOpts);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain(url);
    expect(blocks[0]).toContain("\n");
  });
});

describe("Roteiro Agente IA — tipo MIME preservado no WhatsApp", () => {
  it("31) PDF → document", () => {
    expect(resolveWhatsAppMediaKindFromMime("application/pdf", "x.pdf")).toBe("document");
  });

  it("32) TXT → document", () => {
    expect(resolveWhatsAppMediaKindFromMime("text/plain", "nota.txt")).toBe("document");
  });

  it("33) JPG → image", () => {
    expect(resolveWhatsAppMediaKindFromMime("image/jpeg", "a.jpg")).toBe("image");
  });

  it("34) PNG → image", () => {
    expect(resolveWhatsAppMediaKindFromMime("image/png", "a.png")).toBe("image");
  });

  it("35) WEBP → image", () => {
    expect(resolveWhatsAppMediaKindFromMime("image/webp", "a.webp")).toBe("image");
  });

  it("36) MP4 → video", () => {
    expect(resolveWhatsAppMediaKindFromMime("video/mp4", "v.mp4")).toBe("video");
  });

  it("37) áudio MPEG → audio", () => {
    expect(resolveWhatsAppMediaKindFromMime("audio/mpeg", "a.mp3")).toBe("audio");
  });

  it("38) OGG áudio → audio", () => {
    expect(resolveWhatsAppMediaKindFromMime("audio/ogg", "a.ogg")).toBe("audio");
  });

  it("39) DOCX → document", () => {
    expect(
      resolveWhatsAppMediaKindFromMime(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "doc.docx"
      )
    ).toBe("document");
  });

  it("40) octet-stream + .pdf resolve document pela extensão", () => {
    expect(resolveWhatsAppMediaKindFromMime("application/octet-stream", "arquivo.pdf")).toBe(
      "document"
    );
  });

  it("41) CSV → document", () => {
    expect(resolveWhatsAppMediaKindFromMime("text/csv", "lista.csv")).toBe("document");
  });

  it("42) ZIP → document", () => {
    expect(resolveWhatsAppMediaKindFromMime("application/zip", "pack.zip")).toBe("document");
  });
});

describe("Roteiro Agente IA — regras gerais combinadas", () => {
  it("43) bloco misto: texto, URL, #mídia e /ação", () => {
    const block = [
      "Olá, tudo bem?",
      "Veja: https://site.com/path/oferta",
      "",
      "Segue o material.",
      "#catalogo",
      "/agendamento"
    ].join("\n");
    expect(extractHashMediaSlugsFromScriptBlock(block)).toEqual(["catalogo"]);
    expect(extractSlashCommandSlugsFromScriptBlock(block)).toEqual(["agendamento"]);
    expect(matchScriptCommandSlugFromLine("Veja: https://site.com/path/oferta")).toBeNull();
  });

  it("44) strip comando preserva texto anterior", () => {
    expect(stripTrailingScriptToken("Ok /agendamento", "agendamento", "command")).toBe("Ok");
  });

  it("45) blank = 2 bolhas; — = 1 bolha sem travessão; \\n simples = 1 bolha", () => {
    expect(
      splitAgentReplyIntoSmartBlocks("Olá, tudo bem?\nEstou entrando.", {
        preserveScriptStructure: true
      })
    ).toHaveLength(1);

    const withDash = splitAgentReplyIntoSmartBlocks(
      "Olá, tudo bem?\n—\nGostaria de te apresentar nossa solução.",
      { preserveScriptStructure: true }
    );
    expect(withDash).toHaveLength(1);
    expect(withDash[0]).not.toMatch(/—/);

    const split = splitAgentReplyIntoSmartBlocks(
      "Olá, tudo bem?\n\nGostaria de te apresentar nossa solução.",
      { preserveScriptStructure: true }
    );
    expect(split).toHaveLength(2);
  });

  it("46) NÃO parte URL; lista com — fica 1 bolha", () => {
    const text = [
      "Você também pode testar o Pajo CRM gratuitamente:",
      "—",
      "✅ Teste grátis:http://www.example.com/register/teste-grátis",
      "—",
      "✅ Vídeos: https://youtube.com/playlist?list=PLBdcd6mqbBVE&si=ejMHu2BQnZBR10XE"
    ].join("\n");
    const blocks = splitAgentReplyIntoSmartBlocks(text, {
      preserveScriptStructure: true,
      maxChars: 450,
      maxBlocks: 12
    });
    expect(blocks).toHaveLength(1);
    const joined = blocks[0];
    expect(joined).toContain("http://www.example.com/register/teste-grátis");
    expect(joined).toContain("https://youtube.com/playlist?list=PLBdcd6mqbBVE&si=ejMHu2BQnZBR10XE");
    expect(joined).not.toMatch(/—/);
    expect(joined.split("\n").length).toBeGreaterThanOrEqual(3);
  });

  it("47) aceite Teste 3: /teste mid-text não é comando", () => {
    expect(matchScriptCommandSlugFromLine("Olá, /teste, tudo bem?")).toBeNull();
  });

  it("48) protectUrls + sentence mode também não parte domínio", () => {
    const url = "http://www.example.com/register/teste-grátis";
    const sentences = splitParagraphIntoSentences(`Veja o link ${url} agora.`);
    expect(sentences.join(" ")).toContain(url);
    const p = protectUrlsForSplit(`x ${url} y`);
    expect(p.text).not.toContain("example.com");
    expect(restoreUrlsAfterSplit(p.text, p.urls)).toContain(url);
  });
});
