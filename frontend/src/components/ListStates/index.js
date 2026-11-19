import React from "react";
import { makeStyles } from "@material-ui/core/styles";
import { Button, TableCell, TableRow } from "@material-ui/core";
import { AlertCircle, Inbox, RotateCw } from "lucide-react";

const useStyles = makeStyles((theme) => {
  const dark = theme.palette.type === "dark";
  return {
    root: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      gap: 6,
      padding: theme.spacing(5, 2),
      color: theme.palette.text.secondary,
    },
    compact: {
      padding: theme.spacing(3, 2),
    },
    iconWrap: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 44,
      height: 44,
      marginBottom: 4,
      borderRadius: 12,
      backgroundColor: dark ? "rgba(255, 255, 255, 0.06)" : "rgba(15, 23, 42, 0.045)",
      color: dark ? "rgba(255, 255, 255, 0.7)" : "#52525b",
    },
    iconError: {
      backgroundColor: dark ? "rgba(248, 113, 113, 0.14)" : "rgba(220, 38, 38, 0.08)",
      color: dark ? "#fca5a5" : "#dc2626",
    },
    title: {
      margin: 0,
      fontSize: "0.9375rem",
      fontWeight: 600,
      letterSpacing: "-0.01em",
      color: theme.palette.text.primary,
    },
    description: {
      margin: 0,
      maxWidth: 360,
      fontSize: "0.8125rem",
      lineHeight: 1.45,
    },
    action: {
      marginTop: 8,
    },
    cell: {
      borderBottom: "none !important",
    },
  };
});

export function ListEmptyState({ icon: Icon = Inbox, title = "Nenhum registro encontrado", description, action, compact = false }) {
  const classes = useStyles();
  return (
    <div className={`${classes.root} ${compact ? classes.compact : ""}`} role="status">
      <span className={classes.iconWrap} aria-hidden>
        <Icon size={20} strokeWidth={1.75} />
      </span>
      <p className={classes.title}>{title}</p>
      {description ? <p className={classes.description}>{description}</p> : null}
      {action ? <div className={classes.action}>{action}</div> : null}
    </div>
  );
}

export function ListErrorState({ title = "Não foi possível carregar os registros", description = "Verifique sua conexão e tente novamente.", onRetry, compact = false }) {
  const classes = useStyles();
  return (
    <div className={`${classes.root} ${compact ? classes.compact : ""}`} role="alert">
      <span className={`${classes.iconWrap} ${classes.iconError}`} aria-hidden>
        <AlertCircle size={20} strokeWidth={1.75} />
      </span>
      <p className={classes.title}>{title}</p>
      {description ? <p className={classes.description}>{description}</p> : null}
      {onRetry ? (
        <Button
          className={classes.action}
          size="small"
          variant="outlined"
          onClick={onRetry}
          startIcon={<RotateCw size={14} />}
        >
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}

/** Linha que ocupa toda a tabela para exibir um estado (vazio/erro) dentro do TableBody. */
export function TableStateRow({ colSpan, children }) {
  const classes = useStyles();
  return (
    <TableRow hover={false}>
      <TableCell colSpan={colSpan} className={classes.cell}>
        {children}
      </TableCell>
    </TableRow>
  );
}
