import React, { useState, useEffect } from "react";
import {
  makeStyles,
  Paper,
  TableHead,
  TableBody,
  TableCell,
  TableRow,
  IconButton,
  Button,
  InputBase,
  useMediaQuery,
} from "@material-ui/core";
import Table from "../ResponsiveTable";
import { useTheme } from "@material-ui/core/styles";
import ConfirmationModal from "../ConfirmationModal";
import PlanModal, { normalizeAmount } from "./PlanModal";
import {
  Edit as EditIcon,
  Search as SearchIcon,
  Add as AddIcon,
} from "@material-ui/icons";
import { toast } from "react-toastify";
import usePlans from "../../hooks/usePlans";
import { i18n } from "../../translate/i18n";

const useStyles = makeStyles((theme) => {
  const isDark = theme.palette.type === "dark";
  const border = isDark ? "rgba(255,255,255,0.08)" : "#eaedf0";
  const surfaceBg = isDark ? "rgba(255,255,255,0.03)" : "#ffffff";
  const hoverBg = isDark ? "rgba(255,255,255,0.05)" : "#f8f9fb";
  const font = '"Helvetica Neue", Helvetica, Arial, sans-serif';

  return {
    root: { width: "100%", fontFamily: font },
    mainPaper: { width: "100%", flex: 1, background: "transparent", boxShadow: "none" },

    /* ── Top bar (same as CompaniesManager) ── */
    topBar: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      marginBottom: 12,
      flexWrap: "wrap",
      [theme.breakpoints.down("xs")]: {
        flexDirection: "column",
        alignItems: "stretch",
        gap: 8,
      },
    },
    filterGroup: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      flexWrap: "wrap",
    },
    searchBox: {
      display: "flex",
      alignItems: "center",
      gap: 5,
      borderRadius: 7,
      background: isDark ? "rgba(255,255,255,0.06)" : "#f3f4f6",
      padding: "3px 8px",
      minWidth: 160,
      height: 30,
      flex: 1,
      maxWidth: 220,
      [theme.breakpoints.down("xs")]: { maxWidth: "100%", minWidth: 0 },
    },
    searchInput: {
      fontSize: 11.5,
      color: theme.palette.text.primary,
      flex: 1,
      "& input": { padding: 0, fontSize: 11.5 },
      "& input::placeholder": { color: isDark ? "rgba(255,255,255,0.35)" : "#9ca3af", opacity: 1 },
    },
    actionsGroup: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      [theme.breakpoints.down("xs")]: { justifyContent: "flex-end" },
    },
    addBtn: {
      height: 28,
      borderRadius: 7,
      textTransform: "none",
      fontSize: 11,
      fontWeight: 600,
      padding: "0 12px",
      boxShadow: "none",
      "&:hover": { boxShadow: "none" },
    },

    /* ── Table ── */
    tableWrap: {
      borderRadius: 10,
      border: `1px solid ${border}`,
      background: surfaceBg,
      overflowX: "auto",
      "&::-webkit-scrollbar": { height: 4 },
      "&::-webkit-scrollbar-thumb": {
        background: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)",
        borderRadius: 4,
      },
    },
    table: {
      minWidth: 900,
      "& .MuiTableCell-head": {
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)",
        borderBottom: `1px solid ${border}`,
        padding: "6px 10px",
        whiteSpace: "nowrap",
        fontFamily: font,
        background: isDark ? "rgba(255,255,255,0.02)" : "#fafbfc",
      },
      "& .MuiTableCell-body": {
        fontSize: 12,
        color: theme.palette.text.primary,
        borderBottom: `1px solid ${border}`,
        padding: "6px 10px",
        fontFamily: font,
      },
    },
    tableRow: {
      cursor: "pointer",
      transition: "background 0.12s",
      "&:hover": { background: hoverBg },
    },
    editIcon: {
      fontSize: 14,
      color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.25)",
    },

    /* ── Tags ── */
    tag: {
      display: "inline-flex",
      alignItems: "center",
      height: 18,
      borderRadius: 5,
      padding: "0 6px",
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: "0.02em",
      lineHeight: 1,
      whiteSpace: "nowrap",
      fontFamily: font,
    },
    tagYes: {
      background: isDark ? "rgba(16,185,129,0.15)" : "#ecfdf5",
      color: isDark ? "#6ee7b7" : "#059669",
    },
    tagNo: {
      background: isDark ? "rgba(239,68,68,0.15)" : "#fef2f2",
      color: isDark ? "#fca5a5" : "#dc2626",
    },
    tagNeutral: {
      background: isDark ? "rgba(255,255,255,0.06)" : "#f3f4f6",
      color: isDark ? "rgba(255,255,255,0.5)" : "#6b7280",
    },

    /* ── Mobile cards ── */
    cardList: { display: "flex", flexDirection: "column", gap: 8 },
    card: {
      borderRadius: 10,
      border: `1px solid ${border}`,
      background: surfaceBg,
      padding: "10px 12px",
      cursor: "pointer",
      transition: "background 0.12s",
      "&:active": { background: hoverBg },
    },
    cardHeader: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 6,
    },
    cardName: {
      fontSize: 13,
      fontWeight: 600,
      color: theme.palette.text.primary,
      flex: 1,
    },
    cardRow: {
      display: "flex",
      alignItems: "center",
      gap: 5,
      flexWrap: "wrap",
    },
    cardMeta: {
      fontSize: 10.5,
      color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)",
    },
  };
});

function BoolTag({ value, classes }) {
  return value === false
    ? <span className={`${classes.tag} ${classes.tagNo}`}>{i18n.t("plans.form.no")}</span>
    : <span className={`${classes.tag} ${classes.tagYes}`}>{i18n.t("plans.form.yes")}</span>;
}

const formatMoney = (value) =>
  parseFloat(normalizeAmount(value)).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PLAN_ERRORS = {
  ERR_PLAN_NAME_ALREADY_EXISTS: "Já existe um plano com este nome.",
  ERR_PLAN_INVALID_NAME: "Nome do plano inválido (mínimo 2 caracteres).",
  ERR_NO_PERMISSION: "Somente a conta admin pode gerenciar planos.",
  ERR_PLAN_IN_USE: "Este plano está vinculado a uma empresa e não pode ser excluído.",
};

export { PlanModal };
// Keep old export name for backward compat
export const PlanManagerForm = PlanModal;

/* ══════════════════════════════════════════════════════════
   Mobile Card
   ══════════════════════════════════════════════════════════ */
function PlanCard({ row, classes, onSelect }) {
  return (
    <div className={classes.card} onClick={() => onSelect(row)}>
      <div className={classes.cardHeader}>
        <span className={classes.cardName}>{row.name || "—"}</span>
        <span className={`${classes.tag} ${classes.tagNeutral}`}>
          R$ {formatMoney(row.amount)}
        </span>
      </div>
      <div className={classes.cardRow}>
        <span className={classes.cardMeta}>{row.users || 0} usr</span>
        <span className={classes.cardMeta}>{row.connections || 0} cnx</span>
        <span className={classes.cardMeta}>{row.queues || 0} filas</span>
        {row.trial && <span className={`${classes.tag} ${classes.tagYes}`}>Trial {row.trialDays}d</span>}
        <BoolTag value={row.isPublic} classes={classes} />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Table Grid
   ══════════════════════════════════════════════════════════ */
export function PlansManagerGrid(props) {
  const { records, onSelect } = props;
  const classes = useStyles();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("xs"));

  if (isMobile) {
    return (
      <div className={classes.cardList}>
        {records.map((row) => (
          <PlanCard key={row.id} row={row} classes={classes} onSelect={onSelect} />
        ))}
        {records.length === 0 && (
          <div style={{ textAlign: "center", padding: 24, opacity: 0.5, fontSize: 12 }}>
            Nenhum plano encontrado.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={classes.tableWrap}>
      <Table className={classes.table} padding="none" aria-label="plans table">
        <TableHead>
          <TableRow>
            <TableCell style={{ width: 36 }}></TableCell>
            <TableCell align="left">Nome</TableCell>
            <TableCell align="center">Usuários</TableCell>
            <TableCell align="center">Conexões</TableCell>
            <TableCell align="center">Filas</TableCell>
            <TableCell align="center">Valor</TableCell>
            <TableCell align="center">Público</TableCell>
            <TableCell align="center">Trial</TableCell>
            <TableCell align="center">WhatsApp</TableCell>
            <TableCell align="center">WA Oficial</TableCell>
            <TableCell align="center">Facebook</TableCell>
            <TableCell align="center">Instagram</TableCell>
            <TableCell align="center">{i18n.t("plans.form.campaigns")}</TableCell>
            <TableCell align="center">{i18n.t("plans.form.schedules")}</TableCell>
            <TableCell align="center">Chat Int.</TableCell>
            <TableCell align="center">API Ext.</TableCell>
            <TableCell align="center">Kanban</TableCell>
            <TableCell align="center">Talk.Ai</TableCell>
            <TableCell align="center">Integrações</TableCell>
            <TableCell align="center">Wavoip</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {records.map((row) => (
            <TableRow key={row.id} className={classes.tableRow} onClick={() => onSelect(row)}>
              <TableCell align="center" style={{ width: 36 }}>
                <IconButton size="small" style={{ padding: 3 }}>
                  <EditIcon className={classes.editIcon} />
                </IconButton>
              </TableCell>
              <TableCell align="left" style={{ fontWeight: 500 }}>{row.name || "—"}</TableCell>
              <TableCell align="center">{row.users || "—"}</TableCell>
              <TableCell align="center">{row.connections || "—"}</TableCell>
              <TableCell align="center">{row.queues || "—"}</TableCell>
              <TableCell align="center" style={{ whiteSpace: "nowrap" }}>
                R$ {formatMoney(row.amount)}
              </TableCell>
              <TableCell align="center"><BoolTag value={row.isPublic} classes={classes} /></TableCell>
              <TableCell align="center">
                {row.trial
                  ? <span className={`${classes.tag} ${classes.tagYes}`}>{row.trialDays}d</span>
                  : <span className={`${classes.tag} ${classes.tagNeutral}`}>—</span>}
              </TableCell>
              <TableCell align="center"><BoolTag value={row.useWhatsapp} classes={classes} /></TableCell>
              <TableCell align="center"><BoolTag value={row.useWhatsappOfficial} classes={classes} /></TableCell>
              <TableCell align="center"><BoolTag value={row.useFacebook} classes={classes} /></TableCell>
              <TableCell align="center"><BoolTag value={row.useInstagram} classes={classes} /></TableCell>
              <TableCell align="center"><BoolTag value={row.useCampaigns} classes={classes} /></TableCell>
              <TableCell align="center"><BoolTag value={row.useSchedules} classes={classes} /></TableCell>
              <TableCell align="center"><BoolTag value={row.useInternalChat} classes={classes} /></TableCell>
              <TableCell align="center"><BoolTag value={row.useExternalApi} classes={classes} /></TableCell>
              <TableCell align="center"><BoolTag value={row.useKanban} classes={classes} /></TableCell>
              <TableCell align="center"><BoolTag value={row.useOpenAi} classes={classes} /></TableCell>
              <TableCell align="center"><BoolTag value={row.useIntegrations} classes={classes} /></TableCell>
              <TableCell align="center"><BoolTag value={row.wavoip} classes={classes} /></TableCell>
            </TableRow>
          ))}
          {records.length === 0 && (
            <TableRow>
              <TableCell colSpan={20} align="center" style={{ padding: 28, opacity: 0.5, fontSize: 12 }}>
                Nenhum plano encontrado.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Main Component
   ══════════════════════════════════════════════════════════ */
export default function PlansManager() {
  const classes = useStyles();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("xs"));
  const { list, save, update, remove } = usePlans();

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    setLoading(true);
    try {
      const planList = await list();
      setRecords(Array.isArray(planList) ? [...planList] : []);
    } catch {
      toast.error("Não foi possível carregar a lista de planos");
    }
    setLoading(false);
  };

  const handleSubmit = async (data) => {
    setLoading(true);
    const isEdit = data.id !== undefined && data.id !== null;
    try {
      if (isEdit) {
        await update(data);
      } else {
        await save(data);
      }
      await loadPlans();
      setModalOpen(false);
      setSelectedPlan(null);
      toast.success(isEdit ? "Plano atualizado com sucesso!" : "Plano criado com sucesso!");
    } catch (err) {
      const code = err?.response?.data?.error || err?.response?.data?.message;
      toast.error(PLAN_ERRORS[code] || "Erro ao salvar o plano. Tente novamente.");
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!selectedPlan?.id) return;
    setLoading(true);
    try {
      await remove(selectedPlan.id);
      await loadPlans();
      setShowConfirmDialog(false);
      setModalOpen(false);
      setSelectedPlan(null);
      toast.success("Plano removido com sucesso!");
    } catch (err) {
      const code = err?.response?.data?.error || err?.response?.data?.message;
      toast.error(PLAN_ERRORS[code] || "Não foi possível remover o plano");
    }
    setLoading(false);
  };

  const handleSelect = (data) => {
    setSelectedPlan(data);
    setModalOpen(true);
  };

  const handleAdd = () => {
    setSelectedPlan(null);
    setModalOpen(true);
  };

  const handleDeleteRequest = (plan) => {
    setSelectedPlan(plan);
    setShowConfirmDialog(true);
  };

  const filteredRecords = searchText.trim()
    ? records.filter((r) => (r.name || "").toLowerCase().includes(searchText.toLowerCase()))
    : records;

  return (
    <Paper className={classes.mainPaper} elevation={0}>
      {/* ── Top Bar ── */}
      <div className={classes.topBar}>
        <div className={classes.filterGroup}>
          <div className={classes.searchBox}>
            <SearchIcon style={{ fontSize: 14, opacity: 0.4 }} />
            <InputBase
              placeholder="Buscar plano..."
              className={classes.searchInput}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
        </div>
        <div className={classes.actionsGroup}>
          <Button
            variant="contained"
            color="primary"
            className={classes.addBtn}
            onClick={handleAdd}
            startIcon={!isMobile ? <AddIcon style={{ fontSize: 13 }} /> : undefined}
          >
            {isMobile ? <AddIcon style={{ fontSize: 16 }} /> : "Novo Plano"}
          </Button>
        </div>
      </div>

      {/* ── Modal ── */}
      <PlanModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setSelectedPlan(null); }}
        plan={selectedPlan}
        onSave={handleSubmit}
        onDelete={handleDeleteRequest}
        loading={loading}
      />

      {/* ── Table / Cards ── */}
      <PlansManagerGrid records={filteredRecords} onSelect={handleSelect} />

      <ConfirmationModal
        title="Exclusão de Plano"
        open={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        onConfirm={() => handleDelete()}
      >
        Deseja realmente excluir este plano?
      </ConfirmationModal>
    </Paper>
  );
}
