import React, { useCallback, useMemo, useState } from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { createTheme, ThemeProvider } from "@material-ui/core/styles";
import { DrawerContext } from "../context/DrawerContext";
import SidebarToggleButton from "./SidebarToggleButton";

const theme = createTheme();

/** Reproduz o contrato do layout: contador de cabeçalhos + controle de reserva. */
function Harness({ available = true, showHeaderToggle = true, nestedHeader = false }) {
  const [open, setOpen] = useState(true);
  const [ids, setIds] = useState([]);
  const register = useCallback((id) => {
    setIds((list) => [...list, id]);
    return () => setIds((list) => list.filter((x) => x !== id));
  }, []);
  const activeId = ids.length ? ids[0] : null;
  const value = useMemo(
    () => ({
      drawerOpen: open,
      setDrawerOpen: setOpen,
      toggleSidebar: () => setOpen((v) => !v),
      sidebarToggleAvailable: available,
      registerHeaderToggle: register,
      activeHeaderToggleId: activeId,
    }),
    [open, available, register, activeId]
  );
  return (
    <ThemeProvider theme={theme}>
      <DrawerContext.Provider value={value}>
        <div data-testid="header">{showHeaderToggle && <SidebarToggleButton />}</div>
        <div data-testid="nested">{nestedHeader && <SidebarToggleButton />}</div>
        <div data-testid="fallback">{available && activeId === null && <SidebarToggleButton floating />}</div>
      </DrawerContext.Provider>
    </ThemeProvider>
  );
}

let container;
function mount(ui) {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    ReactDOM.render(ui, container);
  });
  return container;
}

afterEach(() => {
  ReactDOM.unmountComponentAtNode(container);
  document.body.innerHTML = "";
});

const q = (root, testId) => root.querySelector(`[data-testid="${testId}"] button`);

describe("SidebarToggleButton", () => {
  it("fica no cabeçalho e esconde o controle de reserva", () => {
    const view = mount(<Harness />);
    const btn = q(view, "header");
    expect(btn).not.toBeNull();
    expect(q(view, "fallback")).toBeNull();
    expect(btn.getAttribute("aria-label")).toBe("Recolher menu");
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(btn.getAttribute("aria-controls")).toBe("app-sidebar");
  });

  it("alterna o menu e atualiza rótulo e aria-expanded", () => {
    const view = mount(<Harness />);
    act(() => {
      q(view, "header").click();
    });
    const btn = q(view, "header");
    expect(btn.getAttribute("aria-label")).toBe("Expandir menu");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  it("sem cabeçalho com o controle, exibe o de reserva", () => {
    const view = mount(<Harness showHeaderToggle={false} />);
    expect(q(view, "header")).toBeNull();
    expect(q(view, "fallback")).not.toBeNull();
  });

  it("com cabeçalho embutido (página em aba), mostra só um controle", () => {
    const view = mount(<Harness nestedHeader />);
    expect(view.querySelectorAll("button")).toHaveLength(1);
    expect(q(view, "header")).not.toBeNull();
  });

  it("no mobile (menu pela barra inferior) não renderiza nada", () => {
    const view = mount(<Harness available={false} />);
    expect(view.querySelector("button")).toBeNull();
  });
});
