import {
  classifyCustomerSideQuest,
  expandPausedSideQuestUserText,
  isClearTopicSideQuest,
  looksLikeBareAffirmationOrAck,
  shouldStayInPausedSideQuest,
  userMessageLooksLikeSideQuest,
  userWantsResumeAttendanceScript
} from "../helpers/customerSideQuestIntent";
import { processScriptMessage } from "../helpers/processScriptMessage";
import { plausibleFreeReplyAdvancesStep } from "../helpers/agentAttendanceFlowMemory";
import {
  inboundShouldStartAttendanceScript,
  inboundShouldYieldToAgentPersonalization
} from "../helpers/scriptContextGate";

describe("customerSideQuestIntent", () => {
  it("detecta suporte / API / configuração", () => {
    expect(
      classifyCustomerSideQuest("Preciso de suporte, não estou conseguindo configurar a API.")
    ).toBe("support");
    expect(userMessageLooksLikeSideQuest("Como configuro o webhook da API?")).toBe(true);
    expect(userMessageLooksLikeSideQuest("Quero o código-fonte")).toBe(true);
    expect(userMessageLooksLikeSideQuest("Qual o preço do plano?")).toBe(true);
    expect(classifyCustomerSideQuest("Tem API oficial?")).toBe("api");
    expect(isClearTopicSideQuest("Tem API oficial?")).toBe(true);
  });

  it("detecta retirar/tirar dúvidas e quero ajuda como side-quest", () => {
    expect(classifyCustomerSideQuest("Quero retirar dúvidas")).toBe("support");
    expect(userMessageLooksLikeSideQuest("Quero retirar dúvidas")).toBe(true);
    expect(userMessageLooksLikeSideQuest("quero tirar dúvidas")).toBe(true);
    expect(userMessageLooksLikeSideQuest("Tenho dúvidas sobre instalação")).toBe(true);
    expect(userMessageLooksLikeSideQuest("quero ajuda")).toBe(true);
    expect(
      userMessageLooksLikeSideQuest(
        "Olá! Estou na página do código-fonte do CRM e quero falar com o suporte. Tenho dúvidas sobre instalação, marca e recorrência."
      )
    ).toBe(true);
  });

  it("não trata respostas curtas de etapa como side-quest", () => {
    expect(userMessageLooksLikeSideQuest("sim")).toBe(false);
    expect(userMessageLooksLikeSideQuest("15/05 às 14h")).toBe(false);
    expect(userMessageLooksLikeSideQuest("ok")).toBe(false);
    expect(isClearTopicSideQuest("Quero vender para meus clientes")).toBe(false);
  });

  it("side-quest pausada: Sim continua no tema; retomar só com pedido claro", () => {
    expect(looksLikeBareAffirmationOrAck("Sim")).toBe(true);
    expect(looksLikeBareAffirmationOrAck("quero saber mais")).toBe(true);
    expect(shouldStayInPausedSideQuest("Sim")).toBe(true);
    expect(shouldStayInPausedSideQuest("quero saber mais")).toBe(true);
    expect(shouldStayInPausedSideQuest("vamos continuar")).toBe(false);
    expect(userWantsResumeAttendanceScript("pode seguir o atendimento")).toBe(true);
    expect(expandPausedSideQuestUserText("Sim", "api")).toMatch(/API Oficial/i);
  });
});

describe("marcador - com espaços / enter", () => {
  const ctx = {
    contact: { name: "João" },
    agentName: "Bot",
    companyName: "VB",
    now: new Date("2026-05-09T12:00:00.000Z")
  };

  it("remove - sozinho mesmo com espaços e enter", () => {
    expect(processScriptMessage("Olá,\n- \nTudo bem?", ctx)).toBe("Olá,\nTudo bem?");
    expect(processScriptMessage("Olá,\n   -   \nTudo bem?", ctx)).toBe("Olá,\nTudo bem?");
    expect(processScriptMessage("Olá,\n-\n\nTudo bem?", ctx)).toBe("Olá,\n\nTudo bem?");
    expect(processScriptMessage("Olá, *{{nome}}*!\n- \nSeu atendimento iniciou.", ctx)).toBe(
      "Olá, *João*!\nSeu atendimento iniciou."
    );
  });
});

describe("roteiro flexível — pergunta não avança etapa", () => {
  const qualStep =
    "Você pretende utilizar a ferramenta para vender para seus próprios clientes ou para usar no seu dia a dia?";

  it("Tem API oficial? não é resposta plausível à qualificação", () => {
    expect(plausibleFreeReplyAdvancesStep(qualStep, "Tem API oficial?")).toBe(false);
  });

  it("resposta de qualificação continua avançando", () => {
    expect(
      plausibleFreeReplyAdvancesStep(qualStep, "Quero vender para meus próprios clientes")
    ).toBe(true);
  });

  it("contexto do roteiro cede a dúvidas mid-funnel", () => {
    const ctx =
      'Comece o roteiro somente quando o cliente pedir a oferta do código-fonte ou "garantir sua vaga".';
    expect(inboundShouldStartAttendanceScript("Tem API oficial?", ctx)).toBe(false);
    expect(
      inboundShouldYieldToAgentPersonalization("Tem API oficial?", ctx, {
        flowInProgress: true
      })
    ).toBe(true);
  });

  it("contexto do roteiro NÃO dispara etapa 1 em dúvida / suporte", () => {
    const ctx = `Comece o roteiro (etapa 1 e seguintes) SOMENTE quando o cliente enviar algo equivalente a:
"Olá! Vi a oferta do código-fonte do CRM e quero garantir minha vaga."
(aceite variações com o mesmo sentido: interesse no código-fonte / garantir vaga / oferta do CRM).

Se a mensagem for dúvida, suporte, curiosidade ou pedido genérico ("quero ajuda", "como funciona?", "preço?", etc.):
NÃO dispare a etapa 1 automaticamente.
Responda com as Regras Gerais, FAQ, Base de conhecimento e Inventário do agente.
Só entre no roteiro depois que ficar claro que a pessoa quer garantir a vaga / material do código-fonte.`;

    expect(inboundShouldStartAttendanceScript("Quero retirar dúvidas", ctx)).toBe(false);
    expect(inboundShouldStartAttendanceScript("quero ajuda", ctx)).toBe(false);
    expect(
      inboundShouldStartAttendanceScript(
        "Olá! Estou na página do código-fonte do CRM e quero falar com o suporte. Tenho dúvidas sobre instalação, marca e recorrência.",
        ctx
      )
    ).toBe(false);
    expect(
      inboundShouldStartAttendanceScript(
        "Olá! Vi a oferta do código-fonte do CRM e quero garantir minha vaga.",
        ctx
      )
    ).toBe(true);
    expect(
      inboundShouldStartAttendanceScript(
        "Vi a oferta e quero garantir minha vaga no código-fonte do CRM",
        ctx
      )
    ).toBe(true);
    expect(inboundShouldStartAttendanceScript("Quero o código-fonte do CRM", ctx)).toBe(true);
  });

  it("contexto com 'só quando' (acento) engaja o gate", () => {
    const ctx = "Use as etapas só quando o cliente pedir para garantir a vaga do código-fonte.";
    expect(inboundShouldStartAttendanceScript("Quero retirar dúvidas", ctx)).toBe(false);
    expect(
      inboundShouldStartAttendanceScript("Quero garantir minha vaga no código-fonte", ctx)
    ).toBe(true);
  });
});
