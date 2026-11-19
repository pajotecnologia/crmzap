import {
  buildScriptVariableMap,
  convertScriptLineBreakMarkers,
  processScriptMessage,
  resolveScriptVariables
} from "../helpers/processScriptMessage";
import { splitAgentReplyIntoSmartBlocks } from "../helpers/agentOutboundBubbles";

describe("processScriptMessage — variáveis + travessão", () => {
  const ctx = {
    contact: {
      name: "João Silva",
      number: "5511999990000",
      email: "joao@exemplo.com",
      extraInfo: [
        { name: "numero_pedido", value: "PED-42" },
        { name: "cidade", value: "São Paulo" }
      ]
    },
    ticket: { id: 99 },
    agentName: "Bot Vendas",
    companyName: "VBSolution",
    now: new Date("2026-05-09T14:30:00.000-03:00")
  };

  it("Caso 1 — variável simples {{nome}}", () => {
    expect(processScriptMessage("Olá, {{nome}}!", ctx)).toBe("Olá, João Silva!");
  });

  it("Caso 2 — variável com negrito *{{nome}}*", () => {
    expect(processScriptMessage("Olá, *{{nome}}*!", ctx)).toBe("Olá, *João Silva*!");
  });

  it("Caso 3 — hífen - = parágrafo na mesma bolha (sem enviar o marcador)", () => {
    const out = processScriptMessage("Olá, João!\n-\nTudo bem?", ctx);
    expect(out).toContain("Olá, João!");
    expect(out).toContain("Tudo bem?");
    expect(out).not.toMatch(/(^|\n)-\s*(\n|$)/);
    const blocks = splitAgentReplyIntoSmartBlocks(out, { preserveScriptStructure: true });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toBe("Olá, João!\n\nTudo bem?");
  });

  it("Caso 4 — variável + hífen - (mesma bolha com parágrafo)", () => {
    const out = processScriptMessage(
      "Olá, *{{nome}}*!\n-\nSeu atendimento foi iniciado.",
      ctx
    );
    expect(out).toContain("*João Silva*");
    expect(out).toContain("Seu atendimento foi iniciado.");
    expect(out).not.toMatch(/(^|\n)-\s*(\n|$)/);
  });

  it("Caso 5 — múltiplas variáveis (sistema + extraInfo)", () => {
    const out = processScriptMessage(
      "Oi {{nome}}, sou {nome_agente} da {nome_empresa}. Pedido {{numero_pedido}} em {{cidade}}.",
      ctx
    );
    expect(out).toContain("João Silva");
    expect(out).toContain("Bot Vendas");
    expect(out).toContain("VBSolution");
    expect(out).toContain("PED-42");
    expect(out).toContain("São Paulo");
    expect(out).not.toMatch(/\{\{?nome/);
    expect(out).not.toContain("{{numero_pedido}}");
  });

  it("Caso 6 — mídia/link + variável (URL intacta)", () => {
    const url = "https://app.example.com/proposta/abc-123";
    const out = processScriptMessage(
      `Olá, *{{nome}}*!\n-\nConfira: ${url}\n#catalogo`,
      ctx
    );
    expect(out).toContain("*João Silva*");
    expect(out).toContain(url);
    expect(out).toContain("#catalogo");
    expect(out).not.toMatch(/(^|\n)-\s*(\n|$)/);
  });

  it("preserva formatação WhatsApp _, ~ ao redor da variável", () => {
    expect(processScriptMessage("_{{nome}}_", ctx)).toBe("_João Silva_");
    expect(processScriptMessage("~{{nome}}~", ctx)).toBe("~João Silva~");
    expect(processScriptMessage("*{nome_contato}*", ctx)).toBe("*João Silva*");
  });

  it("variável ausente não quebra o envio (fica vazia se conhecida; desconhecida intacta)", () => {
    const emptyCtx = {
      contact: { name: "", number: "", email: "", extraInfo: [] },
      agentName: "",
      companyName: "",
      now: new Date("2026-05-09T14:30:00.000-03:00")
    };
    expect(processScriptMessage("Olá, {{nome}}!", emptyCtx)).toBe("Olá, !");
    expect(processScriptMessage("Código {{xyz_inexistente}} ok", emptyCtx)).toBe(
      "Código {{xyz_inexistente}} ok"
    );
  });

  it("hífen em lista / URL / palavra NÃO é removido", () => {
    const out = processScriptMessage(
      "e-mail: a@b.com\nhttps://site.com/a-b\n- item um\n- item dois",
      ctx
    );
    expect(out).toContain("e-mail");
    expect(out).toContain("https://site.com/a-b");
    expect(out).toContain("- item um");
    expect(out).toContain("- item dois");
  });

  it("após processScriptMessage, split mantém 1 bolha com parágrafo pelo -", () => {
    const finalText = processScriptMessage(
      "Olá, *{{nome}}*!\n-\nSeu atendimento foi iniciado.",
      ctx
    );
    const blocks = splitAgentReplyIntoSmartBlocks(finalText, {
      preserveScriptStructure: true
    });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toBe("Olá, *João Silva*!\n\nSeu atendimento foi iniciado.");
  });
});

describe("helpers internos processScriptMessage", () => {
  it("buildScriptVariableMap inclui aliases e extraInfo", () => {
    const map = buildScriptVariableMap({
      contact: {
        name: "Ana",
        number: "11",
        extraInfo: [{ name: "CPF", value: "123" }]
      },
      companyName: "ACME"
    });
    expect(map.nome).toBe("Ana");
    expect(map.nome_contato).toBe("Ana");
    expect(map.empresa).toBe("ACME");
    expect(map.cpf).toBe("123");
  });

  it("resolveScriptVariables não altera texto sem placeholders", () => {
    expect(resolveScriptVariables("texto puro", { nome: "X" })).toBe("texto puro");
  });

  it("convertScriptLineBreakMarkers: - = parágrafo mesma bolha; — = quebra simples; blank = bolha nova", () => {
    expect(convertScriptLineBreakMarkers("A\n—\nB")).toBe("A\nB");
    const withDash = convertScriptLineBreakMarkers("A\n-\nB");
    expect(withDash).not.toMatch(/(^|\n)-\s*(\n|$)/);
    const blocks = splitAgentReplyIntoSmartBlocks(withDash, { preserveScriptStructure: true });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toBe("A\n\nB");
    expect(convertScriptLineBreakMarkers("A\n–\nB")).toBe("A\nB");
    expect(splitAgentReplyIntoSmartBlocks("A\n\nB", { preserveScriptStructure: true })).toHaveLength(2);
  });
});
