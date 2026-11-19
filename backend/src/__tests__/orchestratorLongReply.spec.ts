import { truncateCustomerReply } from "../helpers/truncateCustomerReply";
import { splitAgentReplyIntoSmartBlocks } from "../helpers/agentOutboundBubbles";

describe("truncateCustomerReply + bolhas — FAQ/roteiro sem corte precoce", () => {
  it("preserva reply longo com quebras de linha acima de 1800", () => {
    const longReply = Array.from(
      { length: 60 },
      (_, i) => `Linha ${i + 1} do FAQ com detalhes do produto.`
    ).join("\n\n");
    expect(longReply.length).toBeGreaterThan(1800);
    const out = truncateCustomerReply(longReply, 8000);
    expect(out).toContain("Linha 1 do FAQ");
    expect(out).toContain("Linha 60 do FAQ");
    expect(out).toContain("\n\n");
  });

  it("nunca descarta o final ao fatiar em bolhas", () => {
    const parts = Array.from({ length: 20 }, (_, i) => `Parágrafo ${i + 1} do roteiro.`);
    const text = parts.join("\n\n");
    const blocks = splitAgentReplyIntoSmartBlocks(text, {
      preserveScriptStructure: true,
      maxBlocks: 8,
      neverDropRemainder: true
    });
    const joined = blocks.join("\n\n");
    expect(joined).toContain("Parágrafo 1");
    expect(joined).toContain("Parágrafo 20");
  });
});
