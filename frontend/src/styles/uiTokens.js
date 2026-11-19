/**
 * Tokens de interface do CRM (bordas, fundos de estado, raios e espaçamentos).
 * Fonte única para makeStyles (via getUiTokens) e CSS puro (via variáveis --vb-ui-*,
 * publicadas no :root pelo tema em AppThemeRoot).
 */

export const UI_RADIUS = {
  xs: 6,
  sm: 8,
  md: 10,
  lg: 14,
};

export const UI_SPACE = {
  /** Respiro horizontal/vertical padrão das páginas. */
  pageX: 12,
  pageY: 8,
  pageXCompact: 8,
  pageYCompact: 6,
};

const resolveMode = (themeOrMode) => {
  if (typeof themeOrMode === "string") return themeOrMode;
  return themeOrMode?.palette?.type === "dark" ? "dark" : "light";
};

export function getUiTokens(themeOrMode) {
  const dark = resolveMode(themeOrMode) === "dark";
  return {
    dark,
    border: dark ? "rgba(255, 255, 255, 0.07)" : "rgba(15, 23, 42, 0.07)",
    borderStrong: dark ? "rgba(255, 255, 255, 0.12)" : "rgba(15, 23, 42, 0.12)",
    divider: dark ? "rgba(255, 255, 255, 0.06)" : "rgba(15, 23, 42, 0.06)",
    hoverBg: dark ? "rgba(255, 255, 255, 0.06)" : "rgba(15, 23, 42, 0.045)",
    selectedBg: dark ? "rgba(255, 255, 255, 0.11)" : "rgba(15, 23, 42, 0.07)",
    pressedBg: dark ? "rgba(255, 255, 255, 0.16)" : "rgba(15, 23, 42, 0.1)",
    selectedShadow: dark
      ? "0 1px 2px rgba(0, 0, 0, 0.35)"
      : "0 1px 2px rgba(15, 23, 42, 0.08)",
    focusRing: dark ? "rgba(255, 255, 255, 0.6)" : "rgba(15, 23, 42, 0.42)",
    disabledOpacity: 0.45,
    radius: UI_RADIUS,
    space: UI_SPACE,
  };
}

/** Variáveis CSS equivalentes aos tokens, para estilos fora do JSS. */
export function getUiCssVariables(themeOrMode) {
  const t = getUiTokens(themeOrMode);
  return {
    "--vb-ui-border": t.border,
    "--vb-ui-border-strong": t.borderStrong,
    "--vb-ui-divider": t.divider,
    "--vb-ui-hover-bg": t.hoverBg,
    "--vb-ui-selected-bg": t.selectedBg,
    "--vb-ui-pressed-bg": t.pressedBg,
    "--vb-ui-focus-ring": t.focusRing,
    "--vb-ui-radius-xs": `${UI_RADIUS.xs}px`,
    "--vb-ui-radius-sm": `${UI_RADIUS.sm}px`,
    "--vb-ui-radius-md": `${UI_RADIUS.md}px`,
    "--vb-ui-radius-lg": `${UI_RADIUS.lg}px`,
    "--vb-ui-page-x": `${UI_SPACE.pageX}px`,
    "--vb-ui-page-y": `${UI_SPACE.pageY}px`,
  };
}

/** Estados de um item selecionável (aba, segmento, filtro): o fundo segue a caixa do próprio botão. */
export function selectableStates(theme, { radius = UI_RADIUS.sm } = {}) {
  const t = getUiTokens(theme);
  return {
    base: {
      position: "relative",
      boxSizing: "border-box",
      borderRadius: radius,
      backgroundClip: "padding-box",
      WebkitTapHighlightColor: "transparent",
      transition: "background-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease",
      "&:hover": { backgroundColor: t.hoverBg },
      "&:active": { backgroundColor: t.pressedBg, transitionDuration: "0ms" },
      "&:focus": { outline: "none" },
      "&:focus-visible, &.Mui-focusVisible": {
        outline: `2px solid ${t.focusRing}`,
        outlineOffset: 1,
      },
      "&.Mui-disabled, &:disabled": { opacity: t.disabledOpacity, cursor: "default" },
    },
    selected: {
      "&, &:hover": { backgroundColor: t.selectedBg },
      boxShadow: t.selectedShadow,
    },
  };
}
