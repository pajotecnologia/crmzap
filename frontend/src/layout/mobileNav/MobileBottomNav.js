import React from "react";
import { Link as RouterLink } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import { MoreHorizontal } from "lucide-react";
import { isPathActive } from "./navConfig";

export const MOBILE_BOTTOM_NAV_HEIGHT = 58;

const useStyles = makeStyles((theme) => {
  const isDark = theme.palette.type === "dark";
  const idle = isDark ? "rgba(228, 228, 231, 0.72)" : "#5b6474";
  const active = isDark ? "#f4f4f5" : "#111827";
  const activeBg = isDark ? "rgba(255, 255, 255, 0.1)" : "#EEF0F3";
  return {
    root: {
      position: "fixed",
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: theme.zIndex.appBar,
      backgroundColor: isDark ? theme.palette.background.paper : "#ffffff",
      borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(15, 23, 42, 0.08)"}`,
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
      paddingLeft: "env(safe-area-inset-left, 0px)",
      paddingRight: "env(safe-area-inset-right, 0px)",
      boxShadow: isDark ? "0 -4px 16px rgba(0,0,0,0.35)" : "0 -2px 12px rgba(15, 23, 42, 0.05)",
      [theme.breakpoints.up("md")]: {
        display: "none",
      },
      "@media print": {
        display: "none",
      },
    },
    list: {
      display: "grid",
      gridAutoFlow: "column",
      gridAutoColumns: "minmax(0, 1fr)",
      height: MOBILE_BOTTOM_NAV_HEIGHT,
      margin: 0,
      padding: 0,
      listStyle: "none",
    },
    item: {
      position: "relative",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 3,
      width: "100%",
      height: "100%",
      minHeight: "44px !important",
      padding: "6px 2px 4px",
      border: "none",
      background: "none",
      color: idle,
      textDecoration: "none",
      cursor: "pointer",
      WebkitTapHighlightColor: "transparent",
      fontFamily: "inherit",
      transition: "color 150ms ease",
      "&:focus-visible": {
        outline: `2px solid ${active}`,
        outlineOffset: -4,
        borderRadius: 10,
      },
      "&::before": {
        content: '""',
        position: "absolute",
        inset: "5px 4px",
        borderRadius: 14,
        backgroundColor: "transparent",
        transition: "background-color 150ms ease",
        zIndex: 0,
      },
      "& > *": {
        position: "relative",
        zIndex: 1,
      },
      "&:active::before": {
        backgroundColor: activeBg,
      },
    },
    itemActive: {
      color: active,
      "&::before": {
        backgroundColor: activeBg,
      },
    },
    iconWrap: {
      position: "relative",
      display: "inline-flex",
      lineHeight: 0,
    },
    label: {
      fontSize: 11,
      lineHeight: "14px",
      fontWeight: 500,
      letterSpacing: "-0.005em",
      maxWidth: "100%",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    badge: {
      position: "absolute",
      top: -7,
      left: 13,
      minWidth: 18,
      height: 18,
      padding: "0 5px",
      borderRadius: 9,
      backgroundColor: "#ef4444",
      color: "#fff",
      fontSize: 10.5,
      fontWeight: 700,
      lineHeight: "18px",
      textAlign: "center",
      boxShadow: `0 0 0 2px ${isDark ? theme.palette.background.paper : "#ffffff"}`,
    },
  };
});

const formatBadge = (value) => (value > 99 ? "99+" : String(value));

export default function MobileBottomNav({
  items,
  pathname,
  moreActive,
  onMoreClick,
  badges = {},
  hidden = false,
  moreLabel = "Mais",
}) {
  const classes = useStyles();
  if (hidden) return null;

  return (
    <nav className={classes.root} aria-label="Navegação principal" data-mobile-bottom-nav>
      <ul className={classes.list}>
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = !moreActive && isPathActive(pathname, item.active);
          const badge = item.badgeKey ? Number(badges[item.badgeKey] || 0) : 0;
          return (
            <li key={item.key} style={{ minWidth: 0 }}>
              <RouterLink
                to={item.to}
                className={`${classes.item} ${isActive ? classes.itemActive : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                <span className={classes.iconWrap}>
                  <Icon size={22} strokeWidth={isActive ? 2 : 1.6} aria-hidden />
                  {badge > 0 ? (
                    <span className={classes.badge} aria-label={`${badge} não lidas`}>
                      {formatBadge(badge)}
                    </span>
                  ) : null}
                </span>
                <span className={classes.label}>{item.label}</span>
              </RouterLink>
            </li>
          );
        })}
        <li style={{ minWidth: 0 }}>
          <button
            type="button"
            className={`${classes.item} ${moreActive ? classes.itemActive : ""}`}
            onClick={onMoreClick}
            aria-haspopup="dialog"
            aria-expanded={false}
          >
            <span className={classes.iconWrap}>
              <MoreHorizontal size={22} strokeWidth={moreActive ? 2 : 1.6} aria-hidden />
            </span>
            <span className={classes.label}>{moreLabel}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
