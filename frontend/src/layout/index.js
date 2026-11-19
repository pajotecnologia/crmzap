import React, { useState, useContext, useEffect, useMemo, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import {
  makeStyles,
  Drawer,
  List,
  Typography,
  Divider,
  Button,
  MenuItem,
  IconButton,
  Menu,
  useTheme,
  useMediaQuery,
  Avatar,
  Badge,
  withStyles,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  ListItem,
  ListItemAvatar,
  ListItemText,
  FormControlLabel,
  Checkbox,
  InputBase,
  Tabs,
  Tab,
  Paper,
  Tooltip,
} from "@material-ui/core";
import { Link as RouterLink, useHistory, useLocation } from "react-router-dom";
import { getHelpTopicForPath, usesLayoutNavbarHelp } from "../utils/pageHelpMap";
import { PageTitleContext } from "../context/PageTitleContext";
import { DrawerContext } from "../context/DrawerContext";
import NotificationsIcon from "@material-ui/icons/Notifications";
import api from "../services/api";
import MainListItems from "./MainListItems";
import NotificationsPopOver from "../components/NotificationsPopOver";
import UserModal from "../components/UserModal";
import { AuthContext } from "../context/Auth/AuthContext";
import BackdropLoading from "../components/BackdropLoading";
import { i18n, applyAppLanguage } from "../translate/i18n";
import toastError from "../errors/toastError";
import BirthdayModal from "../components/BirthdayModal";
import { DEFAULT_LOGO_DARK, DEFAULT_LOGO_LIGHT } from "../constants/defaultLogos";
import { useDate } from "../hooks/useDate";
import ColorModeContext from "../layout/themeContext";
import { getBackendUrl, resolvePublicUploadUrl } from "../config";
import useSettings from "../hooks/useSettings";
import VersionControl from "../components/VersionControl";
import useSocketListener from "../hooks/useSocketListener";
import { logInfo, logError } from "../utils/logger";
import SubscriptionAlertBanner from "../components/SubscriptionAlertBanner";
import TrialCountdown from "../components/FreeTrial/TrialCountdown";
import TrialExpiredGate from "../components/FreeTrial/TrialExpiredGate";
import FreeTrialOnboardingTour from "../components/FreeTrial/OnboardingTour";
import { topbarSvgIconStyle } from "../constants/topbarIcons";
import MobileBottomNav, { MOBILE_BOTTOM_NAV_HEIGHT } from "./mobileNav/MobileBottomNav";
import MobileMoreSheet from "./mobileNav/MobileMoreSheet";
import {
  buildBottomItems,
  buildMoreSections,
  isCoveredByBottomItems,
} from "./mobileNav/navConfig";
import useNavPermissions from "../hooks/useNavPermissions";
import useVirtualKeyboardOpen, {
  useKeepFocusedFieldVisible,
} from "../hooks/useVirtualKeyboardOpen";
import useAppTranslation from "../hooks/useAppTranslation";
import DesktopSidebarFooter from "./DesktopSidebarFooter";
import SidebarBrand from "./SidebarBrand";
import SidebarToggleButton from "./SidebarToggleButton";
import {
  getSidebarTokens,
  SIDEBAR_LAYOUT,
  SIDEBAR_EASING,
  SIDEBAR_DURATION_MS,
} from "./sidebarTokens";

/** Rotas que controlam o próprio scroll em tela cheia no mobile. */
const MOBILE_FIXED_HEIGHT_ROUTES = [
  /^\/tickets(\/|$)/,
  /^\/flowbuilder\/[^/]+/,
  /^\/chats(\/|$)/,
  /^\/brain-ai(\/|$)/,
];
/** Rotas em que a barra inferior sai do caminho (conversa aberta). */
const MOBILE_HIDE_BOTTOM_NAV_ROUTES = [/^\/tickets\/[^/]+/];

const backendUrl = getBackendUrl();
const drawerWidth = 240;
const appBarHeight = 32;

const useStyles = makeStyles((theme) => {
  const navIcon =
    theme.navbarAccent != null && theme.navbarAccent !== ""
      ? theme.navbarAccent
      : "rgba(255, 255, 255, 0.9)";
  return {
  root: {
    display: "flex",
    height: "100vh",
    minHeight: "100dvh",
    maxHeight: "100dvh",
    overflow: "hidden",
    [theme.breakpoints.down("sm")]: {
      height: "100dvh",
      minHeight: "100dvh",
      maxHeight: "100dvh",
      overflow: "hidden",
      position: "relative",
      paddingLeft: "env(safe-area-inset-left, 0px)",
      paddingRight: "env(safe-area-inset-right, 0px)",
    },
    backgroundColor: theme.palette.fancyBackground,
    "& .MuiButton-outlinedPrimary": {
      color: theme.palette.primary.main,
      border: `1px solid ${theme.palette.primary.main}40`,
      borderRadius: "6px",
      fontWeight: 500,
      textTransform: "none",
      transition: "background-color 0.15s ease, border-color 0.15s ease",
      "&:hover": {
        backgroundColor: `${theme.palette.primary.main}10`,
        borderColor: theme.palette.primary.main,
      },
    },
    "& .MuiTab-textColorPrimary.Mui-selected": {
      color: theme.palette.primary.main,
      fontWeight: 300,
    },
    "& .MuiButton-containedPrimary, & .MuiButton-outlinedPrimary, & .MuiButton-textPrimary": {
      textTransform: "none",
      fontSize: "12px",
      fontWeight: 500,
      borderRadius: 6,
      padding: "5px 16px",
      minWidth: 80,
      minHeight: 32,
      maxHeight: 34,
      letterSpacing: "0.01em",
    },
    "& .MuiButton-contained": {
      boxShadow: "none",
      "&:hover": { boxShadow: "none" },
    },
    "& .MuiDialogActions-root .MuiButton-root": {
      fontSize: "12px",
      padding: "5px 16px",
      minWidth: 80,
      minHeight: 32,
      maxHeight: 34,
      textTransform: "none",
      borderRadius: 6,
    },
  },

  chip: {
    background: "red",
    color: "white",
  },

  avatar: {
    width: "100%",
  },

  toolbarCenterCluster: {
    position: "absolute",
    left: "50%",
    transform: "translateX(calc(-50% - 20px))",
    display: "flex",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: theme.spacing(0.25),
    zIndex: 1,
    pointerEvents: "auto",
    [theme.breakpoints.down("sm")]: {
      display: "none",
    },
  },
  toolbarMobileSearch: {
    // `&&` sobe a especificidade para não perder para `.search { display: flex }`
    // (sem isso as duas buscas ficam visíveis no desktop e a topbar quebra).
    "&&": {
      display: "none",
    },
    flex: 1,
    minWidth: 0,
    marginLeft: 4,
    marginRight: 4,
    [theme.breakpoints.down("sm")]: {
      "&&": {
        display: "flex",
      },
    },
  },
  toolbarDesktopOnly: {
    "&&": {
      display: "inline-flex",
    },
    alignItems: "center",
    [theme.breakpoints.down("sm")]: {
      "&&": {
        display: "none",
      },
    },
  },
  menuToggleBtn: {
    flexShrink: 0,
    width: 36,
    height: 36,
    minWidth: 36,
    minHeight: 36,
    padding: "0 !important",
    margin: "0 2px 0 0 !important",
    borderRadius: 8,
    color: navIcon,
    [theme.breakpoints.down("sm")]: {
      width: 40,
      height: 40,
      minWidth: 40,
      minHeight: 40,
    },
  },
  toolbar: {
    position: "relative",
    paddingRight: 16,
    paddingLeft: 8,
    color: theme.palette.dark.main,
    background: theme.palette.barraSuperior,
    backdropFilter: "saturate(180%) blur(8px)",
    WebkitBackdropFilter: "saturate(180%) blur(8px)",
    boxShadow: "none",
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
    transition: "width 0.2s ease, margin 0.2s ease",
    minHeight: `${appBarHeight}px`,
    height: `${appBarHeight}px`,
    display: "flex",
    alignItems: "center",
    gap: 4,
    "& .MuiIconButton-root": {
      padding: 6,
      margin: "0 3px",
      borderRadius: 6,
      color: navIcon,
      transition: "background-color 0.15s ease",
      "&:hover": {
        backgroundColor: "rgba(255, 255, 255, 0.1)",
      },
    },
    [theme.breakpoints.down("sm")]: {
      minHeight: 48,
      height: 48,
      paddingLeft: 6,
      paddingRight: 8,
      gap: 2,
    },
  },
  topbarActionBtn: {
    width: 24,
    height: 24,
    minWidth: 24,
    minHeight: 24,
    padding: "0 !important",
    margin: "0 2px !important",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    "& .MuiSvgIcon-root": {
      fontSize: "14px !important",
      width: "14px !important",
      height: "14px !important",
    },
    "& svg": {
      width: "14px !important",
      height: "14px !important",
      flexShrink: 0,
    },
    "& .MuiBadge-root": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
    },
  },
  topbarRightCluster: {
    display: "inline-flex",
    alignItems: "center",
    flexShrink: 0,
  },

  toolbarIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px 6px",
    height: "52px",
    minHeight: "52px",
    backgroundColor:
      theme.palette.sidebarMenuBackground || theme.palette.background.paper,
    transition: "all 0.3s ease",
    marginTop: 0,
    marginBottom: 0,
    position: "relative",
    flexShrink: 0,
    [theme.breakpoints.down("sm")]: {
      height: 44,
      minHeight: 44,
      padding: "2px 6px",
    },
  },
  chevronButton: {
    position: "absolute",
    top: 4,
    right: 8,
    padding: 2,
    color: theme.palette.sidebarMenuIcon || theme.palette.text.primary,
    "& svg": {
      fontSize: "0.9rem",
    },
    [theme.breakpoints.down("sm")]: {
      display: "inline-flex",
      top: 8,
      right: 10,
      padding: 6,
      backgroundColor: "rgba(255,255,255,0.06)",
      borderRadius: 8,
      "&:hover": {
        backgroundColor: "rgba(255,255,255,0.12)",
      },
    },
  },
  drawerMobileHeader: {
    display: "none",
    [theme.breakpoints.down("sm")]: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "6px 10px 4px",
      minHeight: 40,
      borderBottom: `1px solid ${theme.palette.divider}`,
      flexShrink: 0,
    },
  },
  drawerMobileTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: theme.palette.sidebarMenuIcon || theme.palette.text.primary,
    letterSpacing: "0.01em",
  },

  search: {
    position: "relative",
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    "&:hover": {
      backgroundColor: "rgba(255, 255, 255, 0.18)",
    },
    "&:focus-within": {
      backgroundColor: "rgba(255, 255, 255, 0.2)",
      borderColor: "rgba(255, 255, 255, 0.2)",
    },
    marginRight: theme.spacing(1.5),
    marginLeft: 0,
    width: "100%",
    [theme.breakpoints.up("sm")]: {
      marginLeft: theme.spacing(0.5),
      width: "auto",
    },
    flexGrow: 1,
    maxWidth: "260px",
    height: "26px",
    alignItems: "center",
    display: "flex",
  },
  /** Pesquisa dentro do cluster central (sem flexGrow, largura fixa). */
  searchCentered: {
    flexGrow: 0,
    marginLeft: 0,
    marginRight: 0,
    width: "min(280px, 42vw)",
    maxWidth: 280,
    [theme.breakpoints.down("xs")]: {
      width: "min(220px, 52vw)",
      maxWidth: 260
    }
  },
  searchIcon: {
    padding: theme.spacing(0, 1),
    height: "100%",
    position: "absolute",
    pointerEvents: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: navIcon,
    "& .MuiSvgIcon-root": {
      fontSize: 16,
      width: 16,
      height: 16,
    },
  },
  inputRoot: {
    color: 'inherit',
    width: "100%",
    fontSize: "0.8125rem",
  },
  inputInput: {
    padding: theme.spacing(1, 1, 1, 0),
    // vertical padding + font size from searchIcon
    paddingLeft: `calc(1em + ${theme.spacing(2)}px)`, // Ajustado padding
    transition: theme.transitions.create('width'),
    width: '100%',
    color: navIcon,
    "&::placeholder": {
        color: navIcon,
        opacity: 0.75,
        fontSize: "0.8rem", // Placeholder menor
    }
  },

  appBar: {
    zIndex: theme.zIndex.drawer + 1,
    transition: theme.transitions.create(["width", "margin"], {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.leavingScreen,
    }),
    height: `${appBarHeight}px`,
    backgroundColor: theme.palette.barraSuperior,
    color: "inherit",
    // fixed: topbar não “desce” junto ao rolar menu/conteúdo no mobile
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    [theme.breakpoints.down("sm")]: {
      height: 48,
      // Mobile: navegação vai para a barra inferior + menu "Mais".
      display: "none !important",
    },
  },

  appBarShift: {
    width: "100%",
    transition: theme.transitions.create(["width", "margin"], {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.enteringScreen,
    }),
  },

  secondaryNavbar: {
    position: "fixed",
    top: appBarHeight,
    right: 0,
    left: theme.spacing(7),
    backgroundColor: theme.palette.background.paper,
    // borderBottom: "1px solid rgba(0, 0, 0, 0.12)", // Removed
    zIndex: theme.zIndex.drawer + 1,
    transition: theme.transitions.create(["width", "margin", "left"], {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.leavingScreen,
    }),
    [theme.breakpoints.up("sm")]: {
      left: theme.spacing(9),
    },
    [theme.breakpoints.down("sm")]: {
      left: 0,
    },
  },
  secondaryNavbarShift: {
    left: drawerWidth,
    transition: theme.transitions.create(["width", "margin", "left"], {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.enteringScreen,
    }),
  },

  menuButtonHidden: {
    display: "none",
  },

  title: {
    fontSize: 12,
    color: "white",
    fontWeight: 300,
    letterSpacing: "0.025em",
    marginLeft: theme.spacing(7),
    transition: theme.transitions.create(["margin"], {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.leavingScreen,
    }),
    [theme.breakpoints.up("sm")]: {
      marginLeft: theme.spacing(9),
    },
  },

  titleShift: {
    marginLeft: drawerWidth,
    transition: theme.transitions.create(["margin"], {
      easing: theme.transitions.easing.easeOut,
      duration: theme.transitions.duration.enteringScreen,
    }),
  },

  /** Ocupa no fluxo a largura do painel + respiros; o conteúdo começa logo depois. */
  sidebarDock: {
    flexShrink: 0,
    height: "100%",
    width: "calc(var(--vb-sidebar-width) + var(--vb-sidebar-gap) * 2)",
    transition: `width ${SIDEBAR_DURATION_MS}ms ${SIDEBAR_EASING}`,
    "@media (prefers-reduced-motion: reduce)": {
      transition: "none",
    },
  },

  /** Painel flutuante do menu lateral desktop. */
  sidebarPanel: {
    "&&": {
      position: "fixed",
      left: "var(--vb-sidebar-gap)",
      top: "var(--vb-sidebar-gap)",
      bottom: "var(--vb-sidebar-gap)",
      height: "auto",
      width: "var(--vb-sidebar-width)",
      borderRadius: SIDEBAR_LAYOUT.radius,
      border: "none",
      backgroundColor: getSidebarTokens(theme).panel,
      boxShadow: getSidebarTokens(theme).shadow,
      whiteSpace: "nowrap",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      transition: `width ${SIDEBAR_DURATION_MS}ms ${SIDEBAR_EASING}`,
    },
    "@media (prefers-reduced-motion: reduce)": {
      "&&": { transition: "none" },
    },
  },

  appBarSpacer: {
    minHeight: 0,
    [theme.breakpoints.down("sm")]: {
      minHeight: "env(safe-area-inset-top, 0px)",
      flexShrink: 0,
    },
  },

  content: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    overflow: "auto",
    overflowX: "hidden",
    padding: 0,
    margin: 0,
    paddingLeft: 0,
    ...theme.scrollbarStyles,
    [theme.breakpoints.down("sm")]: {
      display: "flex",
      flexDirection: "column",
      overflowY: "auto",
      overflowX: "hidden",
      overscrollBehaviorY: "contain",
      WebkitOverflowScrolling: "touch",
      scrollPaddingTop: "env(safe-area-inset-top, 0px)",
      scrollPaddingBottom:
        "calc(var(--vb-keyboard-inset, 0px) + var(--vb-bottom-nav-offset, 0px) + 12px)",
      "& > *": {
        flexShrink: 0,
      },
    },
  },
  contentFixedMobile: {
    [theme.breakpoints.down("sm")]: {
      overflowY: "hidden",
    },
  },
  /** Desktop: não gera caixa (layout idêntico). Mobile: ocupa a altura útil. */
  pageSlot: {
    display: "contents",
    [theme.breakpoints.down("sm")]: {
      display: "flex",
      flexDirection: "column",
      flex: "1 0 auto",
      minHeight: 0,
      minWidth: 0,
      width: "100%",
    },
  },
  pageSlotFixed: {
    [theme.breakpoints.down("sm")]: {
      flex: "1 1 0%",
      overflow: "hidden",
    },
  },
  bottomNavSpacer: {
    display: "none",
    [theme.breakpoints.down("sm")]: {
      display: "block",
      height: `calc(${MOBILE_BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px))`,
    },
  },
  /** Atendimento controla o próprio scroll: lista e conversa ocupam toda a altura útil. */
  contentTicketsMobile: {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minHeight: 0,
    height: "100%",
  },

  container: {
    padding: 0,
    margin: 0,
    maxWidth: "none",
    width: "100%",
  },

  containerWithScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    overflowX: "hidden",
    overscrollBehavior: "contain",
    WebkitOverflowScrolling: "touch",
    ...theme.scrollbarStylesSoft,
    borderRadius: "8px",
    border: "2px solid transparent",
    [theme.breakpoints.down("sm")]: {
      borderRadius: 0,
      border: "none",
    },
  },

  /** Área de navegação com rolagem própria; perfil fica fixo no rodapé do painel. */
  sidebarNav: {
    flex: "1 1 auto",
    minHeight: 0,
    overflowY: "auto",
    overflowX: "hidden",
    overscrollBehavior: "contain",
    padding: "0 !important",
    scrollbarWidth: "thin",
    scrollbarColor: `${getSidebarTokens(theme).badgeBorder} transparent`,
    "&::-webkit-scrollbar": { width: 4 },
    "&::-webkit-scrollbar-thumb": {
      backgroundColor: getSidebarTokens(theme).badgeBorder,
      borderRadius: 2,
    },
    "&::-webkit-scrollbar-track": { backgroundColor: "transparent" },
  },
  sidebarBottomList: {
    paddingTop: "2px !important",
    paddingBottom: "2px !important",
  },

  logo: {
    width: "auto",
    height: "auto",
    maxHeight: "56px",
    maxWidth: "min(100%, 150px)",
    objectFit: "contain",
    objectPosition: "center",
    transition: "opacity 0.15s ease",
    cursor: "pointer",
    "&:hover": {
      opacity: 0.9,
    },
    [theme.breakpoints.down("sm")]: {
      maxHeight: 36,
      maxWidth: "min(100%, 120px)",
    },
  },


  hideLogo: {
    width: "28px",
    maxWidth: "28px",
    margin: "0 auto",
  },

  avatar2: {
    width: 24,
    height: 24,
    cursor: "pointer",
    borderRadius: "50%",
    border: "1.5px solid rgba(255,255,255,0.35)",
    transition: "all 0.3s ease",
    "&:hover": {
      transform: "scale(1.05)",
      borderColor: theme.palette.primary.main, // Usa cor do tema
    },
  },

  updateDiv: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },

  // Botões da toolbar melhorados
  toolbarButton: {
    color: navIcon,
    borderRadius: "6px",
    padding: "5px",
    margin: "0 1px",
    transition: "background-color 0.15s ease",
    "&:hover": {
      backgroundColor: "rgba(255, 255, 255, 0.1)",
    },
  },

  menuButton: {
    color: navIcon,
    "&:hover": {
      backgroundColor: "rgba(255, 255, 255, 0.1)",
    },
  },

  // Seletor de idioma melhorado
  languageSelector: {
    position: "relative",
    display: "inline-block",
    "& > button": {
      background: "rgba(255, 255, 255, 0.1)",
      border: "none",
      borderRadius: "8px",
      color: navIcon,
      fontSize: "18px",
      padding: "8px 12px",
      cursor: "pointer",
      transition: "all 0.3s ease",
      "&:hover": {
        background: "rgba(255, 255, 255, 0.2)",
        transform: "translateY(-1px)",
      },
    },
    "& > div": {
      position: "absolute",
      top: "45px",
      left: "0",
      background: theme.palette.background.paper,
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
      borderRadius: "8px",
      padding: "8px",
      zIndex: 1000,
      minWidth: "120px",
      border: `1px solid ${theme.palette.divider}`,
      "& button": {
        background: "none",
        border: "none",
        color: theme.palette.text.primary,
        display: "block",
        width: "100%",
        padding: "8px 12px",
        textAlign: "left",
        borderRadius: "6px",
        fontSize: "14px",
        fontWeight: 500,
        transition: "all 0.2s ease",
        "&:hover": {
          background: `${theme.palette.primary.main}10`, // Usa cor do tema
          color: theme.palette.primary.main, // Usa cor do tema
          transform: "none",
        },
      },
    },
  },

  animatedBadge: {
    "& .MuiBadge-badge": {
      fontSize: "0.625rem",
      minWidth: 16,
      height: 16,
    },
  },
};
});

const StyledBadge = withStyles((theme) => ({
  badge: {
    backgroundColor: "#44b700",
    color: "#44b700",
    boxShadow: `0 0 0 2px ${theme.palette.background.paper}`,
    "&::after": {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      borderRadius: "50%",
      animation: "$ripple 1.2s infinite ease-in-out",
      border: "1px solid currentColor",
      content: '""',
    },
  },
  "@keyframes ripple": {
    "0%": {
      transform: "scale(.8)",
      opacity: 1,
    },
    "100%": {
      transform: "scale(2.4)",
      opacity: 0,
    },
  },
}))(Badge);

const SmallAvatar = withStyles((theme) => ({
  root: {
    width: 22,
    height: 22,
    border: `2px solid ${theme.palette.background.paper}`,
  },
}))(Avatar);

const LoggedInLayout = ({ children, themeToggle, hideMenu = false }) => {
  // Se o OAuth Instagram abriu popup e o CRM carregou nela por engano, fecha na hora.
  useEffect(() => {
    try {
      const nameOk = window.name === "vbsolution_instagram_oauth";
      let flagOk = false;
      try {
        const ts = Number(localStorage.getItem("vbsolution_ig_oauth_popup_active") || 0);
        flagOk = Boolean(ts && Date.now() - ts < 10 * 60 * 1000);
      } catch {
        // ignore
      }
      const path = String(window.location?.pathname || "");
      // Só fecha se for a janela nomeada do OAuth (não a aba principal com o flag).
      if (
        nameOk &&
        path &&
        !path.includes("/connections/instagram-oauth")
      ) {
        try {
          window.close();
        } catch {
          // ignore
        }
        setTimeout(() => {
          try {
            window.open("", "_self");
            window.close();
          } catch {
            // ignore
          }
        }, 100);
      }
      // flagOk unused for close — evita fechar a aba principal do CRM.
      void flagOk;
    } catch {
      // ignore
    }
  }, []);

  const classes = useStyles();
  const { pageTitle } = useContext(PageTitleContext);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { handleLogout, loading, user, socket } = useContext(AuthContext);
  const [drawerOpen, setDrawerOpen] = useState(
    () => user?.defaultMenu !== "closed" && window.innerWidth >= 960
  );
  const [showOptions, setShowOptions] = useState(false);
  const [showAnnouncementsModal, setShowAnnouncementsModal] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [ackChecked, setAckChecked] = useState(false);
  const [showBirthdayModal, setShowBirthdayModal] = useState(false);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isCompactDesktop = useMediaQuery(theme.breakpoints.down("md"));
  const drawerVariant = isMobile ? "temporary" : "permanent";
  const colorMode = useContext(ColorModeContext);
  const sidebarLogoFallback = theme.palette.sidebarMenuIsDarkLogo
    ? DEFAULT_LOGO_DARK
    : DEFAULT_LOGO_LIGHT;
  const sidebarLogoCandidate = theme.palette.sidebarMenuIsDarkLogo
    ? theme.calculatedLogoDark()
    : theme.calculatedLogoLight();
  const [sidebarLogoSrc, setSidebarLogoSrc] = useState(
    () => sidebarLogoCandidate || sidebarLogoFallback
  );

  useEffect(() => {
    setSidebarLogoSrc(sidebarLogoCandidate || sidebarLogoFallback);
  }, [sidebarLogoCandidate, sidebarLogoFallback]);

  const handleSidebarLogoError = useCallback(() => {
    setSidebarLogoSrc((prev) =>
      prev !== sidebarLogoFallback ? sidebarLogoFallback : prev
    );
  }, [sidebarLogoFallback]);
  const greaterThenSm = useMediaQuery(theme.breakpoints.up("sm"));
  const topbarIconColor =
    theme.navbarAccent != null && theme.navbarAccent !== ""
      ? theme.navbarAccent
      : "rgba(255, 255, 255, 0.92)";
  const topbarIconSx = topbarSvgIconStyle(topbarIconColor);

  const history = useHistory();
  const location = useLocation();
  const { ui: translateUi } = useAppTranslation();
  const navPermissions = useNavPermissions();
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [unreadTicketsCount, setUnreadTicketsCount] = useState(0);
  const keyboardOpen = useVirtualKeyboardOpen(isMobile);
  const pathname = location.pathname;
  const isFixedHeightRoute = MOBILE_FIXED_HEIGHT_ROUTES.some((re) => re.test(pathname));
  useKeepFocusedFieldVisible(isMobile && !isFixedHeightRoute);
  const bottomNavRouteHidden = MOBILE_HIDE_BOTTOM_NAV_ROUTES.some((re) => re.test(pathname));
  const showBottomNav = isMobile && !hideMenu && !bottomNavRouteHidden && !keyboardOpen;
  const bottomNavItems = useMemo(
    () => buildBottomItems(navPermissions, translateUi),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navPermissions.showContacts, translateUi]
  );
  const moreSections = useMemo(
    () => buildMoreSections(navPermissions, translateUi),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      navPermissions.showContacts,
      navPermissions.showFlow,
      navPermissions.showCampaigns,
      navPermissions.showSchedules,
      navPermissions.showAgents,
      navPermissions.showPlatformApi,
      navPermissions.showMessagesApi,
      navPermissions.hasHelps,
      navPermissions.isInternalAutomationAdmin,
      translateUi,
    ]
  );
  const moreActive =
    moreSheetOpen || !isCoveredByBottomItems(pathname, bottomNavItems);

  useEffect(() => {
    setMoreSheetOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMobile) setMoreSheetOpen(false);
  }, [isMobile]);

  /** Fixos no rodapé (FABs, toasts) sobem acima da barra inferior via CSS var. */
  useEffect(() => {
    const root = document.documentElement;
    if (showBottomNav) {
      root.style.setProperty(
        "--vb-bottom-nav-offset",
        `calc(${MOBILE_BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px))`
      );
    } else {
      root.style.removeProperty("--vb-bottom-nav-offset");
    }
    return () => root.style.removeProperty("--vb-bottom-nav-offset");
  }, [showBottomNav]);

  /** Espaço do teclado virtual para rodapés sticky e scroll-padding. */
  useEffect(() => {
    if (!isMobile || typeof window === "undefined") return undefined;
    const vv = window.visualViewport;
    const root = document.documentElement;
    if (!vv) return undefined;
    const sync = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty(
        "--vb-keyboard-inset",
        inset > 80 ? `${Math.round(inset)}px` : "0px"
      );
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      root.style.removeProperty("--vb-keyboard-inset");
    };
  }, [isMobile]);

  const appBarHelpTopic =
    !usesLayoutNavbarHelp(location.pathname) &&
    getHelpTopicForPath(location.pathname);
  const { dateToClient } = useDate();
  const [profileUrl, setProfileUrl] = useState(null);
  const [updateInProgress, setUpdateInProgress] = useState(false);


  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mainListItems = useMemo(
    () => <MainListItems drawerOpen={drawerOpen} collapsed={!drawerOpen} />,
    [user?.id, user?.profile, drawerOpen]
  );

  const settings = useSettings();
  const getPublicSettingRef = useRef(settings.getPublicSetting);
  getPublicSettingRef.current = settings.getPublicSetting;

  /** Logos públicas são por empresa; GET /public-settings sem companyId usa empresa 1 no backend — recarrega com a empresa do usuário logado. */
  useEffect(() => {
    const companyId = user?.companyId;
    if (!companyId) return;
    let cancelled = false;
    const toLogoSrc = (file, fallback) => {
      if (file == null || String(file).trim() === "") return fallback;
      const u = resolvePublicUploadUrl(file);
      return u || fallback;
    };
    (async () => {
      try {
        const gp = getPublicSettingRef.current;
        const [lightFile, darkFile] = await Promise.all([
          gp("appLogoLight", companyId),
          gp("appLogoDark", companyId),
        ]);
        if (cancelled) return;
        colorMode.setAppLogoLight(toLogoSrc(lightFile, DEFAULT_LOGO_LIGHT));
        colorMode.setAppLogoDark(toLogoSrc(darkFile, DEFAULT_LOGO_DARK));
      } catch {
        /* mantém estado do App */
      }
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- colorMode/setters estáveis; evitar loop com value novo do Provider
  }, [user?.companyId]);

  const fetchAnnouncements = useCallback(async () => {
      try {
        const { data } = await api.get("/announcements/for-company", {
          params: {
            status: true,
            pageNumber: "1"
          }
        });

        // Filtra apenas os informativos ativos e não expirados
        const activeAnnouncementsRaw = data.records.filter(announcement => {
          const isActive = announcement.status === true || announcement.status === "true";
          const isNotExpired = !announcement.expiresAt || new Date(announcement.expiresAt) > new Date();
          return isActive && isNotExpired;
        });

        // Backend já filtra por empresa excluindo os reconhecidos
        const activeAnnouncements = activeAnnouncementsRaw;
        setAnnouncements(activeAnnouncements);
        setShowAnnouncementsModal(activeAnnouncements.length > 0);
      } catch (err) {
        toastError(err);
      }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      fetchAnnouncements();
    }
  }, [user?.id, fetchAnnouncements]);

  // Atualiza checkbox ao trocar de aviso
  useEffect(() => {
    if (!selectedAnnouncement) {
      setAckChecked(false);
      return;
    }
    // Não precisamos mais ler localStorage; tratamos via backend
    setAckChecked(false);
  }, [selectedAnnouncement, user?.companyId]);

  const handleToggleAcknowledge = async (announcementId, checked) => {
    try {
      if (checked) {
        await api.post(`/announcements/${announcementId}/ack`);
        // Remove este aviso da lista
        setAnnouncements(prev => prev.filter(a => a.id !== announcementId));
        setSelectedAnnouncement(null);
      } else {
        await api.delete(`/announcements/${announcementId}/ack`);
        // Opcional: recarregar lista para reexibir (se desejar permitir desfazer)
        await fetchAnnouncements();
      }
      // Fecha modal se não restarem avisos
      setShowAnnouncementsModal((prev) => {
        return announcements.length - 1 > 0;
      });
    } catch (err) {
      toastError(err);
    }
  };

  useEffect(() => {
    if (isMobile) {
      setDrawerOpen(false);
      return;
    }
    if (user?.defaultMenu === "closed") {
      setDrawerOpen(false);
    } else {
      setDrawerOpen(true);
    }
  }, [user?.defaultMenu, isMobile]);

  useEffect(() => {
    if (!isMobile) return undefined;
    setDrawerOpen(false);
    return undefined;
  }, [location.pathname, isMobile]);

  // Mobile: ao abrir o menu, trava o body para a topbar não “descer” com o scroll
  useEffect(() => {
    if (!isMobile) return undefined;
    const prevOverflow = document.body.style.overflow;
    const prevTouch = document.body.style.touchAction;
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
      document.documentElement.style.overflow = "hidden";
    } else {
      document.body.style.overflow = prevOverflow || "";
      document.body.style.touchAction = prevTouch || "";
      document.documentElement.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = prevOverflow || "";
      document.body.style.touchAction = prevTouch || "";
      document.documentElement.style.overflow = "";
    };
  }, [drawerOpen, isMobile]);

  useEffect(() => {
    const companyId = user?.companyId;

    if (companyId) {
      const buildProfileUrl = () => {
        const savedProfileImage = localStorage.getItem("profileImage");
        const currentProfileImage = savedProfileImage || user.profileImage;

        if (currentProfileImage) {
          return `${backendUrl}/public/company${companyId}/user/${currentProfileImage}`;
        }
        return `${backendUrl}/public/app/noimage.png`;
      };

      setProfileUrl(buildProfileUrl());
    }
  }, [user?.companyId, user?.profileImage, backendUrl]);

  // Callbacks dos eventos
  const handleAuthEvent = useCallback((data) => {
    if (data.user.id === +user?.id) {
      toastError("Sua conta foi acessada em outro computador.");
      setTimeout(() => {
        localStorage.clear();
        window.location.reload();
      }, 1000);
    }
  }, [user?.id]);

  const handleUserUpdate = useCallback((data) => {
    if (data.action === "update" && data.user.id === +user?.id) {
      if (data.user.profileImage) {
        const newProfileUrl = `${backendUrl}/public/company${user?.companyId}/user/${data.user.profileImage}`;
        setProfileUrl(newProfileUrl);
        localStorage.setItem("profileImage", data.user.profileImage);
      }
    }
  }, [user?.companyId, user?.id, backendUrl]);

  // Callbacks para eventos de aniversário
  const handleUserBirthday = useCallback((data) => {
    logInfo("Evento de aniversário de usuário recebido", { data });
    if (data.userId === +user?.id) {
      setShowBirthdayModal(true);
    }
  }, [user?.id]);

  const handleContactBirthday = useCallback((data) => {
    logInfo("Evento de aniversário de contato recebido", { data });
  }, []);

  // Verificar aniversários no login
  const checkBirthdaysOnLogin = useCallback(async () => {
    if (user?.id && user?.companyId) {
      try {
        const { data } = await api.get("/birthdays/today");
        const birthdayData = data.data;

        // Verificar se o usuário atual faz aniversário hoje
        const userBirthday = birthdayData.users.find(u => u.id === +user.id);
        if (userBirthday) {
          logInfo("Usuário faz aniversário hoje; exibindo modal");
          setShowBirthdayModal(true);
        }

        // Se há aniversariantes, mostrar notificação
        if (birthdayData.users.length > 0 || birthdayData.contacts.length > 0) {
          logInfo("Há aniversariantes hoje", { birthdayData });
        }
      } catch (error) {
        logError("Erro ao verificar aniversários", error);
      }
    }
  }, [user?.id, user?.companyId]);

  // Registrar listeners
  useSocketListener(socket, user, 'auth', handleAuthEvent);
  useSocketListener(socket, user, 'user', handleUserUpdate);
  useSocketListener(socket, user, 'user-birthday', handleUserBirthday);
  useSocketListener(socket, user, 'contact-birthday', handleContactBirthday);

  // Verificar aniversários quando o usuário faz login
  useEffect(() => {
    if (user?.id && user?.companyId) {
      // Pequeno delay para garantir que o socket esteja conectado
      const timer = setTimeout(() => {
        checkBirthdaysOnLogin();
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [user?.id, user?.companyId, checkBirthdaysOnLogin]);

  // Status do usuário
  useEffect(() => {
    if (socket?.emit && user?.companyId) {
      socket.emit("userStatus");

      const interval = setInterval(() => {
        socket?.emit && socket.emit("userStatus");
      }, 1000 * 60 * 5);

      return () => clearInterval(interval);
    }
  }, [socket, user?.companyId]);

  const handleUpdateStart = () => {
    setUpdateInProgress(true);
  };

  const handleUpdateComplete = () => {
    setUpdateInProgress(false);
  };

  const handleMenu = (event) => {
    setAnchorEl(event.currentTarget);
    setMenuOpen(true);
  };

  const handleCloseMenu = () => {
    setAnchorEl(null);
    setMenuOpen(false);
  };

  const handleOpenUserModal = () => {
    setUserModalOpen(true);
    handleCloseMenu();
  };

  const handleClickLogout = () => {
    handleCloseMenu();
    handleLogout();
  };

  const drawerClose = useCallback(() => {
    if (isMobile) {
      setDrawerOpen(false);
    }
  }, [isMobile]);

  const toggleDrawer = useCallback(() => {
    setDrawerOpen((prev) => !prev);
  }, []);

  /**
   * Controles do menu montados nos cabeçalhos, em ordem de montagem. Só o primeiro aparece
   * (páginas embutidas em abas não duplicam); sem nenhum, o layout mostra o de reserva.
   */
  const [headerToggleIds, setHeaderToggleIds] = useState([]);
  const registerHeaderToggle = useCallback((id) => {
    setHeaderToggleIds((ids) => [...ids, id]);
    return () => setHeaderToggleIds((ids) => ids.filter((x) => x !== id));
  }, []);
  const activeHeaderToggleId = headerToggleIds.length ? headerToggleIds[0] : null;

  const sidebarGap = isCompactDesktop ? SIDEBAR_LAYOUT.gapCompact : SIDEBAR_LAYOUT.gap;
  const sidebarWidth = drawerOpen
    ? isCompactDesktop
      ? SIDEBAR_LAYOUT.widthCompact
      : SIDEBAR_LAYOUT.width
    : SIDEBAR_LAYOUT.collapsedWidth;
  const showDesktopSidebar = !hideMenu && !isMobile;

  const handleOpenBrainAi = useCallback(() => {
    history.push("/brain-ai");
  }, [history]);

  const handleRefreshPage = () => {
    window.location.reload(false);
  };

  const handleMenuItemClick = () => {
    if (isMobile) {
      setDrawerOpen(false);
    }
  };

  const handleLanguageChange = async (lng) => {
    try {
      await applyAppLanguage(lng);
      if (user?.id) {
        await api.put(`/users/${user.id}`, { language: lng });
      }
      setShowOptions(false);
    } catch (err) {
      toastError(err);
    }
  };

  const LANGUAGE_OPTIONS = [
    { code: "pt-BR", label: "Português" },
    { code: "en", label: "English" },
    { code: "es", label: "Spanish" },
    { code: "ar", label: "عربي" },
  ];

  const [enabledLanguages, setEnabledLanguages] = useState(["pt-BR", "en"]);
  const { getAll } = useSettings();
  const getAllRef = useRef(getAll);
  getAllRef.current = getAll;
  useEffect(() => {
    let cancelled = false;
    async function fetchSettings() {
      try {
        const settings = await getAllRef.current();
        if (cancelled) return;
        const enabledLanguagesSetting = settings.find(
          (s) => s.key === "enabledLanguages"
        )?.value;
        let langs = ["pt-BR", "en"];
        try {
          if (enabledLanguagesSetting) {
            langs = JSON.parse(enabledLanguagesSetting);
          }
        } catch { }
        setEnabledLanguages((prev) => {
          const next = Array.isArray(langs) ? langs : ["pt-BR", "en"];
          if (prev.length === next.length && prev.every((v, i) => v === next[i])) return prev;
          return next;
        });
      } catch (error) {
        console.log("Layout - erro ao carregar enabledLanguages:", error);
      }
    }
    fetchSettings();
    return () => { cancelled = true; };
  }, [user?.companyId]);

  const filteredLanguageOptions = LANGUAGE_OPTIONS.filter((lang) =>
    enabledLanguages.includes(lang.code)
  );

  /** Mobile: pedidos de "abrir menu" das páginas abrem o menu "Mais". */
  const mobileSetDrawerOpen = useCallback((value) => {
    const next = typeof value === "function" ? value(false) : value;
    setMoreSheetOpen(Boolean(next));
  }, []);

  const drawerContextValue = useMemo(
    () =>
      isMobile
        ? { drawerOpen: true, setDrawerOpen: mobileSetDrawerOpen, sidebarToggleAvailable: false }
        : {
            drawerOpen,
            setDrawerOpen,
            toggleSidebar: toggleDrawer,
            sidebarToggleAvailable: showDesktopSidebar,
            registerHeaderToggle,
            activeHeaderToggleId,
          },
    [
      drawerOpen,
      isMobile,
      mobileSetDrawerOpen,
      toggleDrawer,
      showDesktopSidebar,
      registerHeaderToggle,
      activeHeaderToggleId,
    ]
  );

  if (loading || updateInProgress) {
    return <BackdropLoading />;
  }

  return (
    <DrawerContext.Provider value={drawerContextValue}>
      <div
        className={clsx(classes.root, "logged-in-layout", isMobile && "logged-in-layout--mobile")}
        style={
          showDesktopSidebar
            ? {
                "--vb-sidebar-width": `${sidebarWidth}px`,
                "--vb-sidebar-gap": `${sidebarGap}px`,
              }
            : undefined
        }
      >
      {showDesktopSidebar && (
        <Drawer
          variant={drawerVariant}
          className={classes.sidebarDock}
          classes={{ paper: classes.sidebarPanel }}
          PaperProps={{
            id: "app-sidebar",
            component: "nav",
            "aria-label": "Menu principal",
          }}
          open={drawerOpen}
          onClose={drawerClose}
        >
          <SidebarBrand
            key={`sidebar-logo-${theme.palette.sidebarMenuIsDarkLogo}-${String(sidebarLogoSrc)}`}
            src={sidebarLogoSrc}
            alt={theme.appName || "VBSolution"}
            collapsed={!drawerOpen}
            onError={handleSidebarLogoError}
            action={activeHeaderToggleId === null ? <SidebarToggleButton floating /> : null}
          />
          <List className={classes.sidebarNav} disablePadding component="div">
            <MainListItems
              collapsed={!drawerOpen}
              drawerClose={drawerClose}
              section="main"
              ticketsCount={unreadTicketsCount}
            />
          </List>
          <DesktopSidebarFooter
            collapsed={!drawerOpen}
            user={user}
            profileUrl={profileUrl}
            isDark={theme.mode === "dark"}
            onToggleTheme={colorMode.toggleColorMode}
            onOpenProfile={() => setUserModalOpen(true)}
            onOpenBrainAi={handleOpenBrainAi}
            onLogout={handleLogout}
            onUnreadCountChange={setUnreadTicketsCount}
            helpTopic={appBarHelpTopic || null}
            languageOptions={filteredLanguageOptions}
            onLanguageChange={handleLanguageChange}
          />
        </Drawer>
      )}

      <UserModal
        open={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        onImageUpdate={(newProfileUrl) => setProfileUrl(newProfileUrl)}
        userId={user?.id}
      />

      <VersionControl
        onUpdateStart={handleUpdateStart}
        onUpdateComplete={handleUpdateComplete}
      />

      {user.id && isMobile && (
        <NotificationsPopOver hideTriggerButton onCountChange={setUnreadTicketsCount} />
      )}

      <main
        className={clsx(
          classes.content,
          location.pathname.startsWith("/tickets") && classes.contentTicketsMobile,
          isFixedHeightRoute && classes.contentFixedMobile
        )}
      >
        <div className={classes.appBarSpacer} />
        <TrialCountdown />
        <SubscriptionAlertBanner />
        <div
          className={clsx(classes.pageSlot, isFixedHeightRoute && classes.pageSlotFixed)}
          data-page-slot
        >
          {children ? children : null}
        </div>
        {showBottomNav ? <div className={classes.bottomNavSpacer} aria-hidden /> : null}
      </main>

      {isMobile && !hideMenu ? (
        <>
          <MobileBottomNav
            items={bottomNavItems}
            pathname={pathname}
            moreActive={moreActive}
            onMoreClick={() => setMoreSheetOpen(true)}
            badges={{ tickets: unreadTicketsCount }}
            hidden={!showBottomNav}
            moreLabel={translateUi("Mais")}
          />
          <MobileMoreSheet
            open={moreSheetOpen}
            onClose={() => setMoreSheetOpen(false)}
            sections={moreSections}
            pathname={pathname}
            user={user}
            profileUrl={profileUrl}
            unreadCount={unreadTicketsCount}
            isDark={theme.mode === "dark"}
            onToggleTheme={colorMode.toggleColorMode}
            onLogout={() => {
              setMoreSheetOpen(false);
              handleLogout();
            }}
            onOpenProfile={() => {
              setMoreSheetOpen(false);
              setUserModalOpen(true);
            }}
            t={translateUi}
          />
        </>
      ) : null}

      <TrialExpiredGate />
      <FreeTrialOnboardingTour />

      {/* Modal de Informativos */}
      <Dialog
        open={showAnnouncementsModal}
        onClose={() => setShowAnnouncementsModal(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Informativos</DialogTitle>
        <DialogContent dividers>
          {selectedAnnouncement ? (
            <div>
              <Typography variant="h6" gutterBottom>
                {selectedAnnouncement.title}
              </Typography>
              <Typography variant="body1" style={{ whiteSpace: 'pre-line' }}>
                {selectedAnnouncement.text}
              </Typography>
              <FormControlLabel
                style={{ marginTop: 12 }}
                control={
                  <Checkbox
                    color="primary"
                    checked={ackChecked}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setAckChecked(checked);
                      handleToggleAcknowledge(selectedAnnouncement.id, checked);
                    }}
                  />
                }
                label="Estou ciente e não mostrar novamente"
              />
              {selectedAnnouncement.mediaPath && (
                <div style={{ marginTop: 16 }}>
                  <img
                    src={`${backendUrl}/public/company${user.companyId}${selectedAnnouncement.mediaPath}`}
                    alt="Anexo"
                    style={{ maxWidth: '100%' }}
                  />
                </div>
              )}
              <Button
                onClick={() => setSelectedAnnouncement(null)}
                style={{ marginTop: 16 }}
                variant="outlined"
              >
                Voltar para lista
              </Button>
            </div>
          ) : (
            <List>
              {announcements.map((announcement) => (
                <ListItem
                  button
                  key={announcement.id}
                  onClick={() => setSelectedAnnouncement(announcement)}
                >
                  <ListItemAvatar>
                    <Avatar>
                      <NotificationsIcon />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={announcement.title}
                    secondary={
                      <>
                        <Typography
                          component="span"
                          variant="body2"
                          color="textPrimary"
                        >
                          Prioridade: {announcement.priority === 1 ? 'Alta' : announcement.priority === 2 ? 'Média' : 'Baixa'}
                        </Typography>
                        {` — ${new Date(announcement.createdAt).toLocaleDateString()}`}
                      </>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setShowAnnouncementsModal(false)}
            color="primary"
          >
            Fechar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal de Aniversário */}
      <BirthdayModal
        open={showBirthdayModal}
        onClose={() => setShowBirthdayModal(false)}
        user={user}
      />


    </div>
    </DrawerContext.Provider>
  );
};

export default LoggedInLayout;
