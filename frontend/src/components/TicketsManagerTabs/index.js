import React, { useState, useEffect, useLayoutEffect, useContext, useRef, useMemo, useCallback } from "react";
import { useHistory } from "react-router-dom";
import clsx from "clsx";
import {
  makeStyles,
  Paper,
  Box,
  InputBase,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  Checkbox,
  ListItemText,
} from "@material-ui/core";
import {
  Filter as FunnelIcon,
  EyeOff,
  Eye,
  MailOpen,
  Plus,
  ListFilter,
  Check,
  X,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Hash,
} from "lucide-react";
import SearchRounded from "@mui/icons-material/SearchRounded";
import ManageSearchOutlined from "@mui/icons-material/ManageSearchOutlined";

import TicketsList from "../TicketsListCustom";
import TabPanel from "../TabPanel";
import { TagsFilter } from "../TagsFilter";
import { UsersFilter } from "../UsersFilter";
import { StatusFilter } from "../StatusFilter";
import { WhatsappsFilter } from "../WhatsappsFilter";

import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";
import { QueueSelectedContext } from "../../context/QueuesSelected/QueuesSelectedContext";

import { TicketsContext } from "../../context/Tickets/TicketsContext";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { toast } from "react-toastify";
import BulkActionModal from "../BulkActionModal";
import TicketsContactSearch from "../TicketsContactSearch";
import NewTicketModal from "../NewTicketModal";
import ShowTicketOpen from "../ShowTicketOpenModal";
import TicketListsMenu from "../TicketListsBar";
import useQueues from "../../hooks/useQueues";
import { canUserToggleShowAll, canUserBulkClose } from "../../utils/ticketVisibilityLabel";
import { v4 as uuidv4 } from "uuid";
import { pressableFeedback } from "../../utils/pressableStyles";
import SidebarToggleButton from "../../layout/SidebarToggleButton";

const ACTIVE_TICKET_STATUSES = ["open", "pending", "chatbot", "group", "lgpd"];

const ACCENT = "#3B82F6";
const TOOLBAR_ICON = 19;
const FONT_STACK = '"Helvetica Neue", Helvetica, Arial, sans-serif';

/** Largura do painel (não da viewport): no desktop a lista vive numa coluna de ~280–450px. */
const getHeaderDensity = (width) => {
  if (!width || width >= 450) return "regular";
  if (width >= 370) return "compact";
  return "tight";
};

const useStyles = makeStyles((theme) => {
  const dark = theme.palette.type === "dark";
  const surface = dark ? "rgba(255,255,255,0.06)" : "#ffffff";
  const border = dark ? "rgba(255,255,255,0.12)" : "#E3E8EF";
  const muted = dark ? "rgba(255,255,255,0.6)" : "#64748B";

  return {
    ticketsWrapper: {
      position: "relative",
      display: "flex",
      height: "100%",
      flexDirection: "column",
      overflow: "hidden",
      minWidth: 0,
      maxWidth: "100%",
      width: "100%",
      borderTopRightRadius: 0,
      borderBottomRightRadius: 0,
      backgroundColor: dark ? theme.palette.background.default : "#f8fafc",
      fontFamily: FONT_STACK,
      [theme.breakpoints.down("md")]: {
        border: "none",
      },
    },
    contactSearchPanel: {
      flex: 1,
      minHeight: 0,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
    },

    header: {
      flex: "0 0 auto",
      display: "flex",
      flexDirection: "column",
      gap: 8,
      minWidth: 0,
      padding: "8px 8px 6px",
      [theme.breakpoints.up("md")]: {
        gap: 6,
        padding: "8px 14px 6px",
      },
    },
    headerTight: {
      padding: "6px 6px 6px",
      gap: 6,
      [theme.breakpoints.up("md")]: {
        padding: "6px 10px 6px",
      },
    },
    searchRow: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      minWidth: 0,
    },
    searchPill: {
      flex: "1 1 auto",
      minWidth: 0,
      height: 40,
      boxSizing: "border-box",
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "0 4px 0 12px",
      borderRadius: 999,
      background: surface,
      border: `1px solid ${border}`,
      boxShadow: dark ? "none" : "0 1px 2px rgba(15,23,42,0.04)",
      transition: "border-color 150ms ease",
      "&:focus-within": {
        borderColor: dark ? "rgba(255,255,255,0.28)" : "#BFD3F2",
      },
      "& .MuiIconButton-root": {
        flexShrink: 0,
        width: 32,
        height: 32,
        minHeight: 32,
        padding: "0 !important",
        borderRadius: "50% !important",
        ...pressableFeedback(theme),
      },
      [theme.breakpoints.up("md")]: {
        height: 34,
        padding: "0 3px 0 10px",
        "& .MuiIconButton-root": {
          width: 28,
          height: 28,
          minHeight: 28,
        },
      },
    },
    searchIcon: {
      flexShrink: 0,
      fontSize: 20,
      color: muted,
    },
    searchInput: {
      flex: 1,
      minWidth: 0,
      fontFamily: FONT_STACK,
      fontSize: 14,
      letterSpacing: "-0.01em",
      color: theme.palette.text.primary,
      "& input": {
        padding: 0,
        textOverflow: "ellipsis",
        "&::placeholder": { color: muted, opacity: 1 },
      },
      [theme.breakpoints.down("sm")]: {
        fontSize: 16,
      },
    },
    messageSearchBtn: {
      color: muted,
    },
    messageSearchBtnActive: {
      color: ACCENT,
    },
    filterBtn: {
      position: "relative",
      flex: "0 0 auto",
      width: 40,
      height: 40,
      minHeight: 40,
      padding: "0 !important",
      borderRadius: "50% !important",
      boxSizing: "border-box",
      border: `1px solid ${border}`,
      color: muted,
      ...pressableFeedback(theme, { restBackground: surface }),
      [theme.breakpoints.up("md")]: {
        width: 34,
        height: 34,
        minHeight: 34,
        "& svg": { width: 16, height: 16 },
      },
    },
    // Estado persistente real (painel aberto): precisa vencer o hover "grudado" do touch
    filterBtnActive: {
      borderColor: ACCENT,
      color: "#ffffff",
      "&, &:hover": { backgroundColor: ACCENT },
      "@media (hover: none)": {
        "&:hover": { backgroundColor: ACCENT },
      },
      "&:active": { backgroundColor: "#2563EB" },
    },
    filterDot: {
      position: "absolute",
      top: 7,
      right: 7,
      [theme.breakpoints.up("md")]: {
        top: 5,
        right: 5,
      },
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: ACCENT,
      boxShadow: `0 0 0 2px ${dark ? "#2d2d2d" : "#ffffff"}`,
    },

    filterPanel: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      maxHeight: "min(52dvh, 460px)",
      overflowY: "auto",
      overscrollBehavior: "contain",
      paddingBottom: 8,
      borderBottom: `1px solid ${border}`,
    },
    filterField: {
      "& > div": { padding: "0 !important" },
      "& .MuiOutlinedInput-root": {
        minHeight: 40,
        borderRadius: 12,
        background: surface,
        paddingLeft: "12px !important",
        fontSize: 14,
      },
      "& .MuiOutlinedInput-notchedOutline": {
        borderColor: `${border} !important`,
      },
      "& input::placeholder": { color: muted, opacity: 1 },
      "& .MuiAutocomplete-popupIndicator": { color: muted },
    },
    filterDateRow: {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
      gap: 8,
      "& input": {
        width: "100%",
        minWidth: 0,
        height: 40,
        boxSizing: "border-box",
        padding: "0 10px",
        borderRadius: 12,
        border: `1px solid ${border}`,
        background: surface,
        color: theme.palette.text.primary,
        fontSize: 14,
        fontFamily: "inherit",
      },
    },
    goRow: {
      display: "flex",
      alignItems: "center",
      gap: 8,
    },
    goField: {
      flex: "1 1 auto",
      minWidth: 0,
      height: 40,
      boxSizing: "border-box",
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "0 12px",
      borderRadius: 999,
      border: `1px solid ${border}`,
      background: surface,
      color: muted,
      "& input": {
        flex: 1,
        minWidth: 0,
        border: "none",
        outline: "none",
        background: "transparent",
        fontSize: 14,
        fontFamily: "inherit",
        color: theme.palette.text.primary,
        "&::placeholder": { color: muted, opacity: 1 },
      },
    },
    goBtn: {
      flex: "0 0 auto",
      height: 40,
      minHeight: 40,
      minWidth: 44,
      padding: "0 12px",
      border: "none",
      borderRadius: 12,
      color: muted,
      fontSize: 14,
      fontFamily: "inherit",
      cursor: "pointer",
      ...pressableFeedback(theme, {
        restBackground: dark ? "rgba(255,255,255,0.08)" : "#F1F4F8",
      }),
      "&:disabled": { opacity: 0.6, cursor: "default" },
    },
    clearFilters: {
      alignSelf: "flex-end",
      minHeight: 28,
      border: "none",
      borderRadius: 8,
      color: ACCENT,
      fontSize: 13,
      padding: "2px 6px",
      cursor: "pointer",
      fontFamily: "inherit",
      ...pressableFeedback(theme, { restBackground: "transparent" }),
    },

    toolbar: {
      display: "flex",
      alignItems: "center",
      gap: 2,
      height: 44,
      boxSizing: "border-box",
      padding: "0 6px 0 4px",
      borderRadius: 14,
      border: `1px solid ${border}`,
      background: surface,
      minWidth: 0,
      overflowX: "auto",
      scrollbarWidth: "none",
      "&::-webkit-scrollbar": { display: "none" },
      // Ícones encolhem (até 28px) antes de o botão "Filas" ser cortado
      "& .MuiIconButton-root": {
        flex: "0 1 36px",
        width: 36,
        minWidth: 28,
        height: 36,
        minHeight: 36,
        padding: "0 !important",
        borderRadius: "10px !important",
        color: muted,
        ...pressableFeedback(theme),
      },
      [theme.breakpoints.up("md")]: {
        height: 36,
        borderRadius: 12,
        "& .MuiIconButton-root": {
          flexBasis: 30,
          width: 30,
          height: 30,
          minHeight: 30,
          borderRadius: "8px !important",
        },
        "& .MuiIconButton-root svg": { width: 17, height: 17 },
      },
    },
    toolbarTight: {
      gap: 0,
      "& .MuiIconButton-root": {
        flexBasis: 32,
        width: 32,
        height: 32,
        minHeight: 32,
      },
      [theme.breakpoints.up("md")]: {
        "& .MuiIconButton-root": {
          flexBasis: 28,
          width: 28,
          height: 28,
          minHeight: 28,
        },
      },
    },
    toolbarActive: {
      color: `${ACCENT} !important`,
    },
    toolbarDivider: {
      flexShrink: 0,
      width: 1,
      height: 20,
      margin: "0 3px",
      background: border,
    },
    bulkBtn: {
      flex: "0 0 auto",
      minWidth: 28,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      height: 32,
      boxSizing: "border-box",
      margin: "0 1px",
      padding: "0 7px 0 6px",
      borderRadius: 8,
      border: `1px solid ${border}`,
      background: "transparent",
      color: dark ? "rgba(255,255,255,0.85)" : "#334155",
      fontFamily: "inherit",
      fontSize: 12.5,
      fontWeight: 500,
      whiteSpace: "nowrap",
      cursor: "pointer",
      overflow: "hidden",
      ...pressableFeedback(theme, { restBackground: "transparent" }),
      "& svg": { flexShrink: 0, width: 15, height: 15 },
      "&:disabled": { opacity: 0.45, cursor: "default" },
      [theme.breakpoints.up("md")]: {
        height: 26,
        fontSize: 12,
        padding: "0 8px 0 6px",
        "& svg": { width: 14, height: 14 },
      },
    },
    bulkBtnIconOnly: {
      padding: "0 6px",
      [theme.breakpoints.up("md")]: { padding: "0 5px" },
    },
    bulkBtnLabel: {
      minWidth: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
    },
    queuesPill: {
      marginLeft: "auto",
      flexShrink: 0,
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      height: 32,
      minHeight: 32,
      boxSizing: "border-box",
      minWidth: "max-content",
      marginRight: 2,
      padding: "0 4px 0 10px",
      borderRadius: 999,
      border: `1px solid ${border}`,
      color: muted,
      fontSize: 13,
      whiteSpace: "nowrap",
      fontFamily: "inherit",
      cursor: "pointer",
      ...pressableFeedback(theme, { restBackground: "transparent" }),
      [theme.breakpoints.up("md")]: {
        height: 26,
        minHeight: 26,
        fontSize: 12.5,
        padding: "0 3px 0 9px",
      },
    },
    queuesCount: {
      minWidth: 20,
      height: 20,
      padding: "0 5px",
      borderRadius: 999,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      boxSizing: "border-box",
      background: dark ? "rgba(255,255,255,0.1)" : "#EEF2F6",
      fontSize: 12,
    },

    tabsWrap: {
      flex: "0 0 auto",
      padding: "0 8px 8px",
      minWidth: 0,
      [theme.breakpoints.up("md")]: {
        padding: "0 14px 8px",
      },
    },
    tabsWrapTight: {
      padding: "0 6px 6px",
      [theme.breakpoints.up("md")]: {
        padding: "0 10px 6px",
      },
    },
    tabs: {
      display: "flex",
      alignItems: "stretch",
      gap: 2,
      padding: 3,
      borderRadius: 12,
      background: dark ? "rgba(255,255,255,0.06)" : "#EDF1F6",
      minWidth: 0,
      [theme.breakpoints.up("md")]: {
        padding: 2,
        borderRadius: 10,
      },
    },
    tab: {
      flex: "1 1 auto",
      minWidth: 0,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      height: 34,
      minHeight: 34,
      padding: "0 6px",
      border: "none",
      borderRadius: 9,
      background: "transparent",
      color: muted,
      fontSize: 13,
      fontWeight: 500,
      fontFamily: "inherit",
      letterSpacing: "-0.01em",
      whiteSpace: "nowrap",
      cursor: "pointer",
      ...pressableFeedback(theme, { restBackground: "transparent" }),
      [theme.breakpoints.up("md")]: {
        height: 28,
        minHeight: 28,
        borderRadius: 8,
        fontSize: 12.5,
      },
      "&:focus-visible": {
        outline: `2px solid ${dark ? "rgba(255,255,255,0.55)" : "rgba(15,23,42,0.4)"}`,
        outlineOffset: -2,
      },
    },
    // Aba selecionada é estado real: mantém o fundo mesmo com hover/toque
    tabActive: {
      color: theme.palette.text.primary,
      boxShadow: dark ? "none" : "0 1px 2px rgba(15,23,42,0.1)",
      "&, &:hover, &:active": {
        backgroundColor: dark ? "rgba(255,255,255,0.14)" : "#ffffff",
      },
      "@media (hover: none)": {
        "&:hover": { backgroundColor: dark ? "rgba(255,255,255,0.14)" : "#ffffff" },
      },
    },
    tabLabel: {
      minWidth: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
    },
    tabBadge: {
      flexShrink: 0,
      minWidth: 18,
      height: 18,
      padding: "0 5px",
      borderRadius: 999,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      boxSizing: "border-box",
      fontSize: 11,
      fontWeight: 600,
      lineHeight: 1,
      background: dark ? "rgba(255,255,255,0.12)" : "#E2E8F0",
      color: muted,
      [theme.breakpoints.up("md")]: {
        minWidth: 16,
        height: 16,
        padding: "0 4px",
        fontSize: 10.5,
      },
    },
    tabBadgeActive: {
      background: ACCENT,
      color: "#ffffff",
    },
    tabsCompact: {
      "& $tab": {
        gap: 3,
        padding: "0 3px",
        fontSize: 12,
        letterSpacing: "-0.02em",
      },
      "& $tabBadge": {
        minWidth: 17,
        height: 17,
        padding: "0 4px",
        fontSize: 10.5,
      },
    },
    tabsTight: {
      "& $tab": {
        gap: 2,
        height: 32,
        minHeight: 32,
        padding: "0 2px",
        fontSize: 10.5,
        letterSpacing: "-0.02em",
        [theme.breakpoints.up("md")]: {
          height: 28,
          minHeight: 28,
        },
      },
      "& $tabBadge": {
        minWidth: 15,
        height: 15,
        padding: "0 3px",
        fontSize: 9.5,
      },
    },
  };
});

const TicketsManagerTabs = () => {
  const classes = useStyles();
  const history = useHistory();

  const rootRef = useRef(null);
  const [headerDensity, setHeaderDensity] = useState("regular");
  const isTight = headerDensity === "tight";

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setHeaderDensity(getHeaderDensity(entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /** "Finalizar/Aceitar todos" perdem o rótulo (ficam só com ícone) quando a barra não comporta o texto. */
  const toolbarRef = useRef(null);
  const toolbarWidthRef = useRef(0);
  const [bulkLabelOverflow, setBulkLabelOverflow] = useState(false);
  const bulkIconOnly = isTight || bulkLabelOverflow;

  useEffect(() => {
    const el = toolbarRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      if (width !== toolbarWidthRef.current) {
        toolbarWidthRef.current = width;
        setBulkLabelOverflow(false);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const [searchParam, setSearchParam] = useState("");
  const [tab, setTab] = useState("open");
  const [showAllTickets, setShowAllTickets] = useState(false);
  const [sortTickets, setSortTickets] = useState(false);

  const searchInputRef = useRef();
  const [searchOnMessages, setSearchOnMessages] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [newTicketModalOpen, setNewTicketModalOpen] = useState(false);
  const [newTicketContact, setNewTicketContact] = useState(null);
  const [contactSearchTerm, setContactSearchTerm] = useState("");
  const [openTicketAlert, setOpenTicketAlert] = useState(false);
  const [openTicketAlertUser, setOpenTicketAlertUser] = useState("");
  const [openTicketAlertQueue, setOpenTicketAlertQueue] = useState("");
  const [creatingTicket, setCreatingTicket] = useState(false);

  const { user } = useContext(AuthContext);
  const { findAll: findAllQueues } = useQueues();
  const { profile } = user;
  const { setSelectedQueuesMessage } = useContext(QueueSelectedContext);
  const { tabOpen, setTabOpen, setCurrentTicket } = useContext(TicketsContext);

  useEffect(() => {
    setBulkLabelOverflow(false);
  }, [tabOpen]);

  const [openCount, setOpenCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [groupingCount, setGroupingCount] = useState(0);
  const [closedCount, setClosedCount] = useState(0);

  const updateOpenCount = useCallback((val) => setOpenCount(val), []);
  const updatePendingCount = useCallback((val) => setPendingCount(val), []);
  const updateGroupingCount = useCallback((val) => setGroupingCount(val), []);
  const updateClosedCount = useCallback((val) => setClosedCount(val), []);

  const userQueueIds = Array.isArray(user.queues) ? user.queues.map((q) => q.id) : [];
  const [selectedQueueIds, setSelectedQueueIds] = useState(userQueueIds);
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedTicketListId, setSelectedTicketListId] = useState(null);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [selectedWhatsapp, setSelectedWhatsapp] = useState([]);
  const [forceSearch, setForceSearch] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState([]);
  const [filter, setFilter] = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [filterFormKey, setFilterFormKey] = useState(0);
  const [draftTagIds, setDraftTagIds] = useState([]);
  const [draftUserIds, setDraftUserIds] = useState([]);
  const [draftWhatsappIds, setDraftWhatsappIds] = useState([]);
  const [draftStatusList, setDraftStatusList] = useState([]);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [draftOnlyUnread, setDraftOnlyUnread] = useState(false);
  const [draftDateStart, setDraftDateStart] = useState("");
  const [draftDateEnd, setDraftDateEnd] = useState("");

  const isAdminProfile =
    String(profile || "").toLowerCase() === "admin" || Boolean(user?.super);

  const showAllToggleVisible = canUserToggleShowAll(user);
  const userQueuesCount = Array.isArray(user.queues) ? user.queues.length : 0;

  useLayoutEffect(() => {
    if (bulkLabelOverflow) return;
    const el = toolbarRef.current;
    if (el && el.scrollWidth > el.clientWidth + 1) setBulkLabelOverflow(true);
  }, [bulkLabelOverflow, tabOpen, isTight, showAllToggleVisible, userQueuesCount]);

  const [draftQueueIds, setDraftQueueIds] = useState([]);
  const [draftShowAllTickets, setDraftShowAllTickets] = useState(false);

  const hasActiveFilters = useMemo(
    () =>
      showAllTickets !== showAllToggleVisible ||
      onlyUnread ||
      (dateStart && dateEnd) ||
      selectedTags.length > 0 ||
      selectedUsers.length > 0 ||
      selectedWhatsapp.length > 0 ||
      selectedStatus.length > 0 ||
      selectedTicketListId != null ||
      (selectedQueueIds.length > 0 &&
        selectedQueueIds.length !== userQueueIds.length),
    [showAllTickets, showAllToggleVisible, onlyUnread, dateStart, dateEnd, selectedTags, selectedUsers, selectedWhatsapp, selectedStatus, selectedTicketListId, selectedQueueIds, userQueueIds]
  );

  const hasStructuralFilters = useMemo(
    () =>
      selectedTags.length > 0 ||
      selectedUsers.length > 0 ||
      selectedWhatsapp.length > 0 ||
      selectedStatus.length > 0 ||
      (selectedQueueIds.length > 0 &&
        selectedQueueIds.length !== userQueueIds.length),
    [selectedTags, selectedUsers, selectedWhatsapp, selectedStatus, selectedQueueIds, userQueueIds]
  );

  const resolvedShowAll = showAllToggleVisible ? showAllTickets : false;

  useEffect(() => {
    setSelectedQueuesMessage(selectedQueueIds);
  }, [selectedQueueIds]);

  useEffect(() => {
    if (!filterPanelOpen) return;
    setDraftTagIds([...selectedTags]);
    setDraftUserIds([...selectedUsers]);
    setDraftWhatsappIds([...selectedWhatsapp]);
    setDraftStatusList([...selectedStatus]);
    setDraftQueueIds([...selectedQueueIds]);
    setDraftShowAllTickets(showAllTickets);
    setDraftOnlyUnread(onlyUnread);
    setDraftDateStart(dateStart);
    setDraftDateEnd(dateEnd);
  }, [filterPanelOpen]);

  // Padrão do usuário: quem pode ver outros atendentes começa vendo todos (como o backend já fazia);
  // o botão "olho" alterna para somente os próprios atendimentos + sem responsável.
  useEffect(() => {
    setShowAllTickets(showAllToggleVisible);
    setDraftShowAllTickets(showAllToggleVisible);
  }, [showAllToggleVisible]);

  useEffect(() => {
    if (tab === "search") {
      searchInputRef.current.focus();
    }
    setForceSearch((prev) => !prev);
  }, [tab]);

  // Backfill fotos Instagram/Facebook + WhatsApp API Oficial (CDN/disco efêmero)
  useEffect(() => {
    if (!user?.companyId) return undefined;
    const key = `profilePicBackfill:${user.companyId}`;
    try {
      const last = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - last < 10 * 60 * 1000) return undefined;
      sessionStorage.setItem(key, String(Date.now()));
    } catch {
      /* ignore */
    }
    api
      .post("/contacts/sync-meta-profile-pics", null, { params: { limit: 80 } })
      .catch(() => {});
    api
      .post("/contacts/sync-oficial-profile-pics", null, {
        params: { limit: 80 }
      })
      .catch(() => {});
    return undefined;
  }, [user?.companyId]);

  let searchTimeout;

  const handleSearch = (e) => {
    const searchedTerm = e.target.value;

    clearTimeout(searchTimeout);

    if (searchedTerm === "") {
      setSearchParam("");
      setContactSearchTerm("");
      setForceSearch(!forceSearch);
      setTab("open");
      return;
    }

    if (searchOnMessages) {
      const term = searchedTerm.toLowerCase();
      if (tab !== "search") {
        setTab("search");
      }
      searchTimeout = setTimeout(() => {
        setSearchParam(term);
        setContactSearchTerm("");
        setForceSearch(!forceSearch);
      }, 500);
      return;
    }

    setContactSearchTerm(searchedTerm.trim());
    setSearchParam("");
    setTab("open");
    setTabOpen("open");
  };

  const contactSearchActive =
    !searchOnMessages && contactSearchTerm.length >= 2;

  const navigateToTicket = useCallback(
    (ticket) => {
      if (!ticket?.uuid) return;
      setCurrentTicket({ id: ticket.id, uuid: ticket.uuid, code: uuidv4() });
      setContactSearchTerm("");
      setSearchParam("");
      if (searchInputRef.current) searchInputRef.current.value = "";
      setTabOpen("open");
      history.push(`/tickets/${ticket.uuid}`);
    },
    [history, setCurrentTicket, setTabOpen]
  );

  const resolveAvailableQueues = useCallback(
    (queues) => {
      const fromApi = Array.isArray(queues) ? queues : [];
      const fromUser = Array.isArray(user?.queues) ? user.queues : [];
      if (fromApi.length === 0) return fromUser;
      if (user?.profile === "admin") return fromApi;
      const userQueueIdsSet = new Set(fromUser.map((q) => Number(q.id)));
      if (userQueueIdsSet.size === 0) return fromApi;
      return fromApi.filter((q) => userQueueIdsSet.has(Number(q.id)));
    },
    [user]
  );

  const handleOpenTicketFromSearch = useCallback(
    (ticket) => {
      if (
        ticket?.userId &&
        ticket.userId !== user?.id &&
        ACTIVE_TICKET_STATUSES.includes(ticket.status)
      ) {
        setOpenTicketAlertUser(ticket.user?.name || "Outro usuário");
        setOpenTicketAlertQueue(ticket.queue?.name || "Sem fila");
        setOpenTicketAlert(true);
        return;
      }
      navigateToTicket(ticket);
    },
    [navigateToTicket, user?.id]
  );

  const handleCreateTicketFromContact = async (contact) => {
    if (!contact?.id || creatingTicket) return;

    setCreatingTicket(true);
    try {
      const [queueList, whatsappRes] = await Promise.all([
        findAllQueues(),
        api.get("/whatsapp", { params: { companyId: user.companyId, session: 0 } }),
      ]);

      const availableQueues = resolveAvailableQueues(queueList);
      const whatsapps = Array.isArray(whatsappRes.data) ? whatsappRes.data : [];
      const needsSelection = availableQueues.length > 1 || whatsapps.length > 1;

      if (needsSelection) {
        setNewTicketContact(contact);
        setNewTicketModalOpen(true);
        return;
      }

      const queueId = availableQueues[0]?.id ?? null;
      const whatsappId =
        whatsapps[0]?.id ?? (user.whatsappId != null ? Number(user.whatsappId) : null);

      if (!queueId) {
        setNewTicketContact(contact);
        setNewTicketModalOpen(true);
        return;
      }

      const { data: ticket } = await api.post("/tickets", {
        contactId: contact.id,
        queueId,
        whatsappId,
        userId: user.id,
        status: "open",
      });

      navigateToTicket(ticket);
    } catch (err) {
      if (err.response?.status === 403) {
        const errorData = err.response.data;
        setOpenTicketAlertUser(errorData.ticket?.user?.name || "Outro usuário");
        setOpenTicketAlertQueue(errorData.ticket?.queue?.name || "Sem fila");
        setOpenTicketAlert(true);
        return;
      }

      if (err.response?.status === 409) {
        try {
          const ticket = JSON.parse(err.response.data.error);
          if (ticket.userId !== user?.id && ACTIVE_TICKET_STATUSES.includes(ticket.status)) {
            setOpenTicketAlertUser(ticket?.user?.name || "Outro usuário");
            setOpenTicketAlertQueue(ticket?.queue?.name || "Sem fila");
            setOpenTicketAlert(true);
          } else {
            navigateToTicket(ticket);
          }
        } catch {
          toastError(err);
        }
        return;
      }

      toastError(err);
    } finally {
      setCreatingTicket(false);
    }
  };

  const handleCloseNewTicketModal = (ticket) => {
    setNewTicketModalOpen(false);
    setNewTicketContact(null);
    if (ticket?.uuid) {
      navigateToTicket(ticket);
    }
  };

  const handleBack = () => {
    history.push("/tickets");
  };

  const hiddenStyle = useMemo(() => ({ width: 0, height: 0 }), []);
  const applyPanelStyle = useCallback((status) => {
    if (tabOpen !== status) {
      return hiddenStyle;
    }
    return undefined;
  }, [tabOpen, hiddenStyle]);

  const handleDraftTags = (selecteds) => {
    setDraftTagIds(selecteds.map((t) => t.id));
  };

  const handleDraftUsers = (selecteds) => {
    setDraftUserIds(selecteds.map((t) => t.id));
  };

  const handleDraftWhatsapps = (selecteds) => {
    setDraftWhatsappIds(selecteds.map((t) => t.id));
  };

  const handleDraftStatus = (selecteds) => {
    setDraftStatusList(selecteds.map((t) => t.status));
  };

  const clearAllFilters = () => {
    setSelectedTags([]);
    setSelectedUsers([]);
    setSelectedWhatsapp([]);
    setSelectedStatus([]);
    setSelectedTicketListId(null);
    setSelectedQueueIds(userQueueIds);
    setDraftTagIds([]);
    setDraftUserIds([]);
    setDraftWhatsappIds([]);
    setDraftStatusList([]);
    setDraftQueueIds(userQueueIds);
    setDraftShowAllTickets(showAllToggleVisible);
    setShowAllTickets(showAllToggleVisible);
    setOnlyUnread(false);
    setDraftOnlyUnread(false);
    setDateStart("");
    setDateEnd("");
    setDraftDateStart("");
    setDraftDateEnd("");
    setSearchParam("");
    setContactSearchTerm("");
    setFilter(false);
    setTab("open");
    setForceSearch((f) => !f);
    setFilterFormKey((k) => k + 1);
    if (searchInputRef.current) {
      searchInputRef.current.value = "";
    }
  };

  const applyFiltersFromModal = (closePanel = true) => {
    setSelectedTags([...draftTagIds]);
    setSelectedUsers([...draftUserIds]);
    setSelectedWhatsapp([...draftWhatsappIds]);
    setSelectedStatus([...draftStatusList]);
    setSelectedQueueIds(draftQueueIds.length ? [...draftQueueIds] : userQueueIds);
    setShowAllTickets(draftShowAllTickets);
    setOnlyUnread(draftOnlyUnread);
    setDateStart(draftDateStart && draftDateEnd ? draftDateStart : "");
    setDateEnd(draftDateStart && draftDateEnd ? draftDateEnd : "");

    const hasStructuralFilters =
      draftTagIds.length > 0 ||
      draftUserIds.length > 0 ||
      draftWhatsappIds.length > 0 ||
      draftStatusList.length > 0 ||
      (draftQueueIds.length > 0 &&
        draftQueueIds.length !== userQueueIds.length);

    setFilter(hasStructuralFilters);

    if (hasStructuralFilters || (searchParam && searchParam.trim() !== "")) {
      setTab("search");
    } else if (tab === "search") {
      setTab("open");
    }

    setForceSearch((f) => !f);
    if (closePanel !== false) setFilterPanelOpen(false);
  };

  const draftSignature = JSON.stringify([
    draftTagIds,
    draftUserIds,
    draftWhatsappIds,
    draftStatusList,
    draftQueueIds.length ? draftQueueIds : userQueueIds,
    draftShowAllTickets,
    draftOnlyUnread,
    draftDateStart && draftDateEnd ? [draftDateStart, draftDateEnd] : null,
  ]);
  const appliedSignature = JSON.stringify([
    selectedTags,
    selectedUsers,
    selectedWhatsapp,
    selectedStatus,
    selectedQueueIds,
    showAllTickets,
    onlyUnread,
    dateStart && dateEnd ? [dateStart, dateEnd] : null,
  ]);
  const applyFiltersRef = useRef(applyFiltersFromModal);
  applyFiltersRef.current = applyFiltersFromModal;

  /** Filtros inline aplicam na hora (sem botão "Aplicar"). */
  useEffect(() => {
    if (!filterPanelOpen) return undefined;
    if (draftSignature === appliedSignature) return undefined;
    const timer = setTimeout(() => applyFiltersRef.current(false), 250);
    return () => clearTimeout(timer);
  }, [filterPanelOpen, draftSignature, appliedSignature]);

  const [queuesAnchorEl, setQueuesAnchorEl] = useState(null);
  const [goTicketValue, setGoTicketValue] = useState("");
  const [goTicketLoading, setGoTicketLoading] = useState(false);

  const toggleQueueQuick = (queueId) => {
    const id = Number(queueId);
    const current = selectedQueueIds.map(Number);
    const next = current.includes(id)
      ? current.filter((q) => q !== id)
      : [...current, id];
    if (next.length === 0) return;
    setSelectedQueueIds(next);
    setDraftQueueIds(next);
    setForceSearch((f) => !f);
  };

  const toggleShowAllQuick = () => {
    const next = !showAllTickets;
    setShowAllTickets(next);
    setDraftShowAllTickets(next);
    setForceSearch((f) => !f);
  };

  const toggleOnlyUnreadQuick = () => {
    const next = !onlyUnread;
    setOnlyUnread(next);
    setDraftOnlyUnread(next);
    setForceSearch((f) => !f);
  };

  const handleGoToTicket = async (e) => {
    if (e) e.preventDefault();
    const id = String(goTicketValue || "").replace(/\D/g, "");
    if (!id || goTicketLoading) return;
    setGoTicketLoading(true);
    try {
      const { data } = await api.get(`/tickets/${id}`);
      if (data?.uuid) {
        setGoTicketValue("");
        setFilterPanelOpen(false);
        handleOpenTicketFromSearch(data);
      } else {
        toast.error("Ticket não encontrado.");
      }
    } catch (err) {
      toastError(err);
    } finally {
      setGoTicketLoading(false);
    }
  };

  const handleStatusTabClick = (tabValue) => {
    handleBack();
    setTabOpen(tabValue);

    if (hasStructuralFilters || (searchParam && searchParam.trim() !== "")) {
      setSelectedStatus([tabValue]);
      setDraftStatusList([tabValue]);
      setTab("search");
      setForceSearch((f) => !f);
      return;
    }

    setTab("open");
  };

  const handleBulkAction = async () => {
    setBulkLoading(true);
    try {
      if (bulkAction === "accept") {
        const { data } = await api.post("/tickets/acceptAll", {
          withUnreadMessages: onlyUnread ? "true" : "false",
        });
        toast.success(
          `${data.accepted || 0} atendimento(s) aceito(s)${
            data.skipped ? `, ${data.skipped} ignorado(s)` : ""
          }`
        );
        setForceSearch((f) => !f);
        return data;
      }
      if (bulkAction === "close") {
        const { data } = await api.post("/tickets/closeAll", {
          status: "open",
          queueIds: selectedQueueIds,
          users: selectedUsers,
          tags: selectedTags,
          whatsappIds: selectedWhatsapp,
          showAll: resolvedShowAll ? "true" : "false",
          withUnreadMessages: onlyUnread ? "true" : "false",
          updatedStart: dateStart && dateEnd ? dateStart : undefined,
          updatedEnd: dateStart && dateEnd ? dateEnd : undefined,
          dateStart: dateStart && dateEnd ? dateStart : undefined,
          dateEnd: dateStart && dateEnd ? dateEnd : undefined,
        });
        toast.success(`${data.closed || 0} atendimento(s) finalizado(s)`);
        if ((data.closed || 0) === 0) {
          toast.warning("Nenhum atendimento foi finalizado. Atualize a lista ou finalize individualmente.");
        }
        setTabOpen("closed");
        setForceSearch((f) => !f);
        return data;
      }
      return {};
    } catch (err) {
      toastError(err);
      throw err;
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkModalClose = (success) => {
    setBulkConfirmOpen(false);
    setBulkAction(null);
    if (!success) setBulkLoading(false);
  };

  const openBulkConfirm = (action) => {
    setBulkAction(action);
    setBulkConfirmOpen(true);
  };

  const ticketListIds = useMemo(
    () => (selectedTicketListId != null ? [selectedTicketListId] : []),
    [selectedTicketListId]
  );

  const listFilterProps = {
    onlyUnread,
    dateStart: dateStart && dateEnd ? dateStart : "",
    dateEnd: dateStart && dateEnd ? dateEnd : "",
    forceSearch,
    ticketListIds,
  };

  /** Nomenclatura da fila (status internos continuam open/pending/group/closed). */
  const statusTabs = [
    {
      value: "open",
      title: i18n.t("ticketsList.mobileTabs.open", { defaultValue: "Atendimento" }),
      count: openCount || 0,
    },
    { value: "pending", title: i18n.t("ticketsList.pendingHeader"), count: pendingCount || 0 },
    ...(user.allowGroup
      ? [{ value: "group", title: i18n.t("ticketsList.groupingHeader"), count: groupingCount || 0 }]
      : []),
    {
      value: "closed",
      title: i18n.t("ticketsList.mobileTabs.closed", { defaultValue: "Resolvidos" }),
      count: closedCount || 0,
    },
  ];
  const messageSearchToggleEl = (
    <Tooltip placement="top" title="Buscar no conteúdo das mensagens">
      <IconButton
        size="small"
        aria-label="Buscar em mensagens"
        aria-pressed={searchOnMessages}
        className={clsx(
          classes.messageSearchBtn,
          searchOnMessages && classes.messageSearchBtnActive
        )}
        onClick={() => {
          setSearchOnMessages((v) => {
            if (!v) {
              setContactSearchTerm("");
              if (searchInputRef.current) searchInputRef.current.value = "";
            }
            return !v;
          });
        }}
      >
        <ManageSearchOutlined fontSize="small" />
      </IconButton>
    </Tooltip>
  );

  return (
    <Paper
      ref={rootRef}
      elevation={0}
      variant="outlined"
      className={classes.ticketsWrapper}
    >
      <div className={clsx(classes.header, isTight && classes.headerTight)}>
        <div className={classes.searchRow}>
          <SidebarToggleButton />
          <div className={classes.searchPill}>
            <SearchRounded className={classes.searchIcon} />
            <InputBase
              className={classes.searchInput}
              inputRef={searchInputRef}
              placeholder="Buscar atendimento e mensagens"
              type="search"
              onChange={handleSearch}
            />
            {messageSearchToggleEl}
          </div>
          <Tooltip title="Filtros">
            <IconButton
              aria-label="Filtros"
              aria-expanded={filterPanelOpen}
              aria-pressed={filterPanelOpen}
              className={clsx(classes.filterBtn, filterPanelOpen && classes.filterBtnActive)}
              onClick={() => setFilterPanelOpen((open) => !open)}
            >
              <FunnelIcon size={18} strokeWidth={1.9} />
              {hasActiveFilters && !filterPanelOpen ? (
                <span className={classes.filterDot} aria-hidden />
              ) : null}
            </IconButton>
          </Tooltip>
        </div>

        {filterPanelOpen && (
          <div className={classes.filterPanel} role="region" aria-label="Filtros">
            <div className={classes.filterField} key={`f-tags-${filterFormKey}`}>
              <TagsFilter
                compact
                deferNotify
                placeholder="Etiquetas"
                selectedIds={draftTagIds}
                onFiltered={handleDraftTags}
              />
            </div>
            <div className={classes.filterField} key={`f-wa-${filterFormKey}`}>
              <WhatsappsFilter
                compact
                deferNotify
                placeholder="Conexões"
                selectedIds={draftWhatsappIds}
                onFiltered={handleDraftWhatsapps}
              />
            </div>
            {isAdminProfile && (
              <div className={classes.filterField} key={`f-users-${filterFormKey}`}>
                <UsersFilter
                  compact
                  deferNotify
                  placeholder="Atendentes"
                  selectedIds={draftUserIds}
                  onFiltered={handleDraftUsers}
                />
              </div>
            )}
            <div className={classes.filterField} key={`f-status-${filterFormKey}`}>
              <StatusFilter
                compact
                deferNotify
                selectedStatuses={draftStatusList}
                onFiltered={handleDraftStatus}
              />
            </div>
            <div className={classes.filterDateRow}>
              <input
                type="date"
                aria-label="Data inicial"
                value={draftDateStart}
                onChange={(e) => setDraftDateStart(e.target.value)}
              />
              <input
                type="date"
                aria-label="Data final"
                value={draftDateEnd}
                onChange={(e) => setDraftDateEnd(e.target.value)}
              />
            </div>
            <form className={classes.goRow} onSubmit={handleGoToTicket}>
              <label className={classes.goField}>
                <Hash size={16} />
                <input
                  inputMode="numeric"
                  placeholder="Ir para ticket..."
                  aria-label="Número do ticket"
                  value={goTicketValue}
                  onChange={(e) => setGoTicketValue(e.target.value)}
                />
              </label>
              <button
                type="submit"
                className={classes.goBtn}
                disabled={goTicketLoading || !goTicketValue.trim()}
              >
                Ir
              </button>
            </form>
            {hasActiveFilters && (
              <button
                type="button"
                className={classes.clearFilters}
                onClick={() => {
                  clearAllFilters();
                  setFilterPanelOpen(false);
                }}
              >
                Limpar filtros
              </button>
            )}
          </div>
        )}

        <div ref={toolbarRef} className={clsx(classes.toolbar, isTight && classes.toolbarTight)}>
          {showAllToggleVisible && (
            <Tooltip title={showAllTickets ? "Ocultar outros usuários" : "Ver outros usuários"}>
              <IconButton
                aria-label="Outros usuários"
                aria-pressed={showAllTickets}
                className={clsx(showAllTickets && classes.toolbarActive)}
                onClick={toggleShowAllQuick}
              >
                {showAllTickets ? <Eye size={TOOLBAR_ICON} /> : <EyeOff size={TOOLBAR_ICON} />}
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Somente não lidos">
            <IconButton
              aria-label="Somente não lidos"
              aria-pressed={onlyUnread}
              className={clsx(onlyUnread && classes.toolbarActive)}
              onClick={toggleOnlyUnreadQuick}
            >
              <MailOpen size={TOOLBAR_ICON} />
            </IconButton>
          </Tooltip>
          <span className={classes.toolbarDivider} aria-hidden />
          <Tooltip title="Novo atendimento">
            <IconButton
              aria-label="Novo atendimento"
              onClick={() => {
                setNewTicketContact(null);
                setNewTicketModalOpen(true);
              }}
            >
              <Plus size={TOOLBAR_ICON} />
            </IconButton>
          </Tooltip>
          <TicketListsMenu
            selectedListId={selectedTicketListId}
            onChange={(listId) => {
              setSelectedTicketListId(listId);
              setForceSearch((f) => !f);
            }}
            activeClassName={classes.toolbarActive}
            icon={<ListFilter size={TOOLBAR_ICON} />}
          />
          {tabOpen === "pending" && (
            <Tooltip title="Aceitar todos os atendimentos aguardando">
              <span style={{ display: "inline-flex", flexShrink: 0 }}>
                <button
                  type="button"
                  aria-label="Aceitar todos"
                  className={clsx(classes.bulkBtn, bulkIconOnly && classes.bulkBtnIconOnly)}
                  disabled={bulkLoading || pendingCount === 0}
                  onClick={() => openBulkConfirm("accept")}
                >
                  <Check color="#16A34A" />
                  {!bulkIconOnly && <span className={classes.bulkBtnLabel}>Aceitar todos</span>}
                </button>
              </span>
            </Tooltip>
          )}
          {tabOpen === "open" && canUserBulkClose(user) && (
            <Tooltip title="Finalizar todos os atendimentos desta visão">
              <span style={{ display: "inline-flex", flexShrink: 0 }}>
                <button
                  type="button"
                  aria-label="Finalizar todos"
                  className={clsx(classes.bulkBtn, bulkIconOnly && classes.bulkBtnIconOnly)}
                  disabled={bulkLoading || openCount === 0}
                  onClick={() => openBulkConfirm("close")}
                >
                  <X color="#DC2626" />
                  {!bulkIconOnly && <span className={classes.bulkBtnLabel}>Finalizar todos</span>}
                </button>
              </span>
            </Tooltip>
          )}
          <span className={classes.toolbarDivider} aria-hidden />
          <Tooltip title={sortTickets ? "Mais antigos primeiro" : "Mais recentes primeiro"}>
            <IconButton
              aria-label="Ordenar"
              aria-pressed={sortTickets}
              onClick={() => setSortTickets((v) => !v)}
            >
              {sortTickets ? (
                <ArrowUpNarrowWide size={TOOLBAR_ICON} />
              ) : (
                <ArrowDownWideNarrow size={TOOLBAR_ICON} />
              )}
            </IconButton>
          </Tooltip>
          {Array.isArray(user.queues) && user.queues.length > 0 && (
            <button
              type="button"
              className={classes.queuesPill}
              aria-haspopup="menu"
              onClick={(e) => setQueuesAnchorEl(e.currentTarget)}
            >
              Filas
              <span className={classes.queuesCount}>{selectedQueueIds.length}</span>
            </button>
          )}
        </div>
        <Menu
          anchorEl={queuesAnchorEl}
          open={Boolean(queuesAnchorEl)}
          onClose={() => setQueuesAnchorEl(null)}
          getContentAnchorEl={null}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
        >
          {(user.queues || []).map((q) => {
            const checked = selectedQueueIds.map(Number).includes(Number(q.id));
            return (
              <MenuItem key={q.id} onClick={() => toggleQueueQuick(q.id)}>
                <Checkbox
                  size="small"
                  color="primary"
                  checked={checked}
                  style={{ padding: 4, marginRight: 8 }}
                />
                <ListItemText primary={q.name} />
              </MenuItem>
            );
          })}
        </Menu>
      </div>

      <div className={clsx(classes.tabsWrap, isTight && classes.tabsWrapTight)}>
        <div
          className={clsx(
            classes.tabs,
            headerDensity === "compact" && classes.tabsCompact,
            isTight && classes.tabsTight
          )}
          role="tablist"
        >
          {statusTabs.map((st) => {
            const active = tabOpen === st.value;
            const showBadge = st.value !== "closed" && st.count > 0;
            return (
              <button
                key={st.value}
                type="button"
                role="tab"
                aria-selected={active}
                title={st.title}
                className={clsx(classes.tab, active && classes.tabActive)}
                onClick={() => handleStatusTabClick(st.value)}
              >
                <span className={classes.tabLabel}>{st.title}</span>
                {showBadge ? (
                  <span className={clsx(classes.tabBadge, active && classes.tabBadgeActive)}>
                    {st.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <BulkActionModal
        open={bulkConfirmOpen}
        action={bulkAction}
        totalEstimate={bulkAction === "accept" ? pendingCount : openCount}
        onClose={handleBulkModalClose}
        onConfirm={handleBulkAction}
      />

      <NewTicketModal
        modalOpen={newTicketModalOpen}
        onClose={handleCloseNewTicketModal}
        initialContact={newTicketContact || undefined}
      />

      <ShowTicketOpen
        isOpen={openTicketAlert}
        handleClose={() => {
          setOpenTicketAlert(false);
          setOpenTicketAlertUser("");
          setOpenTicketAlertQueue("");
        }}
        user={openTicketAlertUser}
        queue={openTicketAlertQueue}
      />

      <TabPanel value={tab} name="open" className={classes.ticketsWrapper}>
        <Paper className={classes.ticketsWrapper}>
          {contactSearchActive ? (
            <Box className={classes.contactSearchPanel}>
              <TicketsContactSearch
                searchTerm={contactSearchTerm}
                queueIds={selectedQueueIds}
                onCreateTicket={handleCreateTicketFromContact}
                onOpenTicket={handleOpenTicketFromSearch}
              />
            </Box>
          ) : (
            <>
          <TicketsList
            status="open"
            showAll={resolvedShowAll}
            sortTickets={sortTickets ? "ASC" : "DESC"}
            selectedQueueIds={selectedQueueIds}
            updateCount={updateOpenCount}
            style={applyPanelStyle("open")}
            setTabOpen={setTabOpen}
            {...listFilterProps}
          />
          <TicketsList
            status="pending"
            selectedQueueIds={selectedQueueIds}
            sortTickets={sortTickets ? "ASC" : "DESC"}
            showAll={resolvedShowAll}
            updateCount={updatePendingCount}
            style={applyPanelStyle("pending")}
            setTabOpen={setTabOpen}
            {...listFilterProps}
          />
          {user.allowGroup && (
            <TicketsList
              status="group"
              showAll={resolvedShowAll}
              sortTickets={sortTickets ? "ASC" : "DESC"}
              selectedQueueIds={selectedQueueIds}
              updateCount={updateGroupingCount}
              style={applyPanelStyle("group")}
              setTabOpen={setTabOpen}
              {...listFilterProps}
            />
          )}
          <TicketsList
            status="closed"
            showAll={resolvedShowAll}
            sortTickets={sortTickets ? "ASC" : "DESC"}
            selectedQueueIds={selectedQueueIds}
            updateCount={updateClosedCount}
            style={applyPanelStyle("closed")}
            setTabOpen={setTabOpen}
            {...listFilterProps}
          />
            </>
          )}
        </Paper>
      </TabPanel>

      <TabPanel value={tab} name="search" className={classes.ticketsWrapper}>
        <TicketsList
          statusFilter={selectedStatus}
          searchParam={searchParam}
          showAll={resolvedShowAll}
          tags={selectedTags}
          users={isAdminProfile ? selectedUsers : []}
          selectedQueueIds={selectedQueueIds}
          whatsappIds={selectedWhatsapp}
          forceSearch={forceSearch}
          searchOnMessages={searchOnMessages}
          status="search"
          {...listFilterProps}
        />
      </TabPanel>
    </Paper >
  );
};

export default TicketsManagerTabs;
