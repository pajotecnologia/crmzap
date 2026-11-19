import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { createTheme, ThemeProvider } from "@material-ui/core/styles";
import DesktopSidebarFooter from "./DesktopSidebarFooter";

jest.mock("../components/NotificationsPopOver", () => ({ renderTrigger }) =>
  renderTrigger({ onClick: () => {}, ref: { current: null }, badgeCount: 3 })
);
jest.mock("../components/FreemiumTrialBar", () => () => null);
jest.mock("../components/PageHelpDialog", () => () => null);
jest.mock("../translate/i18n", () => ({ i18n: { t: (k) => k, language: "pt-BR" } }));

const theme = createTheme({ palette: { sidebarMenuIsDarkLogo: false } });
const user = { id: 1, name: "Maria Souza", email: "maria@example.com" };

function renderFooter(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    ReactDOM.render(
      <ThemeProvider theme={theme}>
        <DesktopSidebarFooter
          user={user}
          profileUrl=""
          onOpenProfile={() => {}}
          onLogout={() => {}}
          onUnreadCountChange={() => {}}
          {...props}
        />
      </ThemeProvider>,
      container
    );
  });
  return container;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DesktopSidebarFooter", () => {
  it("mostra notificações ao lado dos três pontos, tema e perfil; sem Informativos", () => {
    const el = renderFooter({ collapsed: false, isDark: false, onToggleTheme: () => {} });
    const bell = el.querySelector('[aria-label="Notificações"]');
    const kebab = el.querySelector('[aria-label="Menu do perfil"]');
    expect(bell).not.toBeNull();
    expect(bell.textContent).toContain("3");
    expect(bell.nextElementSibling).toBe(kebab);
    expect(el.textContent).not.toContain("Informativos");
    expect(el.textContent).toContain("Claro");
    expect(el.textContent).toContain("Escuro");
    expect(el.textContent).toContain("Maria Souza");
    expect(el.textContent).toContain("maria@example.com");
  });

  it("só alterna o tema ao escolher o modo diferente do atual", () => {
    const toggle = jest.fn();
    const el = renderFooter({ collapsed: false, isDark: false, onToggleTheme: toggle });
    const [light, dark] = el.querySelectorAll('[role="radio"]');
    act(() => light.click());
    expect(toggle).not.toHaveBeenCalled();
    act(() => dark.click());
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("recolhido mantém nomes acessíveis, mas esconde o texto do perfil", () => {
    const el = renderFooter({ collapsed: true, isDark: true, onToggleTheme: () => {} });
    const hidden = Array.from(el.querySelectorAll('[aria-hidden="true"]'));
    expect(hidden.some((n) => n.textContent.includes("Maria Souza"))).toBe(true);
    expect(el.querySelector('[aria-label="Modo claro"]')).not.toBeNull();
    expect(el.querySelector('[aria-label="Notificações"]')).not.toBeNull();
    expect(el.querySelector('[aria-label="Menu do perfil"]')).not.toBeNull();
  });

  it("menu de três pontos traz o Brain AI e navega ao clicar", () => {
    const openBrain = jest.fn();
    const el = renderFooter({
      collapsed: false,
      isDark: false,
      onToggleTheme: () => {},
      onOpenBrainAi: openBrain,
    });
    const trigger = el.querySelector('[aria-label="Menu do perfil"]');
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    act(() => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    const items = Array.from(document.querySelectorAll('[role="menuitem"]'));
    const brain = items.find((i) => i.textContent.includes("Brain AI"));
    expect(brain).toBeTruthy();
    expect(items.some((i) => i.textContent.includes("mainDrawer.appBar.user.logout"))).toBe(true);

    act(() => brain.click());
    expect(openBrain).toHaveBeenCalledTimes(1);
  });
});
