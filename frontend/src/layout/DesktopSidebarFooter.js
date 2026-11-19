import React, { forwardRef, useState } from "react";
import clsx from "clsx";
import { makeStyles } from "@material-ui/core/styles";
import { Avatar, ButtonBase } from "@material-ui/core";
import { Bell, HelpCircle, Sun, Moon, EllipsisVertical } from "lucide-react";

import NotificationsPopOver from "../components/NotificationsPopOver";
import PageHelpDialog from "../components/PageHelpDialog";
import FreemiumTrialBar from "../components/FreemiumTrialBar";
import SidebarTooltip from "./SidebarTooltip";
import SidebarProfileMenu from "./SidebarProfileMenu";
import {
  getSidebarTokens,
  sidebarFocusRing,
  SIDEBAR_EASING,
  SIDEBAR_DURATION_MS,
  SIDEBAR_ICON_SIZE,
  SIDEBAR_ITEM_H,
  SIDEBAR_ITEM_INSET,
  SIDEBAR_ICON_INSET,
} from "./sidebarTokens";

const SIDE_POPOVER = {
  anchorOrigin: { vertical: "bottom", horizontal: "right" },
  transformOrigin: { vertical: "bottom", horizontal: "left" },
};

const AVATAR_SIZE = 30;

const useStyles = makeStyles((theme) => {
  const t = getSidebarTokens(theme);
  const fade = `opacity ${SIDEBAR_DURATION_MS}ms ${SIDEBAR_EASING}`;
  return {
    footer: {
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      gap: 1,
      padding: "4px 0 6px",
    },
    trial: {
      padding: `0 ${SIDEBAR_ITEM_INSET}px 4px`,
    },
    row: {
      height: SIDEBAR_ITEM_H,
      width: `calc(100% - ${SIDEBAR_ITEM_INSET * 2}px)`,
      margin: `0 ${SIDEBAR_ITEM_INSET}px`,
      padding: `0 10px 0 ${SIDEBAR_ICON_INSET}px`,
      justifyContent: "flex-start",
      gap: 10,
      borderRadius: 8,
      overflow: "hidden",
      color: t.text,
      fontFamily: "inherit",
      transition: "background-color 0.14s ease, color 0.14s ease",
      "&:hover": {
        backgroundColor: t.hoverBg,
        color: t.textStrong,
      },
      "&.Mui-focusVisible": {
        backgroundColor: t.hoverBg,
        ...sidebarFocusRing(t),
      },
    },
    rowIcon: {
      position: "relative",
      display: "inline-flex",
      color: t.icon,
      flexShrink: 0,
    },
    rowLabel: {
      flex: "1 1 auto",
      minWidth: 0,
      textAlign: "left",
      fontSize: 13,
      letterSpacing: "-0.008em",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      transition: fade,
    },
    fadeOut: {
      opacity: 0,
      pointerEvents: "none",
    },
    count: {
      flexShrink: 0,
      minWidth: 20,
      height: 18,
      padding: "0 6px",
      borderRadius: 9,
      backgroundColor: t.badgeBg,
      color: t.textStrong,
      fontSize: 11,
      fontWeight: 600,
      lineHeight: "18px",
      textAlign: "center",
      boxSizing: "border-box",
      fontVariantNumeric: "tabular-nums",
      transition: fade,
    },
    dot: {
      position: "absolute",
      top: -2,
      right: -3,
      width: 7,
      height: 7,
      borderRadius: "50%",
      backgroundColor: "#ef4444",
      boxShadow: `0 0 0 2px ${t.panel}`,
    },
    countCollapsed: {
      position: "absolute",
      top: -6,
      right: -9,
      minWidth: 16,
      height: 16,
      padding: "0 4px",
      borderRadius: 8,
      backgroundColor: "#ef4444",
      color: "#fff",
      fontSize: 9.5,
      fontWeight: 600,
      lineHeight: "16px",
      textAlign: "center",
      boxSizing: "border-box",
    },
    themeSwitch: {
      display: "flex",
      margin: `4px ${SIDEBAR_ITEM_INSET}px 2px`,
      padding: 2,
      gap: 2,
      borderRadius: 10,
      backgroundColor: t.surface,
    },
    themeOption: {
      flex: 1,
      height: 26,
      gap: 6,
      borderRadius: 8,
      fontSize: 12.5,
      fontFamily: "inherit",
      color: t.muted,
      transition: "background-color 0.14s ease, color 0.14s ease",
      "&:hover": {
        color: t.textStrong,
      },
      "&.Mui-focusVisible": sidebarFocusRing(t),
    },
    themeOptionActive: {
      backgroundColor: t.activeBg,
      color: t.textStrong,
      fontWeight: 500,
    },
    profile: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      height: 42,
      margin: `4px ${SIDEBAR_ITEM_INSET}px 0`,
      padding: `0 4px 0 ${SIDEBAR_ICON_INSET + SIDEBAR_ICON_SIZE / 2 - AVATAR_SIZE / 2}px`,
      width: `calc(100% - ${SIDEBAR_ITEM_INSET * 2}px)`,
      borderRadius: 11,
      boxSizing: "border-box",
      overflow: "hidden",
      backgroundColor: t.surface,
      transition: `background-color 0.14s ease, padding ${SIDEBAR_DURATION_MS}ms ${SIDEBAR_EASING}`,
      "& $bell + $kebab": {
        marginLeft: -8,
      },
    },
    /** Recolhido: notificações empilhadas acima do avatar, ambos centralizados. */
    profileCollapsed: {
      flexDirection: "column",
      justifyContent: "center",
      height: "auto",
      gap: 6,
      padding: "4px 0",
      backgroundColor: "transparent",
      "& $profileText": {
        display: "none",
      },
      "& $bell": {
        order: -1,
        width: 36,
        height: 34,
      },
    },
    bell: {
      position: "relative",
      width: 28,
      height: 28,
      flexShrink: 0,
      borderRadius: 8,
      color: t.icon,
      transition: "background-color 0.14s ease, color 0.14s ease",
      "&:hover": {
        backgroundColor: t.hoverBg,
        color: t.textStrong,
      },
      "&.Mui-focusVisible": sidebarFocusRing(t),
    },
    bellCount: {
      position: "absolute",
      top: 1,
      right: 0,
      minWidth: 15,
      height: 15,
      padding: "0 4px",
      borderRadius: 8,
      backgroundColor: "#ef4444",
      color: "#fff",
      fontSize: 9.5,
      fontWeight: 600,
      lineHeight: "15px",
      textAlign: "center",
      boxSizing: "border-box",
      boxShadow: `0 0 0 2px ${t.panel}`,
      fontVariantNumeric: "tabular-nums",
    },
    avatarBtn: {
      borderRadius: "50%",
      flexShrink: 0,
      "&.Mui-focusVisible": {
        outline: "none",
        boxShadow: `0 0 0 2px ${t.focusRing}`,
      },
    },
    avatar: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      flexShrink: 0,
      fontSize: 13,
    },
    profileText: {
      flex: "1 1 auto",
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      lineHeight: 1.25,
      transition: fade,
    },
    profileName: {
      fontSize: 13,
      fontWeight: 500,
      letterSpacing: "-0.01em",
      color: t.textStrong,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    },
    profileEmail: {
      fontSize: 11.5,
      color: t.muted,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    },
    kebab: {
      width: 28,
      height: 28,
      flexShrink: 0,
      borderRadius: 8,
      color: t.muted,
      transition: `background-color 0.14s ease, color 0.14s ease, ${fade}`,
      "&:hover, &[aria-expanded='true']": {
        backgroundColor: t.hoverBg,
        color: t.textStrong,
      },
      "&.Mui-focusVisible": sidebarFocusRing(t),
    },
  };
});

const FooterRow = forwardRef(function FooterRow(
  { classes, collapsed, icon: Icon, label, count = 0, dot = false, onClick, ...rest },
  ref
) {
  const hasCount = Number(count) > 0;
  const shown = hasCount ? (count > 99 ? "99+" : String(count)) : "";
  return (
    <SidebarTooltip title={collapsed ? label : ""} placement="right">
      <ButtonBase ref={ref} onClick={onClick} className={classes.row} aria-label={label} {...rest}>
        <span className={classes.rowIcon} aria-hidden>
          <Icon size={SIDEBAR_ICON_SIZE} strokeWidth={1.7} />
          {dot && !hasCount && <span className={classes.dot} />}
          {collapsed && hasCount && <span className={classes.countCollapsed}>{shown}</span>}
        </span>
        <span className={clsx(classes.rowLabel, collapsed && classes.fadeOut)}>{label}</span>
        {hasCount && (
          <span className={clsx(classes.count, collapsed && classes.fadeOut)}>{shown}</span>
        )}
      </ButtonBase>
    </SidebarTooltip>
  );
});

const DesktopSidebarFooter = ({
  collapsed,
  user,
  profileUrl,
  isDark,
  onToggleTheme,
  onOpenProfile,
  onOpenBrainAi,
  onLogout,
  onUnreadCountChange,
  helpTopic,
  languageOptions = [],
  onLanguageChange,
}) => {
  const classes = useStyles();
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const menuOpen = Boolean(menuAnchor);

  const closeMenu = () => setMenuAnchor(null);
  const toggleMenu = (e) => {
    const target = e.currentTarget;
    setMenuAnchor((prev) => (prev ? null : target));
  };

  const setTheme = (wantDark) => {
    if (wantDark !== isDark) onToggleTheme();
  };

  const menuTriggerProps = {
    onClick: toggleMenu,
    "aria-label": "Menu do perfil",
    "aria-haspopup": "menu",
    "aria-expanded": menuOpen ? "true" : "false",
    "aria-controls": menuOpen ? "sidebar-profile-menu" : undefined,
  };

  return (
    <div className={classes.footer}>
      {!collapsed && (
        <div className={classes.trial}>
          <FreemiumTrialBar variant="sidebar" />
        </div>
      )}

      {helpTopic ? (
        <>
          <FooterRow
            classes={classes}
            collapsed={collapsed}
            icon={HelpCircle}
            label="Ajuda desta página"
            onClick={() => setHelpOpen(true)}
          />
          <PageHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} topic={helpTopic} />
        </>
      ) : null}

      {collapsed ? (
        <FooterRow
          classes={classes}
          collapsed
          icon={isDark ? Sun : Moon}
          label={isDark ? "Modo claro" : "Modo escuro"}
          onClick={onToggleTheme}
        />
      ) : (
        <div className={classes.themeSwitch} role="radiogroup" aria-label="Tema">
          <ButtonBase
            role="radio"
            aria-checked={!isDark}
            className={clsx(classes.themeOption, !isDark && classes.themeOptionActive)}
            onClick={() => setTheme(false)}
          >
            <Sun size={14} strokeWidth={1.8} />
            Claro
          </ButtonBase>
          <ButtonBase
            role="radio"
            aria-checked={isDark}
            className={clsx(classes.themeOption, isDark && classes.themeOptionActive)}
            onClick={() => setTheme(true)}
          >
            <Moon size={14} strokeWidth={1.8} />
            Escuro
          </ButtonBase>
        </div>
      )}

      <div className={clsx(classes.profile, collapsed && classes.profileCollapsed)}>
        {collapsed ? (
          <SidebarTooltip title={user?.name || "Perfil"} placement="right">
            <ButtonBase className={classes.avatarBtn} {...menuTriggerProps}>
              <Avatar src={profileUrl || undefined} alt={user?.name || ""} className={classes.avatar} />
            </ButtonBase>
          </SidebarTooltip>
        ) : (
          <Avatar src={profileUrl || undefined} alt={user?.name || ""} className={classes.avatar} />
        )}
        <div className={clsx(classes.profileText, collapsed && classes.fadeOut)} aria-hidden={collapsed}>
          <span className={classes.profileName}>{user?.name}</span>
          {user?.email ? <span className={classes.profileEmail}>{user.email}</span> : null}
        </div>
        {user?.id && (
          <NotificationsPopOver
            onCountChange={onUnreadCountChange}
            popoverOrigins={SIDE_POPOVER}
            renderTrigger={({ onClick, ref, badgeCount }) => {
              const count = Number(badgeCount) || 0;
              const label = count > 0 ? `Notificações (${count})` : "Notificações";
              return (
                <SidebarTooltip title={label} placement={collapsed ? "right" : "top"}>
                  <ButtonBase ref={ref} onClick={onClick} className={classes.bell} aria-label="Notificações">
                    <Bell size={16} strokeWidth={1.8} aria-hidden />
                    {count > 0 && (
                      <span className={classes.bellCount}>{count > 99 ? "99+" : count}</span>
                    )}
                  </ButtonBase>
                </SidebarTooltip>
              );
            }}
          />
        )}
        {!collapsed && (
          <ButtonBase className={classes.kebab} {...menuTriggerProps}>
            <EllipsisVertical size={16} strokeWidth={1.8} />
          </ButtonBase>
        )}
      </div>

      <SidebarProfileMenu
        id="sidebar-profile-menu"
        anchorEl={menuAnchor}
        onClose={closeMenu}
        onOpenBrainAi={onOpenBrainAi}
        onOpenProfile={onOpenProfile}
        onLogout={onLogout}
        languageOptions={languageOptions}
        onLanguageChange={onLanguageChange}
      />
    </div>
  );
};

export default DesktopSidebarFooter;
