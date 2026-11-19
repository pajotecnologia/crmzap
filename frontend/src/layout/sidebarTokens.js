/** Larguras e respiros do painel flutuante do menu lateral desktop. */
export const SIDEBAR_LAYOUT = {
  width: 224,
  widthCompact: 204,
  collapsedWidth: 56,
  gap: 4,
  gapCompact: 4,
  radius: 12,
};

export const SIDEBAR_ICON_SIZE = 17;
export const SIDEBAR_ITEM_H = 32;
/** Margem lateral + recuo do ícone: mantém o ícone centrado no painel recolhido (56px). */
export const SIDEBAR_ITEM_INSET = 6;
export const SIDEBAR_ICON_INSET = 13.5;

export const SIDEBAR_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
export const SIDEBAR_DURATION_MS = 220;

/** Paleta do menu lateral desktop; acompanha a cor do painel (azul da marca ou identidade visual). */
export function getSidebarTokens(theme) {
  const dark = Boolean(theme.palette.sidebarMenuIsDarkLogo);
  const panel =
    theme.palette.sidebarPanelBackground ||
    theme.palette.sidebarMenuBackground ||
    theme.palette.background.paper;
  return {
    dark,
    panel,
    text: dark ? "rgba(255, 255, 255, 0.84)" : "#3F3F46",
    textStrong: dark ? "#ffffff" : "#18181B",
    muted: dark ? "rgba(255, 255, 255, 0.62)" : "#71717A",
    icon: dark ? "rgba(255, 255, 255, 0.76)" : "#52525B",
    iconStrong: dark ? "#ffffff" : "#18181B",
    hoverBg: dark ? "rgba(255, 255, 255, 0.07)" : "rgba(24, 24, 27, 0.045)",
    activeBg: dark ? "rgba(255, 255, 255, 0.15)" : "rgba(24, 24, 27, 0.08)",
    focusRing: dark ? "rgba(255, 255, 255, 0.72)" : "rgba(24, 24, 27, 0.5)",
    border: dark ? "rgba(255, 255, 255, 0.1)" : "#ECECEE",
    badgeBg: dark ? "rgba(255, 255, 255, 0.1)" : "#ffffff",
    badgeBorder: dark ? "rgba(255, 255, 255, 0.14)" : "#E4E4E7",
    surface: dark ? "rgba(255, 255, 255, 0.06)" : "#ffffff",
    tooltipBg: dark ? "#0f1d3a" : "#18181B",
    tooltipText: "#ffffff",
    shadow:
      "0 1px 2px rgba(15, 23, 42, 0.06), 0 10px 28px -14px rgba(15, 23, 42, 0.28)",
  };
}

/** Anel de foco do teclado para itens do menu lateral. */
export function sidebarFocusRing(t) {
  return {
    outline: "none",
    boxShadow: `inset 0 0 0 2px ${t.focusRing}`,
  };
}
