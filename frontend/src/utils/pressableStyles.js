/**
 * Feedback de toque estilo iOS para botões de ação (não para estados persistentes):
 * fundo neutro só enquanto pressionado, ícone mantém a cor semântica,
 * sem tap-highlight/ripple do navegador e com foco visível apenas via teclado.
 */
export const pressableFeedback = (theme, { restBackground } = {}) => {
  const dark = theme.palette.type === "dark";
  return {
    WebkitTapHighlightColor: "transparent",
    ...(restBackground !== undefined ? { backgroundColor: restBackground } : {}),
    transition: "background-color 180ms ease",
    "& .MuiTouchRipple-root": { display: "none" },
    "@media (hover: hover)": {
      "&:hover": {
        backgroundColor: dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)",
      },
    },
    // No touch o :hover "gruda" após o toque; mantém o fundo de repouso
    "@media (hover: none)": {
      "&:hover": {
        backgroundColor: restBackground !== undefined ? restBackground : "transparent",
      },
    },
    "&:active": {
      backgroundColor: dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.1)",
      transitionDuration: "0ms",
    },
    "&:focus": { outline: "none" },
    "&:focus-visible, &.Mui-focusVisible": {
      outline: `2px solid ${dark ? "rgba(255,255,255,0.55)" : "rgba(15,23,42,0.4)"}`,
      outlineOffset: 1,
    },
  };
};
