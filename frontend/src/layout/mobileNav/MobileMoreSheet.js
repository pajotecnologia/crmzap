import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import Drawer from "@material-ui/core/Drawer";
import Avatar from "@material-ui/core/Avatar";
import { Search, MessageSquare, Moon, Sun, LogOut, X } from "lucide-react";
import { isPathActive } from "./navConfig";

const useStyles = makeStyles((theme) => {
  const isDark = theme.palette.type === "dark";
  const ink = isDark ? "#f4f4f5" : "#0f172a";
  const muted = isDark ? "rgba(228,228,231,0.7)" : "#5b6474";
  const tileBg = isDark ? "rgba(255,255,255,0.06)" : "#f1f4f8";
  const accent = theme.palette.primary.main;
  return {
    paper: {
      height: "calc(100dvh - 28px - env(safe-area-inset-top, 0px))",
      maxHeight: "calc(100dvh - 28px - env(safe-area-inset-top, 0px))",
      width: "100% !important",
      maxWidth: "100% !important",
      borderRadius: "20px 20px 0 0",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      backgroundColor: isDark ? theme.palette.background.paper : "#ffffff",
      paddingLeft: "env(safe-area-inset-left, 0px)",
      paddingRight: "env(safe-area-inset-right, 0px)",
    },
    grabber: {
      width: 36,
      height: 4,
      borderRadius: 2,
      margin: "8px auto 0",
      backgroundColor: isDark ? "rgba(255,255,255,0.18)" : "rgba(15,23,42,0.14)",
      flexShrink: 0,
    },
    header: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 12px 12px 16px",
      borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)"}`,
      flexShrink: 0,
    },
    profileButton: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      minWidth: 0,
      flex: 1,
      padding: 0,
      border: "none",
      background: "none",
      textAlign: "left",
      cursor: "pointer",
      color: ink,
      minHeight: "44px !important",
      fontFamily: "inherit",
    },
    avatar: {
      width: 40,
      height: 40,
      fontSize: 14,
      fontWeight: 600,
      backgroundColor: tileBg,
      color: ink,
    },
    profileText: {
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
    },
    name: {
      fontSize: 15,
      fontWeight: 600,
      lineHeight: "20px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    email: {
      fontSize: 12.5,
      lineHeight: "16px",
      color: muted,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    actions: {
      display: "flex",
      alignItems: "center",
      gap: 2,
      flexShrink: 0,
    },
    iconButton: {
      position: "relative",
      width: 40,
      height: 40,
      minHeight: "40px !important",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      border: "none",
      borderRadius: 12,
      background: "none",
      color: ink,
      cursor: "pointer",
      WebkitTapHighlightColor: "transparent",
      textDecoration: "none",
      "&:active": {
        backgroundColor: tileBg,
      },
      "&:focus-visible": {
        outline: `2px solid ${accent}`,
        outlineOffset: -2,
      },
    },
    iconButtonOn: {
      backgroundColor: tileBg,
    },
    danger: {
      color: "#dc2626",
    },
    badge: {
      position: "absolute",
      top: 2,
      right: 0,
      minWidth: 17,
      height: 17,
      padding: "0 4px",
      borderRadius: 9,
      backgroundColor: "#ef4444",
      color: "#fff",
      fontSize: 10,
      fontWeight: 700,
      lineHeight: "17px",
      textAlign: "center",
    },
    searchRow: {
      padding: "10px 16px 4px",
      flexShrink: 0,
    },
    searchField: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      height: 44,
      padding: "0 14px",
      borderRadius: 14,
      border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.12)"}`,
      backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "#ffffff",
      color: muted,
      "&:focus-within": {
        borderColor: accent,
      },
      "& input": {
        flex: 1,
        minWidth: 0,
        border: "none",
        outline: "none",
        background: "transparent",
        color: ink,
        fontSize: 16,
        fontFamily: "inherit",
      },
    },
    body: {
      flex: 1,
      minHeight: 0,
      overflowY: "auto",
      overscrollBehavior: "contain",
      WebkitOverflowScrolling: "touch",
      padding: "4px 12px calc(20px + env(safe-area-inset-bottom, 0px))",
    },
    section: {
      paddingTop: 14,
    },
    sectionTitle: {
      margin: "0 4px 8px",
      fontSize: 13,
      fontWeight: 600,
      color: muted,
      letterSpacing: "-0.005em",
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
      gap: 4,
      margin: 0,
      padding: 0,
      listStyle: "none",
      "@media (min-width: 600px)": {
        gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
      },
    },
    tile: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 6,
      padding: "8px 2px 10px",
      borderRadius: 14,
      color: ink,
      textDecoration: "none",
      WebkitTapHighlightColor: "transparent",
      "&:active $tileIcon": {
        transform: "scale(0.96)",
      },
      "&:focus-visible": {
        outline: `2px solid ${accent}`,
        outlineOffset: -2,
      },
    },
    tileActive: {
      backgroundColor: isDark ? "rgba(59,130,246,0.14)" : "rgba(59,130,246,0.08)",
      color: isDark ? "#bfdbfe" : accent,
      "& $tileIcon": {
        backgroundColor: accent,
        color: "#fff",
      },
    },
    tileIcon: {
      width: 48,
      height: 48,
      borderRadius: 14,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tileBg,
      color: isDark ? "#e4e4e7" : "#334155",
      transition: "transform 120ms ease",
    },
    tileLabel: {
      fontSize: 12,
      lineHeight: "15px",
      fontWeight: 500,
      textAlign: "center",
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
      wordBreak: "break-word",
      maxWidth: "100%",
    },
    empty: {
      padding: "40px 16px",
      textAlign: "center",
      color: muted,
      fontSize: 14,
    },
  };
});

const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const initialsOf = (name, email) => {
  const base = String(name || email || "").trim();
  if (!base) return "?";
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const isTileActive = (pathname, item) => {
  if (item.exact) return pathname === item.to;
  return isPathActive(pathname, [item.to]);
};

export default function MobileMoreSheet({
  open,
  onClose,
  sections,
  pathname,
  user,
  profileUrl,
  unreadCount = 0,
  isDark,
  onToggleTheme,
  onLogout,
  onOpenProfile,
  t = (s) => s,
}) {
  const classes = useStyles();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setSearchOpen(false);
      setQuery("");
    }
  }, [open]);

  useEffect(() => {
    if (searchOpen && searchRef.current) {
      searchRef.current.focus();
    }
  }, [searchOpen]);

  const visibleSections = useMemo(() => {
    const term = normalize(query.trim());
    if (!term) return sections;
    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (item) =>
            normalize(item.label).includes(term) || normalize(section.title).includes(term)
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [sections, query]);

  const hasNoImage = !profileUrl || /noimage\.png$/i.test(String(profileUrl));

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      classes={{ paper: classes.paper }}
      ModalProps={{ keepMounted: false }}
      PaperProps={{ role: "dialog", "aria-label": t("Menu") }}
    >
      <div className={classes.grabber} aria-hidden />
      <div className={classes.header}>
        <button type="button" className={classes.profileButton} onClick={onOpenProfile}>
          <Avatar className={classes.avatar} src={hasNoImage ? undefined : profileUrl}>
            {initialsOf(user?.name, user?.email)}
          </Avatar>
          <span className={classes.profileText}>
            <span className={classes.name}>{user?.name || t("Meu perfil")}</span>
            {user?.email ? <span className={classes.email}>{user.email}</span> : null}
          </span>
        </button>
        <div className={classes.actions}>
          <button
            type="button"
            className={`${classes.iconButton} ${searchOpen ? classes.iconButtonOn : ""}`}
            onClick={() => setSearchOpen((value) => !value)}
            aria-label={t("Buscar no menu")}
            aria-pressed={searchOpen}
          >
            <Search size={20} strokeWidth={1.7} />
          </button>
          <RouterLink
            to="/tickets"
            className={classes.iconButton}
            onClick={onClose}
            aria-label={
              unreadCount > 0 ? `${t("Atendimentos")}: ${unreadCount}` : t("Atendimentos")
            }
          >
            <MessageSquare size={20} strokeWidth={1.7} />
            {unreadCount > 0 ? (
              <span className={classes.badge}>{unreadCount > 99 ? "99+" : unreadCount}</span>
            ) : null}
          </RouterLink>
          <button
            type="button"
            className={classes.iconButton}
            onClick={onToggleTheme}
            aria-label={isDark ? t("Modo claro") : t("Modo escuro")}
          >
            {isDark ? <Sun size={20} strokeWidth={1.7} /> : <Moon size={20} strokeWidth={1.7} />}
          </button>
          <button
            type="button"
            className={`${classes.iconButton} ${classes.danger}`}
            onClick={onLogout}
            aria-label={t("Sair")}
          >
            <LogOut size={20} strokeWidth={1.7} />
          </button>
          <button
            type="button"
            className={classes.iconButton}
            onClick={onClose}
            aria-label={t("Fechar menu")}
          >
            <X size={20} strokeWidth={1.7} />
          </button>
        </div>
      </div>

      {searchOpen ? (
        <div className={classes.searchRow}>
          <label className={classes.searchField}>
            <Search size={18} strokeWidth={1.7} aria-hidden />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Buscar página")}
              aria-label={t("Buscar página")}
              enterKeyHint="search"
            />
          </label>
        </div>
      ) : null}

      <div className={classes.body}>
        {visibleSections.length === 0 ? (
          <p className={classes.empty}>{t("Nenhuma página encontrada para essa busca.")}</p>
        ) : (
          visibleSections.map((section) => (
            <section key={section.key} className={classes.section} aria-label={section.title}>
              <h2 className={classes.sectionTitle}>{section.title}</h2>
              <ul className={classes.grid}>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isTileActive(pathname, item);
                  return (
                    <li key={`${section.key}-${item.to}`} style={{ minWidth: 0 }}>
                      <RouterLink
                        to={item.to}
                        onClick={onClose}
                        className={`${classes.tile} ${active ? classes.tileActive : ""}`}
                        aria-current={active ? "page" : undefined}
                      >
                        <span className={classes.tileIcon}>
                          <Icon size={22} strokeWidth={1.6} aria-hidden />
                        </span>
                        <span className={classes.tileLabel}>{item.label}</span>
                      </RouterLink>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </Drawer>
  );
}
