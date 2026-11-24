import React, { useEffect, useRef, useState } from "react";
import {
  Button,
  CircularProgress,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Divider,
} from "@material-ui/core";
import InfoIcon from "@material-ui/icons/Info";
import FacebookLogin from "react-facebook-login/dist/facebook-login-render-props";
import { toast } from "react-toastify";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";
import {
  META_FACEBOOK_LOGIN_SCOPE,
  META_INSTAGRAM_LOGIN_SCOPE,
  META_INSTAGRAM_BUSINESS_LOGIN_SCOPES,
} from "../../config/metaOAuthScopes";
import {
  IG_OAUTH_RESULT_KEY,
  buildInstagramAuthorizeUrl,
  openInstagramOAuthPopup,
  subscribeInstagramOAuthCallback,
} from "./instagramOAuthPopup";

const DEFAULT_FACEBOOK_APP_ID =
  (process.env.REACT_APP_FACEBOOK_APP_ID || "").trim() || "1694035698920340";

/** Instagram App ID do produto Instagram Login (não é o Facebook App ID). */
const ENV_INSTAGRAM_APP_ID = (
  process.env.REACT_APP_INSTAGRAM_APP_ID ||
  process.env.REACT_APP_INSTAGRAM_CLIENT_ID ||
  ""
).trim();

function noPageMessage() {
  return (
    i18n.t("connections.facebook.noPageError") ||
    "É necessário ter uma Página do Facebook (página pública de fãs) para conectar. Crie uma em facebook.com/pages e tente novamente."
  );
}

function loginCancelledMessage() {
  return (
    i18n.t("connections.facebook.loginCancelledOrFailed") ||
    "Login cancelado ou não concluído. Tente novamente e aceite as permissões ao abrir a janela do Facebook."
  );
}

async function repairMetaConnection(channel) {
  try {
    const list = await api.get("/whatsapp/");
    const items = Array.isArray(list?.data)
      ? list.data
      : list?.data?.whatsapps || list?.data?.records || [];
    const conn = items.find(
      (w) =>
        w?.channel === channel &&
        String(w?.status || "").toUpperCase() === "CONNECTED"
    );
    if (conn?.id) {
      await api.post(`/whatsapp/${conn.id}/repair-meta-messenger`);
    }
  } catch (repairErr) {
    console.warn("[Connections] repair-meta-messenger falhou", repairErr);
  }
}

export default function MetaMessengerOAuthConnect({
  channel = "facebook",
  disabled = false,
  onSuccess,
  buttonLabel,
  className,
  size = "medium",
  fullWidth = false,
}) {
  const [fbAppId, setFbAppId] = useState(DEFAULT_FACEBOOK_APP_ID);
  const [busy, setBusy] = useState(false);
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [instagramAppId, setInstagramAppId] = useState(ENV_INSTAGRAM_APP_ID);
  const unsubRef = useRef(null);
  const isInstagram = channel === "instagram";
  const label =
    buttonLabel ||
    (isInstagram ? "Conectar Instagram" : "Conectar com Facebook");

  useEffect(() => {
    return () => {
      if (typeof unsubRef.current === "function") unsubRef.current();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/instagram/oauth-config");
        if (!cancelled) {
          if (data?.facebookAppId) {
            setFbAppId(String(data.facebookAppId).trim());
          }
          if (data?.appId) {
            setInstagramAppId(String(data.appId).trim());
          }
        }
      } catch (err) {
        console.warn("[Connections] /instagram/oauth-config", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isInstagram]);

  if (!fbAppId) {
    return (
      <Typography variant="body2" color="textSecondary">
        Configure REACT_APP_FACEBOOK_APP_ID no .env do frontend.
      </Typography>
    );
  }

  /**
   * Instagram Login em popup — abre /oauth/authorize direto (force_reauth).
   * Popup troca o code e cria a conexão; o pai só atualiza a lista.
   */
  const startInstagramLoginPopup = (clientIdOverride) => {
    const clientId = String(clientIdOverride || instagramAppId || "").trim();
    if (!clientId) {
      setInfoModalOpen(true);
      return;
    }

    const redirectUri = `${window.location.origin}/connections/instagram-oauth`;
    const url = buildInstagramAuthorizeUrl(
      clientId,
      redirectUri,
      META_INSTAGRAM_BUSINESS_LOGIN_SCOPES
    );
    setBusy(true);

    if (typeof unsubRef.current === "function") unsubRef.current();

    let popupRef = null;
    let finished = false;
    let storagePoll = null;
    let popupWatch = null;
    let storageGraceTimer = null;

    const cleanupTimers = () => {
      if (storagePoll) clearInterval(storagePoll);
      if (popupWatch) clearInterval(popupWatch);
      if (storageGraceTimer) clearTimeout(storageGraceTimer);
      storagePoll = null;
      popupWatch = null;
      storageGraceTimer = null;
    };

    const closePopupSafe = () => {
      try {
        if (popupRef && !popupRef.closed) {
          popupRef.close();
        }
      } catch {
        // ignore
      }
    };

    const finishOk = async (data) => {
      if (finished) return;
      finished = true;
      cleanupTimers();
      closePopupSafe();
      toast.success(
        data?.subscribe?.ok
          ? "Instagram Login conectado. Envie um DM de teste de outra conta."
          : "Instagram conectado. Confira webhooks / Reparar DMs se a DM não aparecer.",
        { autoClose: 10000 }
      );
      if (typeof onSuccess === "function") {
        try {
          await onSuccess(data);
        } catch {
          // ignore navigation errors
        }
      }
      await repairMetaConnection("instagram");
      setBusy(false);
      try {
        localStorage.removeItem("vbsolution_ig_oauth_popup_active");
        localStorage.removeItem(IG_OAUTH_RESULT_KEY);
      } catch {
        // ignore
      }
    };

    const finishErr = (msg) => {
      if (finished) return;
      finished = true;
      cleanupTimers();
      closePopupSafe();
      toast.error(msg || loginCancelledMessage(), { autoClose: 9000 });
      setBusy(false);
      try {
        localStorage.removeItem("vbsolution_ig_oauth_popup_active");
        localStorage.removeItem(IG_OAUTH_RESULT_KEY);
      } catch {
        // ignore
      }
    };

    unsubRef.current = subscribeInstagramOAuthCallback(async (payload) => {
      try {
        if (payload?.error || payload?.ok === false) {
          finishErr(payload?.error || loginCancelledMessage());
          return;
        }
        // Popup já criou a conexão (fluxo definitivo).
        if (payload?.ok === true) {
          await finishOk(payload.data || payload);
          return;
        }
        // Legado: só code — pai troca (fallback).
        if (payload?.code) {
          const { data } = await api.post("/instagram/login", {
            code: payload.code,
            redirectUri,
          });
          await finishOk(data);
          return;
        }
        finishErr(loginCancelledMessage());
      } catch (error) {
        if (!finished) {
          toastError(error);
          finished = true;
          cleanupTimers();
          closePopupSafe();
          setBusy(false);
        }
      }
    });

    try {
      localStorage.removeItem(IG_OAUTH_RESULT_KEY);
    } catch {
      // ignore
    }

    // Fallback COOP: NÃO cancelar o poll quando o popup fecha — o resultado
    // pode chegar no localStorage milissegundos depois do close.
    storagePoll = setInterval(() => {
      if (finished) {
        cleanupTimers();
        return;
      }
      try {
        const raw = localStorage.getItem(IG_OAUTH_RESULT_KEY);
        if (!raw) return;
        localStorage.removeItem(IG_OAUTH_RESULT_KEY);
        const payload = JSON.parse(raw);
        window.dispatchEvent(
          new MessageEvent("message", {
            data: { type: "instagram-oauth-callback", ...payload },
            origin: window.location.origin,
          })
        );
      } catch {
        // ignore
      }
    }, 400);

    const opened = openInstagramOAuthPopup(url);
    if (!opened?.ok) {
      cleanupTimers();
      setBusy(false);
      toast.error(
        "Popup bloqueado. Permita popups para este site e tente de novo.",
        { autoClose: 9000 }
      );
      return;
    }

    toast.info(
      "Janela do Instagram: autorize o app e escolha a conta Business. Depois a conexão é criada automaticamente.",
      { autoClose: 9000 }
    );

    popupRef = opened.popup || null;

    popupWatch = setInterval(() => {
      if (!opened.popup?.closed) return;
      clearInterval(popupWatch);
      popupWatch = null;
      // Mantém o poll do localStorage por mais 8s após fechar (race fix).
      storageGraceTimer = setTimeout(() => {
        if (!finished) {
          cleanupTimers();
          setBusy(false);
          try {
            localStorage.removeItem("vbsolution_ig_oauth_popup_active");
          } catch {
            // ignore
          }
        }
      }, 8000);
    }, 500);
  };

  const handleFacebookStyleCallback = (response) => {
    if (!response?.accessToken) {
      setBusy(false);
      toast.error(loginCancelledMessage(), { autoClose: 7000 });
      return;
    }

    setBusy(true);
    api
      .post("/facebook", {
        facebookUserId: response.userID || response.id,
        facebookUserToken: response.accessToken,
        ...(isInstagram ? { addInstagram: true } : {}),
      })
      .then(async ({ data }) => {
        const count = Array.isArray(data) ? data.length : data?.count || 0;
        if (!count) {
          toast.error(
            isInstagram
              ? "Login ok, mas o Instagram Business não foi encontrado na Página. Vincule o IG em Facebook → Linked accounts."
              : "Login ok, mas nenhuma Página do Facebook foi salva. Verifique se a conta é admin de uma fan page."
          );
          return;
        }
        toast.success(
          isInstagram
            ? "Conexão via Página salva. Para DMs de clientes com permissões instagram_business_*, prefira Instagram Login."
            : "Facebook conectado.",
          { autoClose: 9000 }
        );
        if (typeof onSuccess === "function") onSuccess(data);
        await repairMetaConnection(isInstagram ? "instagram" : "facebook");
      })
      .catch((error) => {
        const msg = String(
          error?.response?.data?.error || error?.message || ""
        ).toLowerCase();
        if (
          msg.includes("página") ||
          msg.includes("page") ||
          msg.includes("instagram")
        ) {
          toast.error(
            isInstagram
              ? "Vincule o Instagram Business a uma Página do Facebook e tente novamente."
              : noPageMessage(),
            { autoClose: 7000 }
          );
        } else {
          toastError(error);
        }
      })
      .finally(() => setBusy(false));
  };

  const loginScope = isInstagram
    ? META_INSTAGRAM_LOGIN_SCOPE
    : META_FACEBOOK_LOGIN_SCOPE;

  return (
    <>
      <FacebookLogin
        appId={fbAppId}
        autoLoad={false}
        fields="name,email,picture"
        version="20.0"
        disableMobileRedirect
        redirectUri={
          typeof window !== "undefined" ? window.location.origin : undefined
        }
        scope={loginScope}
        callback={handleFacebookStyleCallback}
        render={(renderProps) => (
          <Button
            color="primary"
            variant="contained"
            disableElevation
            size={size}
            fullWidth={fullWidth}
            className={className}
            disabled={disabled || busy || renderProps.isProcessing}
            onClick={(e) => {
              setBusy(true);
              renderProps.onClick(e);
            }}
            startIcon={
              busy ? <CircularProgress size={16} color="inherit" /> : null
            }
          >
            {busy ? "Aguardando autorização…" : label}
          </Button>
        )}
      />

      {isInstagram && (
        <Box mt={1} textAlign="center">
          <Typography
            variant="caption"
            color="textSecondary"
            style={{ cursor: "pointer", textDecoration: "underline", fontSize: "0.75rem", display: "inline-block" }}
            onClick={() => setInfoModalOpen(true)}
          >
            Como conectar o Instagram? Clique para ver instruções
          </Typography>
        </Box>
      )}

      <Dialog
        open={infoModalOpen}
        onClose={() => setInfoModalOpen(false)}
        maxWidth="sm"
        fullWidth
        aria-labelledby="instagram-config-info-title"
      >
        <DialogTitle id="instagram-config-info-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <InfoIcon color="primary" />
          Conexão Oficial do Instagram (Meta)
        </DialogTitle>
        <DialogContent dividers>
          <Box mb={2}>
            <Typography variant="subtitle1" style={{ fontWeight: 600, color: "#1976d2", marginBottom: 6 }}>
              Como conectar sua conta do Instagram
            </Typography>
            <Typography variant="body2" color="textSecondary" paragraph>
              Para receber e responder mensagens do Instagram pelo CRM, a Meta exige que sua conta do Instagram seja <strong>Profissional (Comercial ou Criador de Conteúdo)</strong> e esteja vinculada a uma <strong>Página do Facebook</strong>.
            </Typography>
          </Box>

          <Divider style={{ margin: "12px 0" }} />

          <Typography variant="subtitle2" style={{ fontWeight: 700, marginBottom: 8 }}>
            Passo a passo rápido (1 minuto):
          </Typography>

          <Box component="ol" style={{ paddingLeft: 20, margin: "0 0 16px 0", fontSize: "0.875rem", lineHeight: 1.6, color: "#374151" }}>
            <li style={{ marginBottom: 8 }}>
              <strong>1. Conta Profissional:</strong><br />
              No app do Instagram: <em>Configurações → Tipo de conta e ferramentas → Mudar para conta profissional</em>.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>2. Vincular à Página do Facebook:</strong><br />
              No Facebook pelo navegador, acesse sua <em>Página → Configurações → Contas vinculadas → Instagram → Conectar conta</em>.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>3. Permitir Acesso às Mensagens:</strong><br />
              No app do Instagram no celular: <em>Configurações → Mensagens e respostas a stories → Ferramentas conectadas → Permitir acesso às mensagens</em> (deve estar <strong>Ativado</strong>).
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>4. Conectar no CRM:</strong><br />
              Clique no botão azul <strong>«Conectar Instagram»</strong> acima e faça login com seu Facebook. Selecione sua Página e a conta do Instagram correspondente!
            </li>
          </Box>

          <Box p={1.5} style={{ backgroundColor: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0", marginBottom: 12 }}>
            <Typography variant="caption" style={{ color: "#166534", display: "block" }}>
              💡 <strong>Importante:</strong> Se sua conta já está vinculada à sua Página do Facebook, basta clicar no botão <strong>«Conectar Instagram»</strong> e autorizar. A conexão é criada automaticamente!
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInfoModalOpen(false)} color="primary" variant="contained">
            Entendido
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
