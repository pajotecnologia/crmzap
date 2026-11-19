import React from "react";
import clsx from "clsx";
import { Link as RouterLink } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import { getSidebarTokens, sidebarFocusRing, SIDEBAR_EASING, SIDEBAR_DURATION_MS } from "./sidebarTokens";

/**
 * Logos padrão VB têm muito respiro em volta da sigla; a imagem é ampliada
 * sem distorção e recortada pela moldura para dar destaque ao "VB".
 * Moldura e imagem mantêm a mesma razão (frame ≈ 0,68 × 0,41 da largura da imagem).
 */
const DEFAULT_LOGO_PATTERN = /vbsolution-logo-(light|dark)\.png(\?.*)?$/i;

const motion = `${SIDEBAR_DURATION_MS}ms ${SIDEBAR_EASING}`;
const SHORT_SCREEN = "@media (max-height: 720px)";

const useStyles = makeStyles((theme) => {
  const t = getSidebarTokens(theme);
  return {
    header: {
      position: "relative",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: 72,
      minHeight: 72,
      padding: "0 12px",
      boxSizing: "border-box",
      flexShrink: 0,
      transition: `height ${motion}`,
      [SHORT_SCREEN]: {
        height: 60,
        minHeight: 60,
      },
    },
    headerCollapsed: {
      flexDirection: "column",
      justifyContent: "flex-start",
      gap: 6,
      height: "auto",
      minHeight: 0,
      padding: "14px 0 6px",
      [SHORT_SCREEN]: {
        height: "auto",
        minHeight: 0,
        padding: "10px 0 4px",
      },
    },
    link: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      maxWidth: "100%",
      borderRadius: 10,
      outline: "none",
      transition: "opacity 0.15s ease",
      "&:hover": { opacity: 0.88 },
      "&:focus-visible": sidebarFocusRing(t),
    },
    frame: {
      position: "relative",
      overflow: "hidden",
      flexShrink: 0,
      width: 76,
      height: 46,
      transition: `width ${motion}, height ${motion}`,
      [SHORT_SCREEN]: {
        width: 64,
        height: 39,
      },
    },
    frameCollapsed: {
      width: 40,
      height: 25,
      [SHORT_SCREEN]: {
        width: 40,
        height: 25,
      },
    },
    glyph: {
      position: "absolute",
      top: "50%",
      left: "50%",
      width: 112,
      height: "auto",
      transform: "translate(-50%, -50%)",
      userSelect: "none",
      pointerEvents: "none",
      transition: `width ${motion}`,
      [SHORT_SCREEN]: {
        width: 94,
      },
    },
    glyphCollapsed: {
      width: 60,
      [SHORT_SCREEN]: {
        width: 60,
      },
    },
    custom: {
      display: "block",
      width: "auto",
      height: "auto",
      maxHeight: 52,
      maxWidth: "100%",
      objectFit: "contain",
      transition: `max-height ${motion}, max-width ${motion}`,
      [SHORT_SCREEN]: {
        maxHeight: 42,
      },
    },
    customCollapsed: {
      maxHeight: 32,
      maxWidth: 40,
      [SHORT_SCREEN]: {
        maxHeight: 30,
      },
    },
    /** Com o controle de recolher ao lado, a logo personalizada não invade a área do botão. */
    linkWithAction: {
      maxWidth: "calc(100% - 72px)",
    },
    action: {
      position: "absolute",
      right: 8,
      top: "50%",
      transform: "translateY(-50%)",
      display: "flex",
    },
    actionCollapsed: {
      position: "static",
      transform: "none",
    },
  };
});

export function isDefaultSidebarLogo(src) {
  return DEFAULT_LOGO_PATTERN.test(String(src || ""));
}

const SidebarBrand = ({ src, alt, collapsed, onError, action = null }) => {
  const classes = useStyles();
  const trimmed = isDefaultSidebarLogo(src);

  return (
    <div className={clsx(classes.header, collapsed && classes.headerCollapsed)}>
      <RouterLink
        to="/"
        className={clsx(classes.link, action && !collapsed && classes.linkWithAction)}
        aria-label={`${alt} — início`}
      >
        {trimmed ? (
          <span className={clsx(classes.frame, collapsed && classes.frameCollapsed)}>
            <img
              src={src}
              alt={alt}
              onError={onError}
              draggable={false}
              className={clsx(classes.glyph, collapsed && classes.glyphCollapsed)}
            />
          </span>
        ) : (
          <img
            src={src}
            alt={alt}
            onError={onError}
            draggable={false}
            className={clsx(classes.custom, collapsed && classes.customCollapsed)}
          />
        )}
      </RouterLink>
      {action ? (
        <div className={clsx(classes.action, collapsed && classes.actionCollapsed)}>{action}</div>
      ) : null}
    </div>
  );
};

export default SidebarBrand;
