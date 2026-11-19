import React, { useContext, useLayoutEffect, useRef } from "react";
import clsx from "clsx";
import { makeStyles } from "@material-ui/core/styles";
import { ButtonBase } from "@material-ui/core";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { DrawerContext } from "../context/DrawerContext";
import SidebarTooltip from "./SidebarTooltip";
import { getUiTokens } from "../styles/uiTokens";
import { getSidebarTokens, sidebarFocusRing } from "./sidebarTokens";

const SIZE = 28;

const useStyles = makeStyles((theme) => {
  const t = getUiTokens(theme);
  const s = getSidebarTokens(theme);
  return {
    button: {
      flexShrink: 0,
      width: SIZE,
      height: SIZE,
      borderRadius: t.radius.sm,
      color: theme.palette.text.secondary,
      WebkitTapHighlightColor: "transparent",
      transition: "background-color 0.15s ease, color 0.15s ease",
      "&:hover": {
        backgroundColor: t.hoverBg,
        color: theme.palette.text.primary,
      },
      "&:active": {
        backgroundColor: t.pressedBg,
        transitionDuration: "0ms",
      },
      "&.Mui-focusVisible": {
        outline: `2px solid ${t.focusRing}`,
        outlineOffset: 1,
      },
    },
    /**
     * Reserva para páginas sem cabeçalho com o controle: fica no topo do próprio
     * menu lateral (ao lado da logo), nunca sobre o conteúdo da página.
     */
    floating: {
      color: s.icon,
      "&:hover": {
        backgroundColor: s.hoverBg,
        color: s.iconStrong,
      },
      "&:active": {
        backgroundColor: s.activeBg,
      },
      "&.Mui-focusVisible": sidebarFocusRing(s),
    },
  };
});

/**
 * Recolhe/expande o menu lateral desktop. Renderizado nos cabeçalhos das páginas;
 * enquanto montado, avisa o layout para não exibir o controle de reserva. Com vários
 * cabeçalhos montados (página embutida em aba), só o primeiro aparece.
 * No mobile (menu via barra inferior) não renderiza nada.
 */
let nextToggleId = 0;

const SidebarToggleButton = ({ className, floating = false }) => {
  const classes = useStyles();
  const ctx = useContext(DrawerContext) || {};
  const {
    drawerOpen,
    toggleSidebar,
    sidebarToggleAvailable,
    registerHeaderToggle,
    activeHeaderToggleId,
  } = ctx;
  const idRef = useRef(null);
  if (idRef.current === null) {
    nextToggleId += 1;
    idRef.current = nextToggleId;
  }

  useLayoutEffect(() => {
    if (floating || !sidebarToggleAvailable || !registerHeaderToggle) return undefined;
    return registerHeaderToggle(idRef.current);
  }, [floating, sidebarToggleAvailable, registerHeaderToggle]);

  if (!sidebarToggleAvailable || !toggleSidebar) return null;
  if (!floating && activeHeaderToggleId !== idRef.current) return null;

  const label = drawerOpen ? "Recolher menu" : "Expandir menu";
  const Icon = drawerOpen ? PanelLeftClose : PanelLeftOpen;

  return (
    <SidebarTooltip title={label} placement={floating ? "right" : "bottom"}>
      <ButtonBase
        className={clsx(classes.button, floating && classes.floating, className)}
        onClick={toggleSidebar}
        aria-label={label}
        aria-expanded={Boolean(drawerOpen)}
        aria-controls="app-sidebar"
        disableRipple
      >
        <Icon size={17} strokeWidth={1.75} aria-hidden />
      </ButtonBase>
    </SidebarTooltip>
  );
};

export default SidebarToggleButton;
