import React, { useContext, useEffect, useReducer, useState } from "react";
import ReactDOM from "react-dom";
import clsx from "clsx";
import { Link as RouterLink, useLocation, useHistory } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import useHelps from "../hooks/useHelps";
import ListItem from "@material-ui/core/ListItem";
import Collapse from "@material-ui/core/Collapse";

import AppIcon from "../components/ui/AppIcon";
import {
  Home,
  CircleDollarSign,
  CheckSquare,
  FolderKanban,
  Calendar,
  Building2,
  Contact,
  MoreHorizontal,
  Package,
  Code,
  HelpCircle,
  MessageSquare,
  GitBranch,
  Megaphone,
  Zap,
  LayoutDashboard,
  Mail,
  Workflow,
  Settings,
  Bot,
  Plug,
  Webhook,
  ChevronRight,
} from "lucide-react";

import { WhatsAppsContext } from "../context/WhatsApp/WhatsAppsContext";
import { AuthContext } from "../context/Auth/AuthContext";
import { isFreeTrialUser } from "../helpers/trialIntegrationFilter";
import { isInternalAutomationUser } from "../hooks/useNavPermissions";
import { useActiveMenu } from "../context/ActiveMenuContext";

import { isArray } from "lodash";
import api from "../services/api";
import { resolveSocketCompanyId } from "../services/socket";
import toastError from "../errors/toastError";
import usePlans from "../hooks/usePlans";
import { i18n } from "../translate/i18n";
import useAppTranslation from "../hooks/useAppTranslation";

import useCompanySettings from "../hooks/useSettings/companySettings";
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
import SidebarTooltip from "./SidebarTooltip";

const useStyles = makeStyles((theme) => {
  const t = getSidebarTokens(theme);
  return {
    sidebarList: {
      width: "100%",
      boxSizing: "border-box",
      padding: "0 0 6px",
      display: "flex",
      flexDirection: "column",
      gap: 1,
    },
    item: {
      height: SIDEBAR_ITEM_H,
      minHeight: SIDEBAR_ITEM_H,
      width: `calc(100% - ${SIDEBAR_ITEM_INSET * 2}px)`,
      margin: `0 ${SIDEBAR_ITEM_INSET}px`,
      padding: `0 10px 0 ${SIDEBAR_ICON_INSET}px !important`,
      justifyContent: "flex-start",
      gap: 10,
      borderRadius: 8,
      boxSizing: "border-box",
      overflow: "hidden",
      flexShrink: 0,
      color: t.text,
      transition: `background-color 0.14s ease, color 0.14s ease, padding ${SIDEBAR_DURATION_MS}ms ${SIDEBAR_EASING}`,
      "&:hover": {
        backgroundColor: t.hoverBg,
        color: t.textStrong,
      },
      "&:hover $iconSlot": {
        color: t.iconStrong,
      },
      "&.Mui-focusVisible": {
        backgroundColor: t.hoverBg,
        ...sidebarFocusRing(t),
      },
    },
    itemActive: {
      backgroundColor: t.activeBg,
      color: t.textStrong,
      "& $label": {
        fontWeight: 500,
      },
      "& $iconSlot": {
        color: t.iconStrong,
      },
      "&:hover": {
        backgroundColor: t.activeBg,
      },
      "&.Mui-focusVisible": {
        backgroundColor: t.activeBg,
      },
    },
    itemSubmenu: {
      paddingLeft: (props) =>
        props.collapsed
          ? `${SIDEBAR_ICON_INSET}px !important`
          : `${SIDEBAR_ICON_INSET + 14}px !important`,
      "& $iconSlot svg": {
        width: 15,
        height: 15,
      },
    },
    iconSlot: {
      position: "relative",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: SIDEBAR_ICON_SIZE,
      height: SIDEBAR_ICON_SIZE,
      flexShrink: 0,
      color: t.icon,
      lineHeight: 0,
      "& svg": {
        display: "block",
        width: SIDEBAR_ICON_SIZE,
        height: SIDEBAR_ICON_SIZE,
      },
    },
    alertDot: {
      position: "absolute",
      top: -2,
      right: -3,
      width: 7,
      height: 7,
      borderRadius: "50%",
      backgroundColor: "#ef4444",
      boxShadow: `0 0 0 2px ${t.panel}`,
    },
    label: {
      flex: "1 1 auto",
      minWidth: 0,
      fontSize: 13,
      fontWeight: 400,
      lineHeight: `${SIDEBAR_ITEM_H}px`,
      letterSpacing: "-0.008em",
      color: "inherit",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      transition: `opacity ${SIDEBAR_DURATION_MS}ms ${SIDEBAR_EASING}`,
    },
    /** Recolhido: some visualmente, mas continua como nome acessível do item. */
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
      transition: `opacity ${SIDEBAR_DURATION_MS}ms ${SIDEBAR_EASING}`,
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
    chevron: {
      flexShrink: 0,
      display: "inline-flex",
      color: t.muted,
      transition: `transform 0.2s ${SIDEBAR_EASING}, opacity ${SIDEBAR_DURATION_MS}ms ${SIDEBAR_EASING}`,
    },
    chevronOpen: {
      transform: "rotate(90deg)",
    },
    groupGap: {
      height: 6,
      flexShrink: 0,
    },
    collapse: {
      flexShrink: 0,
      "& .MuiCollapse-wrapperInner": {
        display: "flex",
        flexDirection: "column",
        gap: 1,
        paddingTop: 1,
      },
    },
  };
});

const formatCount = (n) => (n > 99 ? "99+" : String(n));

function ItemBody({ classes, icon, primary, collapsed, count, showBadge, trailing }) {
  const hasCount = Number(count) > 0;
  return (
    <>
      <span className={classes.iconSlot} aria-hidden>
        {icon}
        {showBadge && <span className={classes.alertDot} />}
        {collapsed && hasCount && (
          <span className={classes.countCollapsed}>{formatCount(Number(count))}</span>
        )}
      </span>
      <span className={clsx(classes.label, collapsed && classes.fadeOut)}>{primary}</span>
      {hasCount && (
        <span className={clsx(classes.count, collapsed && classes.fadeOut)}>
          {formatCount(Number(count))}
        </span>
      )}
      {trailing}
    </>
  );
}

function withIconSize(icon) {
  if (!React.isValidElement(icon)) return icon;
  return React.cloneElement(icon, {
    size: SIDEBAR_ICON_SIZE,
    strokeWidth: icon.props?.strokeWidth ?? 1.7,
  });
}

function ListItemLink({ icon, primary, to, showBadge, submenu, collapsed, count }) {
  const classes = useStyles({ collapsed });
  const { activeMenu } = useActiveMenu();
  const location = useLocation();
  const isActive = activeMenu === to || location.pathname === to;

  const renderLink = React.useMemo(
    () =>
      React.forwardRef((itemProps, ref) => (
        <RouterLink to={to} ref={ref} {...itemProps} />
      )),
    [to]
  );

  return (
    <SidebarTooltip title={collapsed ? primary : ""} placement="right">
      <ListItem
        button
        dense
        disableGutters
        component={renderLink}
        aria-current={isActive ? "page" : undefined}
        className={clsx(
          classes.item,
          isActive && classes.itemActive,
          submenu && classes.itemSubmenu
        )}
      >
        <ItemBody
          classes={classes}
          icon={withIconSize(icon)}
          primary={primary}
          collapsed={collapsed}
          count={count}
          showBadge={showBadge}
        />
      </ListItem>
    </SidebarTooltip>
  );
}

function ListItemGroup({ icon, primary, open, onClick, collapsed, active, count }) {
  const classes = useStyles({ collapsed });
  return (
    <SidebarTooltip title={collapsed ? primary : ""} placement="right">
      <ListItem
        button
        dense
        disableGutters
        onClick={onClick}
        aria-expanded={open}
        className={clsx(classes.item, active && classes.itemActive)}
      >
        <ItemBody
          classes={classes}
          icon={withIconSize(icon)}
          primary={primary}
          collapsed={collapsed}
          count={count}
          trailing={
            <span
              className={clsx(
                classes.chevron,
                open && classes.chevronOpen,
                collapsed && classes.fadeOut
              )}
              aria-hidden
            >
              <ChevronRight size={14} strokeWidth={1.8} />
            </span>
          }
        />
      </ListItem>
    </SidebarTooltip>
  );
}

const reducer = (state, action) => {
  if (action.type === "LOAD_CHATS") {
    const chats = action.payload;
    const newChats = [];

    if (isArray(chats)) {
      chats.forEach((chat) => {
        const chatIndex = state.findIndex((u) => u.id === chat.id);
        if (chatIndex !== -1) {
          state[chatIndex] = chat;
        } else {
          newChats.push(chat);
        }
      });
    }

    return [...state, ...newChats];
  }

  if (action.type === "UPDATE_CHATS") {
    const chat = action.payload;
    const chatIndex = state.findIndex((u) => u.id === chat.id);

    if (chatIndex !== -1) {
      state[chatIndex] = chat;
      return [...state];
    } else {
      return [chat, ...state];
    }
  }

  if (action.type === "DELETE_CHAT") {
    const chatId = action.payload;

    const chatIndex = state.findIndex((u) => u.id === chatId);
    if (chatIndex !== -1) {
      state.splice(chatIndex, 1);
    }
    return [...state];
  }

  if (action.type === "RESET") {
    return [];
  }

  if (action.type === "CHANGE_CHAT") {
    const changedChats = state.map((chat) => {
      if (chat.id === action.payload.chat.id) {
        return action.payload.chat;
      }
      return chat;
    });
    return changedChats;
  }
};

const MainListItems = ({ collapsed, drawerClose, section, ticketsCount = 0 }) => {
  const { ui: translateUi } = useAppTranslation();
  const classes = useStyles({ collapsed });
  const { whatsApps } = useContext(WhatsAppsContext);
  const { user, socket } = useContext(AuthContext);
  const history = useHistory();

  const { setActiveMenu } = useActiveMenu();
  const location = useLocation();

  const [, setConnectionWarning] = useState(false);
  const [openVBZappySubmenu, setOpenVBZappySubmenu] = useState(false);
  const [openMoreSubmenu, setOpenMoreSubmenu] = useState(false);

  const [showCampaigns, setShowCampaigns] = useState(false);
  const [showOpenAi, setShowOpenAi] = useState(false);

  const [showSchedules, setShowSchedules] = useState(false);
  const [showExternalApi, setShowExternalApi] = useState(false);

  const [, setInvisible] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);
  const [searchParam] = useState("");
  const [chats, dispatch] = useReducer(reducer, []);

  const { list } = useHelps();
  const [hasHelps, setHasHelps] = useState(false);

  const { get: getSetting } = useCompanySettings();
  const [, setShowWallets] = useState(false);

  const isTicketsRouteActive = location.pathname.startsWith("/tickets");
  const isMoreRouteActive = [
    "/leads-convertidos",
    "/inventory",
    "/platform-api",
    "/api",
  ].includes(location.pathname);

  const handleVBZappyClick = () => {
    history.push("/tickets");
    setOpenVBZappySubmenu((prev) => !prev);
  };

  useEffect(() => {
    async function checkHelps() {
      try {
        const helps = await list();
        setHasHelps(helps.length > 0);
      } catch (err) {
      }
    }
    checkHelps();
  }, []);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const setting = await getSetting(
          {
            "column": "DirectTicketsToWallets"
          }
        );
        setShowWallets(setting.DirectTicketsToWallets);
      } catch (err) {
        toastError(err);
      }
    }
    fetchSettings();
  }, [setShowWallets]);

  useEffect(() => {
    if (location.pathname.startsWith("/tickets")) {
      setActiveMenu("/tickets");
    } else {
      setActiveMenu("");
    }
  }, [location, setActiveMenu]);

  const { getPlanCompany } = usePlans();

  useEffect(() => {
    dispatch({ type: "RESET" });
    setPageNumber(1);
  }, [searchParam]);

  useEffect(() => {
    const batchUpdates = ReactDOM.unstable_batchedUpdates || ((fn) => fn());
    let cancelled = false;
    async function fetchData() {
      try {
        const companyId = user.companyId;
        if (!companyId) return;
        const planConfigs = await getPlanCompany(undefined, companyId);

        if (!planConfigs || !planConfigs.plan || cancelled) return;

        batchUpdates(() => {
          setShowCampaigns(planConfigs.plan.useCampaigns);
          setShowOpenAi(planConfigs.plan.useOpenAi);
          setShowSchedules(planConfigs.plan.useSchedules);
          setShowExternalApi(planConfigs.plan.useExternalApi);
        });
      } catch (err) {
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, [user.companyId]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchChats();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchParam, pageNumber]);

  useEffect(() => {
    const socketCompanyId = resolveSocketCompanyId({ user });
    if (user.id && socketCompanyId != null && socket && typeof socket.on === 'function') {
      const onCompanyChatMainListItems = (data) => {
        if (data.action === "new-message") {
          dispatch({ type: "CHANGE_CHAT", payload: data });
        }
        if (data.action === "update") {
          dispatch({ type: "CHANGE_CHAT", payload: data });
        }
      };

      const eventName = `company-${socketCompanyId}-chat`;
      socket.on(eventName, onCompanyChatMainListItems);

      return () => {
        if (socket && typeof socket.off === 'function') {
          socket.off(eventName, onCompanyChatMainListItems);
        }
      };
    }
  }, [socket, user.id, user.companyId]);

  useEffect(() => {
    let unreadsCount = 0;
    if (chats.length > 0) {
      for (let chat of chats) {
        for (let chatUser of chat.users) {
          if (chatUser.userId === user.id) {
            unreadsCount += chatUser.unreads;
          }
        }
      }
    }
    if (unreadsCount > 0) {
      setInvisible(false);
    } else {
      setInvisible(true);
    }
  }, [chats, user.id]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (Array.isArray(whatsApps) && whatsApps.length > 0) {
        const offlineWhats = whatsApps.filter((whats) => {
          return (
            whats.status === "qrcode" ||
            whats.status === "PAIRING" ||
            whats.status === "DISCONNECTED" ||
            whats.status === "TIMEOUT" ||
            whats.status === "OPENING"
          );
        });
        if (offlineWhats.length > 0) {
          setConnectionWarning(true);
        } else {
          setConnectionWarning(false);
        }
      }
    }, 2000);
    return () => clearTimeout(delayDebounceFn);
  }, [whatsApps]);

  const fetchChats = async () => {
    try {
      const { data } = await api.get("/chats/", {
        params: { searchParam, pageNumber },
      });
      dispatch({ type: "LOAD_CHATS", payload: data.records });
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (!drawerClose) return;
        const target = e.target;
        if (!(target instanceof Element)) return;
        // Fecha só ao navegar (link); submenus expansíveis não fecham o drawer
        if (target.closest("a")) {
          drawerClose();
        }
      }}
      className={classes.sidebarList}
    >
      {section === "main" && (
        <>
          <ListItemLink
            to="/"
            primary={i18n.t("mainDrawer.listItems.start")}
            icon={<AppIcon icon={Home} />}
            collapsed={collapsed}
          />
          <ListItemLink to="/leads-sales" primary={translateUi("Leads e Vendas")} icon={<AppIcon icon={CircleDollarSign} />} collapsed={collapsed} />
          <ListItemLink to="/activities" primary={translateUi("Atividades")} icon={<AppIcon icon={CheckSquare} />} collapsed={collapsed} />
          <ListItemLink to="/projects" primary={translateUi("Projetos")} icon={<AppIcon icon={FolderKanban} />} collapsed={collapsed} />
          {showSchedules && (
            <ListItemLink
              to="/schedules"
              primary={i18n.t("mainDrawer.listItems.schedules")}
              icon={<AppIcon icon={Calendar} />}
              collapsed={collapsed}
            />
          )}
          {user.showContacts === "enabled" && (
            <ListItemLink
              to="/contacts"
              primary={i18n.t("mainDrawer.listItems.contacts")}
              icon={<AppIcon icon={Contact} />}
              collapsed={collapsed}
            />
          )}

          <ListItemGroup
            icon={<AppIcon icon={MoreHorizontal} />}
            primary={translateUi("Mais")}
            open={openMoreSubmenu}
            active={isMoreRouteActive && !openMoreSubmenu}
            onClick={() => setOpenMoreSubmenu((prev) => !prev)}
            collapsed={collapsed}
          />
          <Collapse in={openMoreSubmenu} timeout="auto" unmountOnExit className={classes.collapse}>
            <ListItemLink to="/leads-convertidos" primary={translateUi("Empresas")} icon={<AppIcon icon={Building2} />} collapsed={collapsed} submenu />
            <ListItemLink
              to="/inventory"
              primary={translateUi("Inventário")}
              icon={<AppIcon icon={Package} />}
              collapsed={collapsed}
              submenu
            />
            {!isFreeTrialUser(user) && (
              <ListItemLink
                to="/platform-api"
                primary={translateUi("API & MCP")}
                icon={<AppIcon icon={Webhook} />}
                collapsed={collapsed}
                submenu
              />
            )}
            {isFreeTrialUser(user) && showExternalApi && (
              <ListItemLink
                to="/api"
                primary={translateUi("API de mensagens")}
                icon={<AppIcon icon={Code} />}
                collapsed={collapsed}
                submenu
              />
            )}
          </Collapse>

          {hasHelps && (
            <ListItemLink
              to="/helps"
              primary={i18n.t("mainDrawer.listItems.helps")}
              icon={<AppIcon icon={HelpCircle} />}
              collapsed={collapsed}
            />
          )}

          <div className={classes.groupGap} aria-hidden />

          <ListItemGroup
            icon={<AppIcon icon={MessageSquare} />}
            primary={translateUi("Atendimento")}
            open={openVBZappySubmenu}
            active={isTicketsRouteActive}
            onClick={handleVBZappyClick}
            collapsed={collapsed}
            count={ticketsCount}
          />
          <Collapse in={openVBZappySubmenu} timeout="auto" unmountOnExit className={classes.collapse}>
            <ListItemLink to="/queues" primary={translateUi("Filas & Chatbot")} icon={<AppIcon icon={GitBranch} />} collapsed={collapsed} submenu />
            {showCampaigns && <ListItemLink to="/campaigns" primary={translateUi("Campanhas")} icon={<AppIcon icon={Megaphone} />} collapsed={collapsed} submenu />}
            <ListItemLink to="/quick-messages" primary={translateUi("Respostas Rápidas")} icon={<AppIcon icon={Zap} />} collapsed={collapsed} submenu />
            <ListItemLink to="/whatsapp-dashboard" primary={translateUi("Dashboard")} icon={<AppIcon icon={LayoutDashboard} />} collapsed={collapsed} submenu />
          </Collapse>

          <ListItemLink to="/email" primary={translateUi("Email")} icon={<AppIcon icon={Mail} />} collapsed={collapsed} />

          <div className={classes.groupGap} aria-hidden />

          {(showOpenAi || user.profile !== "user") && (
            <ListItemLink to="/prompts" primary={translateUi("Agente IA")} icon={<AppIcon icon={Bot} />} collapsed={collapsed} />
          )}

          <ListItemLink
            to="/connections"
            primary={translateUi("Integrações")}
            icon={<AppIcon icon={Plug} />}
            collapsed={collapsed}
          />

          {user.showFlow === "enabled" && (
            <ListItemLink to="/flowbuilders" primary={translateUi("Automações")} icon={<AppIcon icon={Workflow} />} collapsed={collapsed} />
          )}

          {isInternalAutomationUser(user) && (
            <ListItemLink to="/automacao-interna" primary={translateUi("Automação Interna")} icon={<AppIcon icon={Zap} />} collapsed={collapsed} />
          )}

          <div className={classes.groupGap} aria-hidden />

          <ListItemLink to="/settings" primary={translateUi("Configurações")} icon={<AppIcon icon={Settings} />} collapsed={collapsed} />
        </>
      )}
    </div>
  );
};

export default MainListItems;
