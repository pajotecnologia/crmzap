import React, { useEffect, useMemo, useState } from "react";
import {
  makeStyles,
  Dialog,
  TextField,
  MenuItem,
  Switch,
  Button,
  CircularProgress,
  useMediaQuery,
} from "@material-ui/core";
import { useTheme } from "@material-ui/core/styles";
import { Close as CloseIcon } from "@material-ui/icons";
import { Formik, Form } from "formik";
import * as Yup from "yup";

const font = '"Helvetica Neue", Helvetica, Arial, sans-serif';

const useStyles = makeStyles((theme) => {
  const isDark = theme.palette.type === "dark";
  const border = isDark ? "rgba(255,255,255,0.10)" : "#e5e7eb";
  const fieldBorder = isDark ? "rgba(255,255,255,0.16)" : "#d1d5db";
  const muted = isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";
  const surface = isDark ? "rgba(255,255,255,0.035)" : "#f9fafb";

  return {
    paper: {
      borderRadius: 16,
      width: "100%",
      maxWidth: 450,
      maxHeight: "88vh",
      background: isDark ? "#1e1e1f" : "#ffffff",
      border: `1px solid ${border}`,
      boxShadow: isDark ? "0 24px 60px rgba(0,0,0,0.6)" : "0 24px 60px rgba(15,23,42,0.18)",
      fontFamily: font,
      display: "flex",
      flexDirection: "column",
      [theme.breakpoints.down("xs")]: { maxWidth: "100%", maxHeight: "100%", borderRadius: 0 },
    },
    form: { display: "flex", flexDirection: "column", minHeight: 0, flex: 1 },
    header: {
      padding: "18px 18px 6px",
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    overline: {
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: isDark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.6)",
      marginBottom: 6,
    },
    title: {
      fontSize: 17,
      fontWeight: 700,
      lineHeight: 1.2,
      color: theme.palette.text.primary,
      margin: 0,
    },
    subtitle: {
      fontSize: 10.5,
      lineHeight: 1.45,
      color: isDark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.6)",
      marginTop: 6,
      maxWidth: 320,
    },
    closeBtn: {
      flexShrink: 0,
      width: 24,
      height: 24,
      borderRadius: 7,
      border: "none",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: isDark ? "rgba(255,255,255,0.08)" : "#f3f4f6",
      color: theme.palette.text.primary,
      "&:hover": { background: isDark ? "rgba(255,255,255,0.14)" : "#e5e7eb" },
    },
    body: {
      padding: "6px 18px 14px",
      overflowY: "auto",
      flex: 1,
      minHeight: 0,
      "&::-webkit-scrollbar": { width: 4 },
      "&::-webkit-scrollbar-thumb": {
        background: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)",
        borderRadius: 4,
      },
    },
    section: {
      fontSize: 8.5,
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: muted,
      margin: "16px 0 8px",
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
      gap: "10px 6px",
      [theme.breakpoints.down("xs")]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
    },
    span2: { gridColumn: "span 2" },
    field: {
      "& .MuiOutlinedInput-root": {
        borderRadius: 7,
        height: 30,
        fontSize: 11,
        fontFamily: font,
        background: "transparent",
        "& fieldset": { borderColor: fieldBorder },
        "&:hover fieldset": { borderColor: isDark ? "rgba(255,255,255,0.28)" : "#9ca3af" },
        "&.Mui-focused fieldset": { borderColor: theme.palette.primary.main, borderWidth: 1 },
        "&.Mui-disabled": { opacity: 0.6 },
      },
      "& .MuiOutlinedInput-input": { padding: "6px 8px", fontSize: 11 },
      "& .MuiSelect-outlined": { padding: "6px 22px 6px 8px", fontSize: 11 },
      "& .MuiSelect-icon": { right: 4, color: theme.palette.text.primary },
      "& .MuiInputLabel-outlined.MuiInputLabel-shrink": {
        transform: "translate(8px, -5px) scale(0.68)",
        color: muted,
      },
      "& .MuiOutlinedInput-notchedOutline legend": { fontSize: "0.68em" },
      "& .MuiFormHelperText-root": { margin: "2px 2px 0", fontSize: 9.5 },
    },
    toggleGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gap: 4,
      [theme.breakpoints.down("xs")]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
    },
    toggleItem: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 4,
      height: 26,
      padding: "0 2px 0 8px",
      borderRadius: 6,
      background: surface,
      border: `1px solid ${border}`,
      cursor: "pointer",
      userSelect: "none",
    },
    toggleLabel: {
      fontSize: 9.5,
      fontWeight: 600,
      color: theme.palette.text.primary,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    },
    switch: {
      transform: "scale(0.62)",
      transformOrigin: "right center",
      marginRight: -6,
    },
    footer: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "10px 18px 12px",
      borderTop: `1px solid ${border}`,
    },
    btnBase: {
      height: 28,
      borderRadius: 9,
      textTransform: "none",
      fontSize: 10.5,
      fontWeight: 600,
      fontFamily: font,
      padding: "0 14px",
      boxShadow: "none",
      "&:hover": { boxShadow: "none" },
    },
    cancelBtn: {
      color: theme.palette.text.primary,
      borderColor: isDark ? "rgba(255,255,255,0.28)" : "#d1d5db",
    },
    submitBtn: {
      background: "#3b82f6",
      color: "#fff",
      "&:hover": { background: "#2563eb" },
      "&.Mui-disabled": { background: "rgba(59,130,246,0.5)", color: "#fff" },
    },
    deleteBtn: {
      color: "#ef4444",
      borderColor: "rgba(239,68,68,0.5)",
    },
  };
});

export const PLAN_TOGGLES = [
  { name: "useWhatsapp", label: "WhatsApp" },
  { name: "useWhatsappOfficial", label: "WA Oficial" },
  { name: "useFacebook", label: "Facebook" },
  { name: "useInstagram", label: "Instagram" },
  { name: "useCampaigns", label: "Campanhas" },
  { name: "useSchedules", label: "Agendamentos" },
  { name: "useInternalChat", label: "Chat Interno" },
  { name: "useExternalApi", label: "API Externa" },
  { name: "useKanban", label: "Kanban" },
  { name: "useOpenAi", label: "Talk.Ai" },
  { name: "useIntegrations", label: "Integrações" },
  { name: "wavoip", label: "Wavoip" },
];

export const INITIAL_PLAN = {
  name: "",
  users: 0,
  connections: 0,
  queues: 0,
  amount: "0",
  isPublic: true,
  trial: false,
  trialDays: 3,
  recurrence: "monthly",
  useWhatsapp: true,
  useWhatsappOfficial: false,
  useFacebook: true,
  useInstagram: true,
  useCampaigns: true,
  useSchedules: true,
  useInternalChat: true,
  useExternalApi: true,
  useKanban: true,
  useOpenAi: true,
  useIntegrations: true,
  wavoip: false,
};

const RECURRENCES = [
  { value: "monthly", label: "Mensal" },
  { value: "bimonthly", label: "Bimestral" },
  { value: "quarterly", label: "Trimestral" },
  { value: "semiannual", label: "Semestral" },
  { value: "yearly", label: "Anual" },
];

/** Aceita "1.234,56", "1234.56" ou número e devolve string decimal "1234.56". */
export function normalizeAmount(value) {
  if (value === null || value === undefined || value === "") return "0";
  if (typeof value === "number") return Number.isFinite(value) ? value.toFixed(2) : "0";
  let s = String(value).replace(/[^\d.,-]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? n.toFixed(2) : "0";
}

function formatAmountForInput(value) {
  const n = parseFloat(normalizeAmount(value));
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const validationSchema = Yup.object().shape({
  name: Yup.string().trim().min(2, "Mínimo de 2 caracteres").required("Informe o nome do plano"),
  users: Yup.number().typeError("Número inválido").min(0, "Não pode ser negativo"),
  connections: Yup.number().typeError("Número inválido").min(0, "Não pode ser negativo"),
  queues: Yup.number().typeError("Número inválido").min(0, "Não pode ser negativo"),
  amount: Yup.string().test("amount", "Valor inválido", (v) => !v || /^[\d.,\s]+$/.test(String(v))),
  trialDays: Yup.number().when("trial", {
    is: true,
    then: Yup.number().typeError("Número inválido").min(1, "Mínimo 1 dia"),
  }),
});

function ToggleItem({ label, checked, onChange, classes }) {
  return (
    <div className={classes.toggleItem} onClick={() => onChange(!checked)} role="presentation">
      <span className={classes.toggleLabel}>{label}</span>
      <Switch
        size="small"
        color="primary"
        checked={checked}
        className={classes.switch}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
}

export default function PlanModal({ open, onClose, plan, onSave, onDelete, loading }) {
  const classes = useStyles();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("xs"));
  const isEdit = Boolean(plan && plan.id);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) setSubmitting(false);
  }, [open]);

  const initialValues = useMemo(() => {
    if (!plan) return INITIAL_PLAN;
    const values = { ...INITIAL_PLAN, ...plan };
    PLAN_TOGGLES.forEach(({ name }) => {
      values[name] = plan[name] === undefined || plan[name] === null ? INITIAL_PLAN[name] : plan[name] === true;
    });
    values.isPublic = plan.isPublic !== false;
    values.trial = plan.trial === true;
    values.trialDays = plan.trialDays || INITIAL_PLAN.trialDays;
    values.recurrence = plan.recurrence || INITIAL_PLAN.recurrence;
    values.amount = formatAmountForInput(plan.amount);
    return values;
  }, [plan]);

  const handleSubmit = async (values) => {
    const payload = {
      ...values,
      name: String(values.name || "").trim(),
      users: toInt(values.users),
      connections: toInt(values.connections),
      queues: toInt(values.queues),
      amount: normalizeAmount(values.amount),
      trialDays: values.trial ? Math.max(1, toInt(values.trialDays)) : toInt(values.trialDays) || INITIAL_PLAN.trialDays,
    };
    setSubmitting(true);
    try {
      await onSave(payload);
    } finally {
      setSubmitting(false);
    }
  };

  const busy = submitting || loading;

  const fieldProps = (formik, name) => ({
    name,
    value: formik.values[name],
    onChange: formik.handleChange,
    onBlur: formik.handleBlur,
    error: Boolean(formik.touched[name] && formik.errors[name]),
    helperText: formik.touched[name] && formik.errors[name] ? formik.errors[name] : undefined,
    variant: "outlined",
    size: "small",
    fullWidth: true,
    className: classes.field,
    InputLabelProps: { shrink: true },
  });

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullScreen={fullScreen}
      classes={{ paper: classes.paper }}
      BackdropProps={{ style: { backgroundColor: "rgba(0,0,0,0.6)" } }}
    >
      <Formik
        initialValues={initialValues}
        enableReinitialize
        validationSchema={validationSchema}
        onSubmit={handleSubmit}
      >
        {(formik) => (
          <Form className={classes.form} noValidate>
            <div className={classes.header}>
              <div>
                <div className={classes.overline}>Organização</div>
                <h2 className={classes.title}>{isEdit ? "Editar plano" : "Novo plano"}</h2>
                <div className={classes.subtitle}>
                  Limites e recursos usados no registro, autenticação e quotas da empresa.
                </div>
              </div>
              <button type="button" className={classes.closeBtn} onClick={onClose} disabled={busy} aria-label="Fechar">
                <CloseIcon style={{ fontSize: 14 }} />
              </button>
            </div>

            <div className={classes.body}>
              <div className={classes.section}>Dados estratégicos</div>
              <div className={classes.grid}>
                <div className={classes.span2}>
                  <TextField label="Nome" autoFocus {...fieldProps(formik, "name")} />
                </div>
                <TextField label="Usuários" type="number" inputProps={{ min: 0 }} {...fieldProps(formik, "users")} />
                <TextField label="Conexões" type="number" inputProps={{ min: 0 }} {...fieldProps(formik, "connections")} />

                <TextField label="Filas" type="number" inputProps={{ min: 0 }} {...fieldProps(formik, "queues")} />
                <TextField label="Valor (R$)" inputProps={{ inputMode: "decimal" }} {...fieldProps(formik, "amount")} />
                <TextField select label="Público" {...fieldProps(formik, "isPublic")}>
                  <MenuItem value={true}>Sim — aparece no registro</MenuItem>
                  <MenuItem value={false}>Não — somente manual</MenuItem>
                </TextField>
                <TextField select label="Trial" {...fieldProps(formik, "trial")}>
                  <MenuItem value={true}>Sim</MenuItem>
                  <MenuItem value={false}>Não</MenuItem>
                </TextField>

                <TextField
                  label="Dias trial"
                  type="number"
                  inputProps={{ min: 1 }}
                  disabled={!formik.values.trial}
                  {...fieldProps(formik, "trialDays")}
                />
                <TextField select label="Recorrência" {...fieldProps(formik, "recurrence")}>
                  {RECURRENCES.map((r) => (
                    <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>
                  ))}
                </TextField>
              </div>

              <div className={classes.section}>Recursos liberados</div>
              <div className={classes.toggleGrid}>
                {PLAN_TOGGLES.map((t) => (
                  <ToggleItem
                    key={t.name}
                    label={t.label}
                    classes={classes}
                    checked={formik.values[t.name] === true}
                    onChange={(checked) => formik.setFieldValue(t.name, checked)}
                  />
                ))}
              </div>
            </div>

            <div className={classes.footer}>
              {isEdit && onDelete && (
                <Button
                  variant="outlined"
                  className={`${classes.btnBase} ${classes.deleteBtn}`}
                  onClick={() => onDelete(plan)}
                  disabled={busy}
                >
                  Excluir
                </Button>
              )}
              <div style={{ flex: 1 }} />
              <Button
                variant="outlined"
                className={`${classes.btnBase} ${classes.cancelBtn}`}
                onClick={onClose}
                disabled={busy}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="contained"
                className={`${classes.btnBase} ${classes.submitBtn}`}
                disabled={busy}
              >
                {busy ? <CircularProgress size={14} style={{ color: "#fff" }} /> : isEdit ? "Salvar alterações" : "Criar plano"}
              </Button>
            </div>
          </Form>
        )}
      </Formik>
    </Dialog>
  );
}
