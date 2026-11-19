import React from "react";
import { makeStyles } from "@material-ui/core/styles";
import { Divider, ListSubheader, Menu, MenuItem } from "@material-ui/core";
import { User, LogOut, Check } from "lucide-react";

import logoBrainAi from "../assets/logo_brain_ai.png";
import { i18n } from "../translate/i18n";

const useStyles = makeStyles((theme) => {
  const dark = theme.palette.type === "dark";
  return {
    paper: {
      minWidth: 224,
      marginLeft: 8,
      borderRadius: 12,
      border: `1px solid ${dark ? "rgba(255, 255, 255, 0.08)" : "rgba(15, 23, 42, 0.08)"}`,
      boxShadow: dark
        ? "0 12px 32px -12px rgba(0, 0, 0, 0.6)"
        : "0 1px 2px rgba(15, 23, 42, 0.05), 0 14px 32px -14px rgba(15, 23, 42, 0.28)",
    },
    list: {
      padding: 4,
    },
    item: {
      gap: 10,
      minHeight: 32,
      padding: "0 10px",
      borderRadius: 8,
      fontSize: 13,
      letterSpacing: "-0.005em",
      color: theme.palette.text.primary,
      "& svg": {
        flexShrink: 0,
        color: theme.palette.text.secondary,
      },
      "&.Mui-focusVisible": {
        boxShadow: `inset 0 0 0 2px ${theme.palette.primary.main}`,
      },
    },
    itemTitle: {
      flex: 1,
      minWidth: 0,
    },
    brainIcon: {
      width: 18,
      height: 18,
      borderRadius: "50%",
      objectFit: "cover",
      display: "block",
      flexShrink: 0,
    },
    divider: {
      margin: "4px 6px",
    },
    subheader: {
      fontSize: 11.5,
      lineHeight: "26px",
      fontWeight: 500,
      padding: "0 10px",
      color: theme.palette.text.secondary,
      background: "transparent",
    },
    checkSlot: {
      width: 16,
      display: "inline-flex",
    },
  };
});

const SidebarProfileMenu = ({
  id,
  anchorEl,
  onClose,
  onOpenBrainAi,
  onOpenProfile,
  onLogout,
  languageOptions = [],
  onLanguageChange,
}) => {
  const classes = useStyles();
  const currentLanguage = i18n.language;

  const run = (action) => () => {
    onClose();
    if (action) action();
  };

  return (
    <Menu
      id={id}
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={onClose}
      getContentAnchorEl={null}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "bottom", horizontal: "left" }}
      classes={{ paper: classes.paper, list: classes.list }}
      transitionDuration={{ enter: 160, exit: 110 }}
    >
      {onOpenBrainAi && (
        <MenuItem className={classes.item} onClick={run(onOpenBrainAi)}>
          <img src={logoBrainAi} alt="" aria-hidden className={classes.brainIcon} />
          <span className={classes.itemTitle}>Brain AI</span>
        </MenuItem>
      )}
      {onOpenBrainAi && <Divider className={classes.divider} />}
      <MenuItem className={classes.item} onClick={run(onOpenProfile)}>
        <User size={16} strokeWidth={1.8} />
        <span className={classes.itemTitle}>{i18n.t("mainDrawer.appBar.user.profile")}</span>
      </MenuItem>
      {languageOptions.length > 1 && [
        <Divider key="lang-divider" className={classes.divider} />,
        <ListSubheader key="lang-header" className={classes.subheader} disableSticky>
          Idioma
        </ListSubheader>,
        ...languageOptions.map((lang) => (
          <MenuItem
            key={lang.code}
            className={classes.item}
            onClick={run(() => onLanguageChange(lang.code))}
          >
            <span className={classes.checkSlot}>
              {currentLanguage === lang.code ? <Check size={16} strokeWidth={1.8} /> : null}
            </span>
            <span className={classes.itemTitle}>{lang.label}</span>
          </MenuItem>
        )),
      ]}
      <Divider className={classes.divider} />
      <MenuItem className={classes.item} onClick={run(onLogout)}>
        <LogOut size={16} strokeWidth={1.8} />
        <span className={classes.itemTitle}>{i18n.t("mainDrawer.appBar.user.logout")}</span>
      </MenuItem>
    </Menu>
  );
};

export default SidebarProfileMenu;
