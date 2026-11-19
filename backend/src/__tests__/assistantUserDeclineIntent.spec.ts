import {
  assistantTextFalselyConfirmsSchedule,
  buildSoftDeclineDeferralReply,
  userExpressesSoftDeclineOrDeferral
} from "../helpers/assistantUserDeclineIntent";

describe("assistantUserDeclineIntent", () => {
  it("detects soft decline and deferral phrases from the WhatsApp bug", () => {
    expect(userExpressesSoftDeclineOrDeferral("Acho que nao quero... pode ser depois")).toBe(true);
    expect(userExpressesSoftDeclineOrDeferral("Na verdade nao sei que quero... acho que não.")).toBe(
      true
    );
    expect(userExpressesSoftDeclineOrDeferral("Acho melhor nao... talvez depois...")).toBe(true);
    expect(userExpressesSoftDeclineOrDeferral("Acho melhor nao")).toBe(true);
    expect(userExpressesSoftDeclineOrDeferral("talvez depois")).toBe(true);
    expect(userExpressesSoftDeclineOrDeferral("não tenho interesse")).toBe(true);
    expect(userExpressesSoftDeclineOrDeferral("Pode sim")).toBe(false);
    expect(userExpressesSoftDeclineOrDeferral("amanhã às 14h")).toBe(false);
  });

  it("detects false schedule confirmation copy", () => {
    expect(
      assistantTextFalselyConfirmsSchedule(
        "Vou deixar separado o horário combinado e te envio o link da reunião por aqui. Até lá"
      )
    ).toBe(true);
    expect(assistantTextFalselyConfirmsSchedule("Qual horário costuma funcionar melhor pra você?")).toBe(
      false
    );
  });

  it("builds a deferral-friendly reply", () => {
    const reply = buildSoftDeclineDeferralReply("pode ser depois");
    expect(reply.toLowerCase()).toMatch(/tranquilo|sem press/);
    expect(reply.toLowerCase()).not.toMatch(/horário combinado|link da reunião/);
  });
});
