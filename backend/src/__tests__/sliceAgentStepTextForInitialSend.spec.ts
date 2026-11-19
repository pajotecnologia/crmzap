import {
  extractSlashCommandsFromTrainingTail,
  findAgendamentoSlugInStepScript,
  findTransferSlugInStepScript,
  matchScriptCommandSlugFromLine,
  sliceAgentStepTextForInitialSend,
  stepScriptMentionsAgendamentoCommand
} from "../helpers/agentScriptInitialSendSlice";

describe("sliceAgentStepTextForInitialSend", () => {
  it("remove bloco EXEMPLO… e RESPOSTA: (treinamento), mantendo só a Mensagem inicial", () => {
    const raw = `# ETAPA 1
Mensagem:
Olá! Bem-vindo 🐬
Me conta: qual data?
EXEMPLO DE RESPOSTA DO LEAD:
"20 de agosto"
RESPOSTA:
Perfeito 😊
Vou registrar sua preferência.
/agendamento`;
    const out = sliceAgentStepTextForInitialSend(raw);
    expect(out).toContain("qual data");
    expect(out).not.toMatch(/perfeito/i);
    expect(out).not.toMatch(/registrar sua prefer/i);
    expect(out).not.toMatch(/EXEMPLO/i);
    expect(out).not.toMatch(/\/agendamento/);
  });

  it("sem marcador EXEMPLO, não altera o corpo", () => {
    expect(sliceAgentStepTextForInitialSend("Apenas\numa\nmensagem")).toBe("Apenas\numa\nmensagem");
  });

  it("etapa-ramo (só EXEMPLO+RESPOSTA) envia o corpo da RESPOSTA intacto com URL e /midia", () => {
    const raw = `# ETAPA 2 — Cliente quer vender para clientes

EXEMPLO DE RESPOSTA DO LEAD:
"Quero vender para meus clientes"

RESPOSTA:

Perfeito!
Hoje a plataforma conta com:
✅ Código-fonte completo
✅ WhatsApp Web + API Oficial
/apresentacao

E você também pode testar:
✅ Teste grátis:http://www.example.com/register/teste-grátis
✅ Vídeos: https://youtube.com/playlist?list=PLBdcd6mqbBVE&si=ejMHu2BQnZBR10XE
`;
    const out = sliceAgentStepTextForInitialSend(raw);
    expect(out).toMatch(/^Perfeito!/);
    expect(out).toContain("http://www.example.com/register/teste-grátis");
    expect(out).toContain("https://youtube.com/playlist?list=PLBdcd6mqbBVE");
    expect(out).toContain("/apresentacao");
    expect(out).toContain("✅ Código-fonte completo");
    expect(out).not.toMatch(/EXEMPLO/i);
    expect(out).not.toMatch(/Quero vender para meus clientes/);
  });

  it("extractSlashCommandsFromTrainingTail lista /comandos após EXEMPLO", () => {
    const raw = `Mensagem:
Pergunta?
EXEMPLO DE RESPOSTA DO LEAD:
x
RESPOSTA:
ok
/agendar
/transferirchamado`;
    expect(extractSlashCommandsFromTrainingTail(raw)).toEqual(["agendar", "transferirchamado"]);
    expect(extractSlashCommandsFromTrainingTail("sem exemplo\n/agendar")).toEqual([]);
  });

  it("matchScriptCommandSlugFromLine só linha isolada /slug (nunca mid-text nem URL)", () => {
    expect(matchScriptCommandSlugFromLine("/agendamento")).toBe("agendamento");
    expect(matchScriptCommandSlugFromLine("\u200e /agendamento")).toBe("agendamento");
    expect(matchScriptCommandSlugFromLine("Perfeito /agendamento")).toBeNull();
    expect(matchScriptCommandSlugFromLine("Olá, /teste, tudo bem?")).toBeNull();
    expect(matchScriptCommandSlugFromLine("RESPOSTA: /transferirchamado")).toBeNull();
    expect(matchScriptCommandSlugFromLine("https://site.com/agendamento")).toBeNull();
    expect(matchScriptCommandSlugFromLine("VPS /servidor com estrutura")).toBeNull();
  });

  it("findAgendamentoSlugInStepScript encontra /agendar no tail após EXEMPLO", () => {
    const raw = `Pergunta data?
EXEMPLO DE RESPOSTA DO LEAD:
31/05
RESPOSTA:
/agendar`;
    expect(findAgendamentoSlugInStepScript(raw)).toBe("agendar");
    expect(stepScriptMentionsAgendamentoCommand(raw)).toBe(true);
  });

  it("findTransferSlugInStepScript encontra transferência no tail", () => {
    const raw = `Ok
EXEMPLO DE RESPOSTA DO LEAD:
sim
RESPOSTA:
/transferirchamado`;
    expect(findTransferSlugInStepScript(raw)).toBe("transferirchamado");
  });
});
