import React, { useContext, useMemo, useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Formik, Form, Field } from "formik";
import * as Yup from "yup";
import NumberFormat from "react-number-format";
import {
  Box,
  Button,
  CircularProgress,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  TextField,
  Typography,
  makeStyles
} from "@material-ui/core";
import Visibility from "@material-ui/icons/Visibility";
import VisibilityOff from "@material-ui/icons/VisibilityOff";
import { toast } from "react-toastify";
import toastError from "../../errors/toastError";
import { openApi } from "../../services/api";
import api from "../../services/api";
import { AuthContext } from "../../context/Auth/AuthContext";
import MinimalLanguageSelector from "../../components/MinimalLanguageSelector";
import { OFFICIAL_LOGO as logoVBBlack } from "../../constants/defaultLogos";
import { PREMIUM_FONT_FAMILY } from "../../constants/typography";
import useAppTranslation from "../../hooks/useAppTranslation";

const BRAND_FONT = PREMIUM_FONT_FAMILY;
const PHONE_FORMAT = "+55 (##) #####-####";
const CODIGO_FONTE_URL = "https://www.bbsolutioncrm.com.br/codigo-fonte/instalar";

const useStyles = makeStyles(theme => {
  const inputBg = "#f5f5f7";
  const inputBgHover = "#ebebed";
  const inputBgFocus = "#ffffff";
  const labelColor = "#3a3a3c";
  const textColor = "#111113";
  const mutedColor = "#6e6e73";
  const brand = "#1e3a8a";

  return {
    root: {
      minHeight: "100dvh",
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(180deg, #fbfbfd 0%, #f5f5f7 55%, #eef0f4 100%)",
      padding: theme.spacing(3, 2, 4),
      fontFamily: BRAND_FONT,
      color: textColor,
      boxSizing: "border-box",
      "@media (prefers-reduced-motion: reduce)": {
        "& *": { transition: "none !important" }
      },
      [theme.breakpoints.down("sm")]: {
        alignItems: "flex-start",
        paddingTop: "max(16px, env(safe-area-inset-top, 0px))",
        paddingBottom: "max(24px, env(safe-area-inset-bottom, 0px))"
      }
    },
    container: {
      width: "100%",
      maxWidth: 440,
      margin: "0 auto"
    },
    langRow: {
      display: "flex",
      justifyContent: "flex-end",
      marginBottom: theme.spacing(1.25)
    },
    card: {
      width: "100%",
      padding: theme.spacing(3.5, 3.25, 2.75),
      boxSizing: "border-box",
      background: "#ffffff",
      borderRadius: 20,
      border: "1px solid rgba(0,0,0,0.06)",
      boxShadow: "0 18px 50px rgba(15, 23, 42, 0.08)",
      [theme.breakpoints.down("xs")]: {
        padding: theme.spacing(2.75, 2, 2.25),
        borderRadius: 16
      }
    },
    logoWrap: {
      display: "flex",
      justifyContent: "center",
      marginBottom: theme.spacing(2),
      paddingTop: theme.spacing(0.5)
    },
    logo: {
      height: 86,
      width: "auto",
      maxWidth: "min(280px, 78%)",
      objectFit: "contain",
      [theme.breakpoints.down("xs")]: {
        height: 74
      }
    },
    title: {
      fontWeight: 700,
      fontSize: 22,
      letterSpacing: "-0.03em",
      textAlign: "center",
      lineHeight: 1.2,
      marginBottom: theme.spacing(0.75),
      color: textColor,
      [theme.breakpoints.down("xs")]: { fontSize: 20 }
    },
    subtitle: {
      color: mutedColor,
      fontSize: 13.5,
      textAlign: "center",
      lineHeight: 1.45,
      marginBottom: theme.spacing(2.5)
    },
    inputGroup: {
      "& .MuiGrid-item": {
        paddingTop: theme.spacing(0.9),
        paddingBottom: theme.spacing(0.5)
      },
      "& .MuiOutlinedInput-root": {
        background: inputBg,
        borderRadius: 12,
        minHeight: 46,
        fontSize: 15,
        transition: "background-color 0.18s ease, box-shadow 0.18s ease",
        "& fieldset": { border: "1px solid rgba(0,0,0,0.08)" },
        "&:hover": {
          background: inputBgHover,
          "& fieldset": { borderColor: "rgba(0,0,0,0.14)" }
        },
        "&.Mui-focused": {
          background: inputBgFocus,
          boxShadow: "0 0 0 4px rgba(30, 58, 138, 0.12)"
        },
        "&.Mui-focused fieldset": {
          borderColor: brand,
          borderWidth: 1.5
        },
        "&.Mui-error fieldset": {
          borderColor: "#ef4444"
        }
      },
      "& .MuiInputBase-input": {
        color: textColor,
        fontWeight: 500,
        letterSpacing: "-0.02em",
        padding: "12px 14px",
        "&::placeholder": { color: "#a1a1a6", opacity: 1 }
      },
      "& .MuiFormHelperText-root": {
        fontSize: 12,
        marginTop: 5,
        marginLeft: 2
      }
    },
    fieldLabel: {
      display: "block",
      color: labelColor,
      fontSize: 12.5,
      fontWeight: 650,
      letterSpacing: "-0.02em",
      marginBottom: 7
    },
    submit: {
      marginTop: theme.spacing(2),
      minHeight: 48,
      width: "100%",
      borderRadius: 12,
      textTransform: "none",
      fontWeight: 650,
      fontSize: 15.5,
      letterSpacing: "-0.015em",
      background: brand,
      color: "#fff",
      boxShadow: "0 8px 20px rgba(30, 58, 138, 0.22)",
      "&:hover": {
        background: "#1e40af",
        boxShadow: "0 10px 24px rgba(30, 58, 138, 0.28)"
      },
      "&.Mui-disabled": { opacity: 0.55, boxShadow: "none" }
    },
    backLink: {
      display: "block",
      textAlign: "center",
      marginTop: theme.spacing(1.75),
      color: mutedColor,
      fontSize: 13,
      textDecoration: "none",
      fontWeight: 500,
      "&:hover": { color: textColor }
    },
    notice: {
      borderRadius: 14,
      padding: theme.spacing(1.75, 1.75, 1.5),
      marginBottom: theme.spacing(2),
      border: "1px solid",
      textAlign: "left"
    },
    noticeEmail: {
      background: "#f8fafc",
      borderColor: "rgba(30, 58, 138, 0.18)",
      color: "#0f172a"
    },
    noticePhone: {
      background: "#fff7ed",
      borderColor: "rgba(249, 115, 22, 0.28)",
      color: "#9a3412"
    },
    noticeIp: {
      background: "linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)",
      borderColor: "rgba(30, 58, 138, 0.2)",
      color: "#0f172a"
    },
    noticeIcon: {
      fontSize: 22,
      lineHeight: 1,
      marginBottom: 6
    },
    noticeTitle: {
      fontWeight: 700,
      fontSize: 15,
      letterSpacing: "-0.02em",
      marginBottom: 6
    },
    noticeText: {
      fontSize: 13,
      lineHeight: 1.45,
      color: mutedColor,
      marginBottom: theme.spacing(1.5)
    },
    noticeActions: {
      display: "flex",
      flexWrap: "wrap",
      gap: 8,
      alignItems: "center"
    },
    primaryCta: {
      textTransform: "none",
      fontWeight: 650,
      borderRadius: 10,
      minHeight: 40,
      padding: "0 16px",
      background: brand,
      color: "#fff",
      boxShadow: "0 6px 16px rgba(30, 58, 138, 0.2)",
      "&:hover": { background: "#1e40af" }
    },
    secondaryCta: {
      textTransform: "none",
      fontWeight: 550,
      borderRadius: 10,
      minHeight: 40,
      color: mutedColor
    }
  };
});

const phoneDigits = value => String(value || "").replace(/\D/g, "");

const normalizeWhatsAppPhone = value => {
  let d = phoneDigits(value);
  if (!d) return "";
  if (d.startsWith("055")) d = d.slice(1);
  if (d.length >= 10 && d.length <= 11 && !d.startsWith("55")) {
    d = `55${d}`;
  }
  return d;
};

const RegisterTesteGratis = () => {
  const classes = useStyles();
  const { t } = useAppTranslation();
  const { applyLoginSession, handleLogin } = useContext(AuthContext);
  const submittingRef = useRef(false);
  const phoneInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [banner, setBanner] = useState(null);

  const SignupSchema = useMemo(
    () =>
      Yup.object().shape({
        phone: Yup.string()
          .required(t("freeTrialRegister.phoneRequired"))
          .test("phone", t("freeTrialRegister.phoneInvalid"), v => {
            const d = normalizeWhatsAppPhone(v);
            return d.length === 12 || d.length === 13;
          }),
        email: Yup.string()
          .trim()
          .email(t("freeTrialRegister.emailInvalid"))
          .required(t("freeTrialRegister.emailRequired")),
        password: Yup.string()
          .min(5, t("freeTrialRegister.passwordMin"))
          .required(t("freeTrialRegister.passwordRequired")),
        passwordConfirm: Yup.string()
          .oneOf([Yup.ref("password"), null], t("freeTrialRegister.passwordMismatch"))
          .required(t("freeTrialRegister.passwordConfirmRequired"))
      }),
    [t]
  );

  const clearBanner = () => setBanner(null);

  const focusPhone = () => {
    setBanner(null);
    setTimeout(() => {
      try {
        phoneInputRef.current?.focus?.();
      } catch {
        /* ignore */
      }
    }, 50);
  };

  const handleSubmit = async (values, { setSubmitting, setFieldError }) => {
    if (submittingRef.current || loading) return;
    submittingRef.current = true;
    setLoading(true);
    setBanner(null);

    try {
      const payload = {
        phone: normalizeWhatsAppPhone(values.phone),
        email: String(values.email || "").trim().toLowerCase(),
        password: values.password,
        passwordConfirm: values.passwordConfirm,
        userAgent: navigator?.userAgent || ""
      };

      const { data } = await openApi.post("/auth/signup/teste-gratis", payload, {
        withCredentials: true
      });

      if (data?.token && data?.user) {
        toast.success(t("freeTrialRegister.success"));
        if (typeof applyLoginSession === "function") {
          await applyLoginSession({
            token: data.token,
            user: data.user
          });
          return;
        }
        if (typeof handleLogin === "function") {
          await handleLogin({
            email: payload.email,
            password: payload.password
          });
          return;
        }
        localStorage.setItem("token", JSON.stringify(data.token));
        api.defaults.headers.Authorization = `Bearer ${data.token}`;
        window.location.href = "/tickets";
        return;
      }

      toastError(t("freeTrialRegister.fail"));
    } catch (err) {
      const code = String(err?.response?.data?.code || "");
      const msg = String(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.message ||
          ""
      );

      if (code === "EMAIL_ALREADY_EXISTS" || /EMAIL_ALREADY_EXISTS/i.test(msg)) {
        setFieldError("email", "Este e-mail já está cadastrado");
        setBanner({ type: "email" });
        return;
      }
      if (code === "PHONE_ALREADY_EXISTS" || /PHONE_ALREADY_EXISTS/i.test(msg)) {
        setFieldError("phone", "Este telefone já está cadastrado");
        setBanner({ type: "phone" });
        return;
      }
      if (
        code === "IP_SIGNUP_LIMIT_REACHED" ||
        /IP_SIGNUP_LIMIT_REACHED/i.test(msg)
      ) {
        setBanner({ type: "ip" });
        return;
      }
      if (/e-mail|email/i.test(msg) && err?.response?.status === 409) {
        setFieldError("email", msg);
      }
      if (/telefone|phone/i.test(msg)) {
        setFieldError("phone", msg);
      }
      toastError(err);
    } finally {
      submittingRef.current = false;
      setLoading(false);
      setSubmitting(false);
    }
  };

  const renderBanner = () => {
    if (!banner) return null;
    if (banner.type === "email") {
      return (
        <Box className={`${classes.notice} ${classes.noticeEmail}`} role="status">
          <div className={classes.noticeIcon}>👀</div>
          <Typography className={classes.noticeTitle}>
            Opa, você já passou por aqui! 👀
          </Typography>
          <Typography className={classes.noticeText}>
            Esse e-mail já foi utilizado para acessar o VB Solution CRM. Que tal
            dar o próximo passo e instalar o código-fonte para ter sua própria
            versão do sistema?
          </Typography>
          <div className={classes.noticeActions}>
            <Button
              className={classes.primaryCta}
              variant="contained"
              href={CODIGO_FONTE_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Instalar o código-fonte
            </Button>
            <Button className={classes.secondaryCta} onClick={clearBanner}>
              Tentar outro e-mail
            </Button>
          </div>
        </Box>
      );
    }
    if (banner.type === "phone") {
      return (
        <Box className={`${classes.notice} ${classes.noticePhone}`} role="status">
          <div className={classes.noticeIcon}>📱</div>
          <Typography className={classes.noticeTitle}>
            Esse número já está cadastrado! 📱
          </Typography>
          <Typography className={classes.noticeText}>
            Boa! Esse telefone já está vinculado a uma conta no VB Solution CRM.
            Confira o número informado ou tente usar outro telefone.
          </Typography>
          <div className={classes.noticeActions}>
            <Button className={classes.primaryCta} variant="contained" onClick={focusPhone}>
              Corrigir telefone
            </Button>
          </div>
        </Box>
      );
    }
    if (banner.type === "ip") {
      return (
        <Box className={`${classes.notice} ${classes.noticeIp}`} role="status">
          <div className={classes.noticeIcon}>🚀</div>
          <Typography className={classes.noticeTitle}>
            Eita, esse IP já aproveitou os testes! 🚀
          </Typography>
          <Typography className={classes.noticeText}>
            Você chegou ao limite de cinco cadastros gratuitos por este endereço
            IP. Mas calma, tem outro caminho! Conheça o código-fonte do VB
            Solution CRM e tenha sua própria versão do sistema.
          </Typography>
          <div className={classes.noticeActions}>
            <Button
              className={classes.primaryCta}
              variant="contained"
              href={CODIGO_FONTE_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Instalar o código-fonte
            </Button>
            <Button className={classes.secondaryCta} onClick={clearBanner}>
              Fechar
            </Button>
          </div>
        </Box>
      );
    }
    return null;
  };

  return (
    <Box className={classes.root} component="main">
      <Box className={classes.container}>
        <Box className={classes.langRow}>
          <MinimalLanguageSelector variant="light" inline compact />
        </Box>
        <Formik
          initialValues={{
            phone: "",
            email: "",
            password: "",
            passwordConfirm: ""
          }}
          validationSchema={SignupSchema}
          onSubmit={handleSubmit}
          enableReinitialize={false}
        >
          {({ touched, errors, isSubmitting, values, setFieldValue, setFieldTouched }) => (
            <Form noValidate aria-label="Cadastro teste grátis">
              <Box className={classes.card}>
                <Box className={classes.logoWrap}>
                  <img
                    src={logoVBBlack}
                    alt="VB Solution CRM"
                    className={classes.logo}
                  />
                </Box>
                <Typography className={classes.title} component="h1">
                  Seu próximo nível começa aqui.
                </Typography>
                <Typography className={classes.subtitle} component="p">
                  Crie sua conta e descubra tudo o que o VB Solution CRM pode
                  fazer pelo seu negócio.
                </Typography>

                {renderBanner()}

                <Grid container spacing={1} className={classes.inputGroup}>
                  <Grid item xs={12}>
                    <InputLabel className={classes.fieldLabel} htmlFor="ft-phone">
                      Telefone (WhatsApp)
                    </InputLabel>
                    <NumberFormat
                      id="ft-phone"
                      getInputRef={el => {
                        phoneInputRef.current = el;
                      }}
                      customInput={TextField}
                      format={PHONE_FORMAT}
                      mask="_"
                      value={values.phone}
                      onValueChange={v => {
                        setFieldValue("phone", v.value || "");
                        if (banner?.type === "phone") clearBanner();
                      }}
                      onBlur={() => setFieldTouched("phone", true)}
                      variant="outlined"
                      fullWidth
                      type="tel"
                      inputProps={{
                        inputMode: "tel",
                        autoComplete: "tel"
                      }}
                      error={touched.phone && Boolean(errors.phone)}
                      helperText={touched.phone && errors.phone}
                      placeholder="+55 (11) 99999-9999"
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <InputLabel className={classes.fieldLabel} htmlFor="ft-email">
                      E-mail
                    </InputLabel>
                    <Field
                      as={TextField}
                      id="ft-email"
                      name="email"
                      type="email"
                      variant="outlined"
                      fullWidth
                      inputProps={{ autoComplete: "email" }}
                      error={touched.email && Boolean(errors.email)}
                      helperText={touched.email && errors.email}
                      onFocus={() => {
                        if (banner?.type === "email") clearBanner();
                      }}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <InputLabel className={classes.fieldLabel} htmlFor="ft-password">
                      Senha
                    </InputLabel>
                    <Field
                      as={TextField}
                      id="ft-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      variant="outlined"
                      fullWidth
                      inputProps={{ autoComplete: "new-password" }}
                      error={touched.password && Boolean(errors.password)}
                      helperText={touched.password && errors.password}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              aria-label="Mostrar senha"
                              onClick={() => setShowPassword(v => !v)}
                              edge="end"
                              size="small"
                            >
                              {showPassword ? <VisibilityOff /> : <Visibility />}
                            </IconButton>
                          </InputAdornment>
                        )
                      }}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <InputLabel
                      className={classes.fieldLabel}
                      htmlFor="ft-password-confirm"
                    >
                      Confirmar senha
                    </InputLabel>
                    <Field
                      as={TextField}
                      id="ft-password-confirm"
                      name="passwordConfirm"
                      type={showPasswordConfirm ? "text" : "password"}
                      variant="outlined"
                      fullWidth
                      inputProps={{ autoComplete: "new-password" }}
                      error={
                        touched.passwordConfirm && Boolean(errors.passwordConfirm)
                      }
                      helperText={
                        touched.passwordConfirm && errors.passwordConfirm
                      }
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              aria-label="Mostrar confirmação de senha"
                              onClick={() => setShowPasswordConfirm(v => !v)}
                              edge="end"
                              size="small"
                            >
                              {showPasswordConfirm ? (
                                <VisibilityOff />
                              ) : (
                                <Visibility />
                              )}
                            </IconButton>
                          </InputAdornment>
                        )
                      }}
                    />
                  </Grid>
                </Grid>

                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  className={classes.submit}
                  disabled={isSubmitting || loading || banner?.type === "ip"}
                  aria-busy={loading}
                >
                  {loading ? (
                    <CircularProgress size={22} color="inherit" />
                  ) : (
                    "Criar minha conta grátis"
                  )}
                </Button>

                <Typography
                  className={classes.backLink}
                  component={RouterLink}
                  to="/login"
                >
                  Já tenho conta
                </Typography>
              </Box>
            </Form>
          )}
        </Formik>
      </Box>
    </Box>
  );
};

export default RegisterTesteGratis;
