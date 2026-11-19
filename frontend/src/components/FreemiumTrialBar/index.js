import React, { useContext, useMemo, useState, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  useMediaQuery,
  Tooltip
} from "@material-ui/core";
import { makeStyles, useTheme } from "@material-ui/core/styles";
import moment from "moment";
import { AuthContext } from "../../context/Auth/AuthContext";
import {
  brtCalendarDaysRemaining,
  msUntilEndOfDueDayBrt,
  splitCountdownMs
} from "../../utils/brasiliaTrial";

const useStyles = makeStyles((theme) => ({
  "@keyframes freemiumGlassPulse": {
    "0%, 100%": {
      boxShadow:
        "inset 0 1px 0 rgba(255,255,255,0.35), 0 0 0 1px rgba(255,255,255,0.22), 0 0 24px rgba(255,255,255,0.12), 0 8px 28px rgba(0,0,0,0.1)"
    },
    "50%": {
      boxShadow:
        "inset 0 1px 0 rgba(255,255,255,0.5), 0 0 0 1px rgba(255,255,255,0.32), 0 0 32px rgba(255,255,255,0.2), 0 10px 36px rgba(0,0,0,0.14)"
    }
  },
  topbarPillOuter: {
    flexShrink: 0,
    marginRight: 6,
    marginLeft: 0,
    border: "none",
    cursor: "pointer",
    borderRadius: 6,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px 12px",
    minWidth: 0,
    maxWidth: 320,
    lineHeight: 1,
    background:
      "linear-gradient(155deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.12) 48%, rgba(255,255,255,0.2) 100%)",
    backdropFilter: "saturate(200%) blur(14px)",
    WebkitBackdropFilter: "saturate(200%) blur(14px)",
    color: "rgba(255, 255, 255, 0.98)",
    transition: "background 0.15s ease, box-shadow 0.15s ease",
    fontFamily:
      '"Inter", "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    "&:hover": {
      background:
        "linear-gradient(155deg, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.28) 100%)"
    },
    "&:focus": {
      outline: "none",
      boxShadow: "0 0 0 2px rgba(255,255,255,0.65), 0 0 20px rgba(255,255,255,0.25)"
    },
    [theme.breakpoints.down("xs")]: {
      minWidth: 0,
      maxWidth: "min(94vw, 320px)",
      padding: "5px 10px",
      borderRadius: 9
    }
  },
  sidebarCard: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 10,
    cursor: "pointer",
    border: `1px solid ${theme.palette.type === "dark" ? "rgba(255,255,255,0.12)" : "#E4E4E7"}`,
    background: theme.palette.type === "dark" ? "rgba(255,255,255,0.04)" : "#FAFAFA",
    color: theme.palette.type === "dark" ? "#E4E4E7" : "#27272A",
    fontFamily: "inherit",
    "&:hover": {
      background: theme.palette.type === "dark" ? "rgba(255,255,255,0.08)" : "#F4F4F5",
    },
  },
  sidebarCardLabel: {
    fontSize: 12,
    fontWeight: 500,
    whiteSpace: "nowrap",
  },
  sidebarCardTime: {
    fontSize: 12,
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  topbarPillRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "nowrap",
    gap: 8,
    lineHeight: 1,
    margin: 0,
    padding: 0,
    width: "100%",
    [theme.breakpoints.down("xs")]: {
      gap: 5
    }
  },
  topbarLabel: {
    fontSize: "0.6875rem",
    fontWeight: 500,
    letterSpacing: "0.04em",
    lineHeight: 1,
    margin: 0,
    padding: 0,
    color: "inherit",
    whiteSpace: "nowrap",
    [theme.breakpoints.down("xs")]: {
      fontSize: "0.625rem",
      letterSpacing: "0.02em"
    }
  },
  topbarSep: {
    opacity: 0.4,
    fontWeight: 300,
    fontSize: "0.65rem",
    lineHeight: 1,
    userSelect: "none"
  },
  topbarTime: {
    fontSize: "0.8125rem",
    fontWeight: 600,
    letterSpacing: "0.08em",
    fontVariantNumeric: "tabular-nums",
    fontFeatureSettings: '"tnum"',
    fontFamily:
      '"SF Mono", "SFMono-Regular", ui-monospace, Menlo, Monaco, "Cascadia Mono", "Helvetica Neue", monospace',
    lineHeight: 1,
    margin: 0,
    padding: "1px 0",
    color: "inherit",
    textShadow: "0 1px 2px rgba(0,0,0,0.12)",
    [theme.breakpoints.down("xs")]: {
      fontSize: "0.7rem",
      letterSpacing: "0.05em"
    }
  },
  bar: {
    margin: "8px 16px 0",
    padding: "10px 16px",
    borderRadius: 8,
    background: "linear-gradient(90deg, #0ea5e9 0%, #6366f1 100%)",
    color: "#fff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    fontWeight: 400,
    transition: "opacity 0.2s ease",
    "&:hover": { opacity: 0.95 },
    "&:focus": {
      outline: "none",
      boxShadow: "0 0 0 2px rgba(255,255,255,0.35)"
    }
  },
  barMain: {
    fontSize: "0.875rem",
    fontWeight: 400,
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    color: "#fff",
    lineHeight: 1.35
  },
  barHint: {
    fontSize: "0.75rem",
    fontWeight: 400,
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    color: "#fff",
    opacity: 0.95
  },
  dialogTitle: {
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    fontWeight: 400
  },
  paperPlans: {
    maxWidth: 520,
    width: "100%",
    [theme.breakpoints.down("xs")]: { margin: 8 }
  }
}));

/**
 * Freemium: `variant="appBar"` = chip no canto esquerdo da AppBar (após o menu); `banner` = faixa no conteúdo.
 */
const FreemiumTrialBar = ({ variant = "banner" }) => {
  const classes = useStyles();
  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.down("xs"));
  const { user } = useContext(AuthContext);
  const [open, setOpen] = useState(false);

  const { show, daysRemaining, dueDate } = useMemo(() => {
    if (!user?.company || user.company.id === 1) {
      return { show: false, daysRemaining: null, dueDate: null };
    }
    if (user.company.recurrence !== "freemium") {
      return { show: false, daysRemaining: null, dueDate: null };
    }
    const due = user.company.dueDate;
    if (!due || !moment(due).isValid()) {
      return { show: false, daysRemaining: null, dueDate: null };
    }
    const days = brtCalendarDaysRemaining(due);
    if (days === null) {
      return { show: false, daysRemaining: 0, dueDate: null };
    }
    return { show: true, daysRemaining: days, dueDate: due };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company?.id, user?.company?.recurrence, user?.company?.dueDate]);

  const [countdownTick, setCountdownTick] = useState(0);
  useEffect(() => {
    if ((variant !== "appBar" && variant !== "sidebar") || !show || !dueDate) return undefined;
    const id = window.setInterval(() => setCountdownTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [variant, show, dueDate]);

  const countdown = useMemo(() => {
    if (!dueDate) {
      return { days: 0, hh: "00", mm: "00", ss: "00" };
    }
    const ms = msUntilEndOfDueDayBrt(dueDate);
    return splitCountdownMs(ms);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueDate, countdownTick]);

  if (!show) {
    return null;
  }

  const label =
    daysRemaining === 0
      ? "último dia do período grátis"
      : `${daysRemaining} dia${daysRemaining !== 1 ? "s" : ""} restante${daysRemaining !== 1 ? "s" : ""} no Starter grátis`;

  const helvetica = { fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', fontWeight: 400 };

  const openPlansModal = () => setOpen(true);
  const handleCloseModal = () => setOpen(false);

  return (
    <>
      {variant === "sidebar" ? (
        <Tooltip
          title={`Período grátis Starter · ${label}. Contagem em horário de Brasília.`}
          arrow
          placement="right"
        >
          <Box
            component="button"
            type="button"
            className={classes.sidebarCard}
            onClick={openPlansModal}
            aria-label={`Teste grátis. Dias restantes ${countdown.days}. Tempo restante ${countdown.hh} horas ${countdown.mm} minutos ${countdown.ss} segundos, horário de Brasília.`}
          >
            <span className={classes.sidebarCardLabel}>Teste grátis</span>
            <span className={classes.sidebarCardTime}>
              {countdown.days}d {countdown.hh}:{countdown.mm}:{countdown.ss}
            </span>
          </Box>
        </Tooltip>
      ) : variant === "appBar" ? (
        <Tooltip
          title={`Período grátis Starter · ${label}. Contagem em horário de Brasília. Restam ${countdown.days}d ${countdown.hh}:${countdown.mm}:${countdown.ss}.`}
          arrow
          placement="bottom"
        >
          <span style={{ display: "inline-flex", verticalAlign: "middle" }}>
            <Box
              component="button"
              type="button"
              className={classes.topbarPillOuter}
              onClick={openPlansModal}
              aria-label={`Teste grátis. Dias restantes ${countdown.days}. Tempo restante ${countdown.hh} horas ${countdown.mm} minutos ${countdown.ss} segundos, horário de Brasília.`}
            >
              <Box className={classes.topbarPillRow}>
                <Typography component="span" className={classes.topbarLabel}>
                  Teste grátis
                </Typography>
                <Typography component="span" className={classes.topbarSep}>
                  ·
                </Typography>
                <Typography component="span" className={classes.topbarLabel}>
                  Dias restantes: {countdown.days}
                </Typography>
                <Typography component="span" className={classes.topbarSep}>
                  ·
                </Typography>
                <Typography component="span" className={classes.topbarLabel}>
                  Horas:{" "}
                  <Typography component="span" className={classes.topbarTime}>
                    {countdown.hh}:{countdown.mm}:{countdown.ss}
                  </Typography>
                </Typography>
              </Box>
            </Box>
          </span>
        </Tooltip>
      ) : (
        <Box
          className={classes.bar}
          onClick={openPlansModal}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              openPlansModal();
            }
          }}
          role="button"
          tabIndex={0}
        >
          <Typography component="span" className={classes.barMain}>
            Período grátis Starter · {label}
          </Typography>
          <Typography component="span" className={classes.barHint}>
            Ver planos pagos
          </Typography>
        </Box>
      )}

      <Dialog
        open={open}
        onClose={handleCloseModal}
        maxWidth="sm"
        fullWidth
        PaperProps={{ className: classes.paperPlans }}
      >
        <DialogTitle className={classes.dialogTitle} disableTypography>
          <Typography
            variant="h6"
            component="span"
            style={{ ...helvetica, fontSize: isXs ? "1rem" : undefined }}
          >
            Planos pagos
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" style={helvetica}>
            Período grátis Starter · {label}.
          </Typography>
          <Typography variant="body2" color="textSecondary" style={{ ...helvetica, marginTop: 8 }}>
            Para contratar um plano, entre em contato com o administrador do sistema.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCloseModal}
            size="small"
            style={{ ...helvetica, textTransform: "none", borderRadius: 8 }}
          >
            Fechar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default FreemiumTrialBar;
