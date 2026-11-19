import {
  buildBottomItems,
  buildMoreSections,
  isCoveredByBottomItems,
  isPathActive,
} from "./navConfig";
import { isInternalAutomationUser } from "../../hooks/useNavPermissions";

const t = (s) => s;

const basePerms = {
  hasHelps: false,
  isFreeTrial: false,
  isInternalAutomationAdmin: false,
  showContacts: false,
  showFlow: false,
  showAgents: false,
  showSchedules: false,
  showCampaigns: false,
  showPlatformApi: true,
  showMessagesApi: false,
};

const allTargets = (sections) =>
  sections.flatMap((section) => section.items.map((item) => item.to));

describe("isPathActive", () => {
  it("matches exact path and nested paths only", () => {
    expect(isPathActive("/tickets", ["/tickets"])).toBe(true);
    expect(isPathActive("/tickets/abc-123", ["/tickets"])).toBe(true);
    expect(isPathActive("/ticketsx", ["/tickets"])).toBe(false);
    expect(isPathActive(undefined, ["/tickets"])).toBe(false);
  });
});

describe("buildBottomItems", () => {
  it("shows Atendimento, Contatos, Vendas e Integrações when contacts are allowed", () => {
    const items = buildBottomItems({ ...basePerms, showContacts: true }, t);
    expect(items.map((i) => i.to)).toEqual([
      "/tickets",
      "/contacts",
      "/leads-sales",
      "/connections",
    ]);
    expect(items[0].badgeKey).toBe("tickets");
  });

  it("omits Contatos when the user cannot see contacts", () => {
    const items = buildBottomItems(basePerms, t);
    expect(items.map((i) => i.key)).toEqual(["tickets", "sales", "integrations"]);
  });

  it("detects routes covered by the bottom bar", () => {
    const items = buildBottomItems({ ...basePerms, showContacts: true }, t);
    expect(isCoveredByBottomItems("/contacts", items)).toBe(true);
    expect(isCoveredByBottomItems("/schedules", items)).toBe(false);
    expect(isCoveredByBottomItems("/leads-convertidos", items)).toBe(true);
    expect(isCoveredByBottomItems("/allConnections", items)).toBe(true);
    expect(isCoveredByBottomItems("/settings", items)).toBe(false);
  });
});

describe("buildMoreSections", () => {
  it("hides items the user has no permission for and drops empty sections", () => {
    const sections = buildMoreSections(basePerms, t);
    const targets = allTargets(sections);
    expect(targets).not.toContain("/contacts");
    expect(targets).not.toContain("/flowbuilders");
    expect(targets).not.toContain("/campaigns");
    expect(targets).not.toContain("/prompts");
    expect(targets).not.toContain("/automacao-interna");
    expect(targets).not.toContain("/financeiro");
    expect(sections.find((s) => s.key === "automation")).toBeUndefined();
    expect(sections.find((s) => s.key === "internal")).toBeUndefined();
  });

  it("free trial: keeps Automações, hides API & MCP, shows API de mensagens", () => {
    const sections = buildMoreSections(
      {
        ...basePerms,
        isFreeTrial: true,
        showFlow: true,
        showPlatformApi: false,
        showMessagesApi: true,
      },
      t
    );
    const targets = allTargets(sections);
    expect(targets).toContain("/flowbuilders");
    expect(targets).toContain("/api");
    expect(targets).not.toContain("/platform-api");
  });

  it("only the internal admin sees Automação Interna", () => {
    const sections = buildMoreSections(
      { ...basePerms, isInternalAutomationAdmin: true },
      t
    );
    expect(allTargets(sections)).toEqual(
      expect.arrayContaining(["/automacao-interna", "/financeiro"])
    );
  });
});

describe("isInternalAutomationUser", () => {
  it("accepts only admin@admin.com (case/space insensitive)", () => {
    expect(isInternalAutomationUser({ email: "admin@admin.com" })).toBe(true);
    expect(isInternalAutomationUser({ email: "  Admin@Admin.com " })).toBe(true);
    expect(isInternalAutomationUser({ email: "admin@admin.com.br" })).toBe(false);
    expect(isInternalAutomationUser({ email: "user@empresa.com" })).toBe(false);
    expect(isInternalAutomationUser(null)).toBe(false);
  });
});
