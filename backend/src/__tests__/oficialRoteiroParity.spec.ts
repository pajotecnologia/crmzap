import {
  OFICIAL_AGENT_PIPELINE_ORDER,
  oficialPipelineMatchesBaileys,
  restoreOficialRoteiroLlmFlagsAfterReload
} from "../services/WhatsAppOficial/oficialRoteiroParity";
import {
  inboundShouldStartAttendanceScript,
  inboundShouldYieldToAgentPersonalization,
  readPromptScriptContext
} from "../helpers/scriptContextGate";

describe("oficialRoteiroParity — ordem e flags = Baileys", () => {
  it("pipeline oficial espelha handleOpenAi (sem schedule antes do roteiro)", () => {
    expect(
      oficialPipelineMatchesBaileys([...OFICIAL_AGENT_PIPELINE_ORDER])
    ).toBe(true);
    expect(OFICIAL_AGENT_PIPELINE_ORDER.indexOf("attendance_flow")).toBeLessThan(
      OFICIAL_AGENT_PIPELINE_ORDER.indexOf("schedule_meeting")
    );
    expect(OFICIAL_AGENT_PIPELINE_ORDER.indexOf("inventory_early")).toBeLessThan(
      OFICIAL_AGENT_PIPELINE_ORDER.indexOf("attendance_flow")
    );
  });

  it("restaura side-quest após reload em script_context_block_start", () => {
    const ticket: any = {
      dataWebhook: {},
      __sideQuestDeferToLlm: false
    };
    restoreOficialRoteiroLlmFlagsAfterReload({
      ticket,
      promptId: 10,
      bodyMessage: "Quero retirar dúvidas",
      flowEarly: {
        allowLlmFallback: true,
        reason: "script_context_block_start"
      }
    });
    expect(ticket.__sideQuestDeferToLlm).toBe(true);
    expect(ticket.__lastUserText).toBe("Quero retirar dúvidas");
  });

  it("restaura side-quest após reload em script_context_yield_llm", () => {
    const ticket: any = { dataWebhook: {} };
    restoreOficialRoteiroLlmFlagsAfterReload({
      ticket,
      promptId: 10,
      bodyMessage: "Tem API oficial?",
      flowEarly: {
        allowLlmFallback: true,
        reason: "script_context_yield_llm"
      }
    });
    expect(ticket.__sideQuestDeferToLlm).toBe(true);
  });

  it("restaura a partir de pausedForSideQuest persistido no dataWebhook", () => {
    const ticket: any = {
      dataWebhook: {
        attendanceFlow: {
          promptId: 10,
          pausedForSideQuest: true,
          sideQuestKind: "support_or_system",
          lastPresentedStep: 2,
          awaitingUserReply: true
        }
      }
    };
    restoreOficialRoteiroLlmFlagsAfterReload({
      ticket,
      promptId: 10,
      bodyMessage: "e a instalação?",
      flowEarly: { allowLlmFallback: false, reason: "v1_consumed" }
    });
    expect(ticket.__sideQuestDeferToLlm).toBe(true);
    expect(ticket.__pausedSideQuestKind).toBe("support_or_system");
  });
});

describe("scriptContextGate no Oficial (mesmo helper do Baileys)", () => {
  const ctx = `
Comece o roteiro somente quando o cliente disser algo como
"Quero garantir minha vaga no código-fonte".
Se pedir dúvidas/suporte/ajuda, NÃO inicie o funil — use FAQ e personalização.
`;

  it("readPromptScriptContext lê coluna e cargo", () => {
    expect(
      readPromptScriptContext({
        attendanceScriptContext: "  contexto coluna  "
      })
    ).toBe("contexto coluna");
    expect(
      readPromptScriptContext({
        cargo: { guimoV2Attendance: { scriptContext: "do cargo" } }
      })
    ).toBe("do cargo");
  });

  it("dúvida NÃO dispara etapa 1; oferta dispara", () => {
    expect(inboundShouldStartAttendanceScript("Quero retirar dúvidas", ctx)).toBe(
      false
    );
    expect(inboundShouldStartAttendanceScript("Tem API oficial?", ctx)).toBe(
      false
    );
    expect(
      inboundShouldStartAttendanceScript(
        "Quero garantir minha vaga no código-fonte",
        ctx
      )
    ).toBe(true);
  });

  it("mid-funnel yield: dúvida cede à personalização", () => {
    expect(
      inboundShouldYieldToAgentPersonalization("Como faço a instalação?", ctx, {
        flowInProgress: true
      })
    ).toBe(true);
    expect(
      inboundShouldYieldToAgentPersonalization("sim", ctx, {
        flowInProgress: true
      })
    ).toBe(false);
  });
});
