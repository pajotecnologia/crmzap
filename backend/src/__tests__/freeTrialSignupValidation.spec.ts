import {
  FREE_TRIAL_IP_LIMIT,
  validateFreeTrialEmail,
  validateFreeTrialPhone
} from "../helpers/freeTrialSignupValidation";

describe("free trial signup validation", () => {
  it("normaliza e-mail e rejeita formato inválido", () => {
    expect(validateFreeTrialEmail("  Ana@Exemplo.COM ")).toBe("ana@exemplo.com");
    expect(() => validateFreeTrialEmail("sem-arroba")).toThrow(/E-mail inválido/);
  });

  it("normaliza telefone BR sem apagar o nono dígito", () => {
    expect(validateFreeTrialPhone("(11) 98888-7777")).toBe("5511988887777");
    expect(validateFreeTrialPhone("+55 11 98888-7777")).toBe("5511988887777");
    expect(validateFreeTrialPhone("1133334444")).toBe("551133334444");
    expect(() => validateFreeTrialPhone("123")).toThrow(/Telefone inválido/);
  });

  it("mantém limite comercial de cinco cadastros por IP", () => {
    expect(FREE_TRIAL_IP_LIMIT).toBe(5);
  });
});
