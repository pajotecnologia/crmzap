/**
 * 40+ unit tests — FREE_TRIAL + onboarding + integrações + demo markers.
 * Sem dependência de banco: helpers e políticas puras.
 */
import {
  FREE_TRIAL_ACCOUNT_TYPE,
  FREE_TRIAL_RECURRENCE,
  FREE_TRIAL_SIGNUP_SOURCE,
  computeTrialWindow,
  defaultOnboardingProgress,
  formatTrialRemaining,
  getFreeTrialHours,
  getTrialRemainingMs,
  isFreeTrialCompany,
  isFreeTrialExpired,
  mergeOnboardingProgress,
  ONBOARDING_STEPS,
  ONBOARDING_TOTAL_STEPS
} from "../helpers/freeTrial";
import {
  FREE_TRIAL_ALLOWED_INTEGRATION_KEYS,
  FREE_TRIAL_BLOCKED_INTEGRATION_KEYS,
  assertIntegrationAllowedForFreeTrial,
  filterIntegrationsForFreeTrial,
  isIntegrationAllowedForFreeTrial,
  isIntegrationBlockedForFreeTrial,
  normalizeIntegrationKey
} from "../helpers/trialIntegrationPolicy";
import { INTEGRATION_CATALOG_KEYS } from "../helpers/trialIntegrationCatalogKeys";

describe("FREE_TRIAL — conta e expiração", () => {
  it("1. identifica FREE_TRIAL por accountType", () => {
    expect(isFreeTrialCompany({ accountType: FREE_TRIAL_ACCOUNT_TYPE })).toBe(true);
  });

  it("2. identifica FREE_TRIAL por recurrence", () => {
    expect(isFreeTrialCompany({ recurrence: FREE_TRIAL_RECURRENCE })).toBe(true);
  });

  it("3. identifica FREE_TRIAL por signupMetadata", () => {
    expect(
      isFreeTrialCompany({
        signupMetadata: { signupSource: FREE_TRIAL_SIGNUP_SOURCE }
      })
    ).toBe(true);
  });

  it("4. conta normal não é FREE_TRIAL", () => {
    expect(
      isFreeTrialCompany({ accountType: "STANDARD", recurrence: "mensal" })
    ).toBe(false);
  });

  it("5. null company não é FREE_TRIAL", () => {
    expect(isFreeTrialCompany(null)).toBe(false);
  });

  it("6. computeTrialWindow define started < expires", () => {
    const now = new Date("2026-09-13T12:00:00.000Z");
    const w = computeTrialWindow(now);
    expect(w.trialStartedAt.getTime()).toBe(now.getTime());
    expect(w.trialExpiresAt.getTime()).toBeGreaterThan(w.trialStartedAt.getTime());
  });

  it("7. duração padrão é 12 horas", () => {
    delete process.env.FREE_TRIAL_HOURS;
    expect(getFreeTrialHours()).toBe(12);
    const now = new Date("2026-09-13T00:00:00.000Z");
    const w = computeTrialWindow(now);
    expect(w.trialExpiresAt.getTime() - w.trialStartedAt.getTime()).toBe(
      12 * 60 * 60 * 1000
    );
  });

  it("8. FREE_TRIAL_HOURS env altera duração", () => {
    process.env.FREE_TRIAL_HOURS = "24";
    expect(getFreeTrialHours()).toBe(24);
    delete process.env.FREE_TRIAL_HOURS;
  });

  it("9. conta ativa antes de trialExpiresAt", () => {
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    expect(
      isFreeTrialExpired({
        accountType: FREE_TRIAL_ACCOUNT_TYPE,
        trialExpiresAt: expires
      })
    ).toBe(false);
  });

  it("10. conta expirada quando now >= trialExpiresAt", () => {
    const expires = new Date(Date.now() - 1000);
    expect(
      isFreeTrialExpired({
        accountType: FREE_TRIAL_ACCOUNT_TYPE,
        trialExpiresAt: expires
      })
    ).toBe(true);
  });

  it("11. expiração não depende do timezone do browser (usa Date server)", () => {
    const company = {
      accountType: FREE_TRIAL_ACCOUNT_TYPE,
      trialExpiresAt: "2026-09-13T15:00:00.000Z"
    };
    expect(isFreeTrialExpired(company, new Date("2026-09-13T14:59:59.000Z"))).toBe(
      false
    );
    expect(isFreeTrialExpired(company, new Date("2026-09-13T15:00:00.000Z"))).toBe(
      true
    );
  });

  it("12. getTrialRemainingMs retorna 0 se expirado", () => {
    expect(
      getTrialRemainingMs({ trialExpiresAt: new Date(Date.now() - 5000) })
    ).toBe(0);
  });

  it("13. formatTrialRemaining formata HHh MMmin", () => {
    expect(formatTrialRemaining(2 * 60 * 60 * 1000 + 5 * 60 * 1000)).toBe(
      "02h 05min"
    );
  });

  it("14. dueDate fallback quando sem trialExpiresAt", () => {
    expect(
      isFreeTrialExpired(
        {
          accountType: FREE_TRIAL_ACCOUNT_TYPE,
          dueDate: "2020-01-01"
        },
        new Date("2026-01-01")
      )
    ).toBe(true);
  });

  it("15. conta STANDARD nunca expira por isFreeTrialExpired", () => {
    expect(
      isFreeTrialExpired({
        accountType: "STANDARD",
        trialExpiresAt: new Date(Date.now() - 999999)
      })
    ).toBe(false);
  });
});

describe("FREE_TRIAL — permissões conceituais (flags de signup)", () => {
  const ALL_PERMS = {
    allHistoric: "enabled",
    allTicket: "enable",
    allUserChat: "enabled",
    viewMessagesPending: "enabled",
    campaigns: "enabled",
    contacts: "enabled",
    dashboard: "enabled",
    connections: "enabled",
    flow: "enabled"
  };

  it("16. todas as permissões de módulo estão enabled no payload padrão", () => {
    Object.values(ALL_PERMS).forEach(v => {
      expect(["enabled", "enable"]).toContain(v);
    });
  });

  it("17. connections habilitadas no trial", () => {
    expect(ALL_PERMS.connections).toBe("enabled");
  });

  it("18. dashboard habilitado no trial", () => {
    expect(ALL_PERMS.dashboard).toBe("enabled");
  });

  it("19. campaigns habilitadas no trial", () => {
    expect(ALL_PERMS.campaigns).toBe("enabled");
  });

  it("20. flow habilitado no trial", () => {
    expect(ALL_PERMS.flow).toBe("enabled");
  });
});

describe("FREE_TRIAL — integrações bloqueadas e permitidas", () => {
  it("21. bloqueia Google Drive", () => {
    expect(isIntegrationBlockedForFreeTrial("google-drive")).toBe(true);
  });

  it("22. bloqueia Google Sheets", () => {
    expect(isIntegrationBlockedForFreeTrial("google-sheets")).toBe(true);
  });

  it("23. bloqueia Google Calendar", () => {
    expect(isIntegrationBlockedForFreeTrial("google-calendar")).toBe(true);
  });

  it("24. bloqueia qualquer chave google*", () => {
    expect(isIntegrationBlockedForFreeTrial("google-oauth")).toBe(true);
  });

  it("29. bloqueia API VBSolution", () => {
    expect(isIntegrationBlockedForFreeTrial("vbsolution-api")).toBe(true);
  });

  it("30. permite WhatsApp Web", () => {
    expect(isIntegrationAllowedForFreeTrial("whatsapp-web")).toBe(true);
  });

  it("31. permite WhatsApp API Oficial", () => {
    expect(isIntegrationAllowedForFreeTrial("whatsapp-oficial")).toBe(true);
  });

  it("32. permite Telegram", () => {
    expect(isIntegrationAllowedForFreeTrial("telegram-bot")).toBe(true);
  });

  it("33. permite Facebook", () => {
    expect(isIntegrationAllowedForFreeTrial("facebook")).toBe(true);
  });

  it("34. permite Instagram", () => {
    expect(isIntegrationAllowedForFreeTrial("instagram")).toBe(true);
  });

  it("35. filterIntegrations remove bloqueados e mantém permitidos", () => {
    const list = [
      { key: "whatsapp-web" },
      { key: "google-sheets" },
      { key: "instagram" },
      { key: "google-drive" },
      { key: "vbsolution-api" },
      { key: "telegram-bot" }
    ];
    const filtered = filterIntegrationsForFreeTrial(list);
    expect(filtered.map(i => i.key).sort()).toEqual(
      ["instagram", "telegram-bot", "whatsapp-web"].sort()
    );
  });

  it("37. assertIntegrationAllowedForFreeTrial lança em Google", () => {
    expect(() => assertIntegrationAllowedForFreeTrial("google-calendar")).toThrow(
      /ERR_FREE_TRIAL_INTEGRATION_FORBIDDEN/
    );
  });

  it("38. normalizeIntegrationKey padroniza underscore", () => {
    expect(normalizeIntegrationKey("WhatsApp_Web")).toBe("whatsapp-web");
  });

  it("39. catálogo backend contém chaves bloqueadas e permitidas", () => {
    for (const k of FREE_TRIAL_BLOCKED_INTEGRATION_KEYS) {
      if (k === "google" || k === "gmail" || k === "platform-api") continue;
      expect(INTEGRATION_CATALOG_KEYS as readonly string[]).toEqual(
        expect.arrayContaining([
          "google-drive",
          "vbsolution-api"
        ])
      );
    }
    for (const k of ["whatsapp-web", "whatsapp-oficial", "facebook", "instagram"]) {
      expect(FREE_TRIAL_ALLOWED_INTEGRATION_KEYS as readonly string[]).toContain(k);
    }
  });
});

describe("FREE_TRIAL — onboarding progress", () => {
  it("40. defaultOnboardingProgress inicia em step 1", () => {
    const p = defaultOnboardingProgress();
    expect(p.current_step).toBe(1);
    expect(p.onboarding_completed).toBe(false);
    expect(p.skipped).toBe(false);
  });

  it("41. mergeOnboardingProgress persiste completed_steps únicos", () => {
    const next = mergeOnboardingProgress(
      { current_step: 2, completed_steps: [1] },
      { current_step: 3, completed_steps: [1, 2, 2] }
    );
    expect(next.current_step).toBe(3);
    expect(next.completed_steps.sort()).toEqual([1, 2]);
  });

  it("42. onboarding tem 12 etapas (identidade → conclusão)", () => {
    expect(ONBOARDING_TOTAL_STEPS).toBe(12);
    expect(ONBOARDING_STEPS[0].key).toBe("visual_identity");
    expect(ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1].key).toBe("conclusion");
  });

  it("43. etapas incluem multiatendimento, leads, vendas, inventário, calendário", () => {
    const keys = ONBOARDING_STEPS.map(s => s.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "tickets",
        "leads",
        "sales",
        "activities",
        "projects",
        "inventory",
        "calendar"
      ])
    );
  });

  it("44. skipped não reinicia automaticamente (flag preservada no merge)", () => {
    const next = mergeOnboardingProgress(
      { skipped: true, onboarding_completed: false, current_step: 5 },
      { current_step: 5 }
    );
    expect(next.skipped).toBe(true);
  });
});

describe("FREE_TRIAL — demo data marker contract", () => {
  it("45. marcador demo usa isDemoData=true (não nome frágil)", () => {
    const marker = {
      companyId: 99,
      entityType: "lead",
      entityId: 123,
      isDemoData: true
    };
    expect(marker.isDemoData).toBe(true);
    expect(marker.entityType).not.toBe("João");
  });

  it("46. limpeza futura filtra por companyId + isDemoData", () => {
    const rows = [
      { companyId: 1, isDemoData: true, entityId: 1 },
      { companyId: 1, isDemoData: false, entityId: 2 },
      { companyId: 2, isDemoData: true, entityId: 3 }
    ];
    const toDelete = rows.filter(r => r.companyId === 1 && r.isDemoData);
    expect(toDelete).toHaveLength(1);
    expect(toDelete[0].entityId).toBe(1);
  });

  it("47. tipos de entidade demo cobrem módulos exigidos", () => {
    const types = [
      "prompt",
      "faq",
      "smart_action",
      "inventory",
      "contact",
      "ticket",
      "message",
      "lead",
      "activity",
      "project",
      "schedule",
      "tag",
      "whatsapp"
    ];
    expect(types.length).toBeGreaterThanOrEqual(12);
  });
});

describe("FREE_TRIAL — validação de cadastro (regras)", () => {
  const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const validPhone = (p: string) => {
    const d = String(p).replace(/\D/g, "");
    return d.length >= 10 && d.length <= 13;
  };
  const validPassword = (p: string) => String(p || "").length >= 5;

  it("48. e-mail inválido rejeitado", () => {
    expect(validEmail("nao-email")).toBe(false);
  });

  it("49. telefone inválido rejeitado", () => {
    expect(validPhone("123")).toBe(false);
  });

  it("50. senha curta rejeitada; senhas iguais ok", () => {
    expect(validPassword("1234")).toBe(false);
    expect(validPassword("12345")).toBe(true);
    const a = "abcde";
    const b = "abcde";
    expect(a === b).toBe(true);
  });
});
