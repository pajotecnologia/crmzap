import React, { useEffect, useState, useContext, useCallback } from "react";
import QRCode from "qrcode.react";
import toastError from "../../errors/toastError";
import { makeStyles } from "@material-ui/core/styles";
import { Dialog, DialogContent, Paper, Typography, CircularProgress, Button } from "@material-ui/core";
import RefreshIcon from "@material-ui/icons/Refresh";
import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import { AuthContext } from "../../context/Auth/AuthContext";
import openSocket from "socket.io-client";
import { getBackendUrl } from "../../config";
import { isLocalMode, createLocalSocket } from "../../services/localMode";

const useStyles = makeStyles((theme) => ({
  root: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    maxWidth: "100%",
    padding: theme.spacing(2),
    boxSizing: "border-box",
    [theme.breakpoints.down("xs")]: {
      padding: 0,
    },
  },
  dialogPaper: {
    minWidth: 320,
    maxWidth: 400,
    width: "100%",
    padding: theme.spacing(2),
    margin: 0,
    overflowX: "hidden",
    [theme.breakpoints.down("xs")]: {
      minWidth: 0,
      padding: theme.spacing(1),
    },
  },
  content: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: theme.spacing(3),
    overflowX: "hidden",
    boxSizing: "border-box",
    width: "100%",
  },
  innerWrap: {
    width: "100%",
    maxWidth: "100%",
    backgroundColor: "transparent",
    boxShadow: "none",
  },
  qrCodeContainer: {
    padding: theme.spacing(3),
    backgroundColor: "white",
    borderRadius: theme.shape.borderRadius,
    marginTop: theme.spacing(2),
    maxWidth: "100%",
    boxSizing: "border-box",
    overflow: "hidden",
    [theme.breakpoints.down("xs")]: {
      padding: theme.spacing(1.5),
      marginTop: theme.spacing(1),
    },
  },
  loadingWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing(2),
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  loadingText: {
    marginTop: theme.spacing(1),
    color: theme.palette.text.secondary,
    fontSize: "0.95rem",
    maxWidth: 280,
  },
  retryButton: {
    marginTop: theme.spacing(1.5),
    textTransform: "none",
  },
}));

const QrcodeModal = ({ open, onClose, whatsAppId, companyId }) => {
  const classes = useStyles();
  const [qrCode, setQrCode] = useState("");
  const [isRetrying, setIsRetrying] = useState(false);
  const [showRetry, setShowRetry] = useState(false);
  const { user, socket: globalSocket } = useContext(AuthContext);
  const [socket, setSocket] = useState(globalSocket);

  const handleRequestNewQr = useCallback(async () => {
    if (!whatsAppId || isRetrying) return;
    try {
      setIsRetrying(true);
      setQrCode("");
      await api.put(`/whatsappsession/${whatsAppId}`);
    } catch (err) {
      toastError(err);
    } finally {
      setIsRetrying(false);
    }
  }, [whatsAppId, isRetrying]);

  useEffect(() => {
    if (!open) {
      setShowRetry(false);
      return;
    }

    const timer = setTimeout(() => {
      setShowRetry(true);
    }, 7000);

    return () => clearTimeout(timer);
  }, [open, qrCode]);

  useEffect(() => {
    if (!open) return;

    if (companyId && user.companyId && Number(companyId) !== Number(user.companyId)) {
      const token = localStorage.getItem("token");
      const newSocket = isLocalMode()
        ? createLocalSocket()
        : openSocket(`${getBackendUrl()}/${companyId}`, {
            query: { token }
          });

      setSocket(newSocket);

      return () => {
        newSocket.disconnect();
      };
    } else {
      setSocket(globalSocket);
    }
  }, [open, companyId, user.companyId, globalSocket]);

  useEffect(() => {
    const fetchSession = async () => {
      if (!whatsAppId) return;

      try {
        const { data } = await api.get(`/whatsapp/${whatsAppId}`);
        if (data.qrcode) {
          setQrCode(data.qrcode);
        }
      } catch (err) {
        toastError(err);
      }
    };
    fetchSession();
  }, [whatsAppId]);

  useEffect(() => {
    if (!whatsAppId || !socket) return;
    const socketCompanyId = companyId || user.companyId;

    const onWhatsappData = (data) => {
      if (data.action === "update" && data.session && Number(data.session.id) === Number(whatsAppId)) {
        if (data.session.qrcode) {
          setQrCode(data.session.qrcode);
        }
        if (data.session.status === "CONNECTED") {
          onClose();
        }
      }
    };
    
    socket.on(`company-${socketCompanyId}-whatsappSession`, onWhatsappData);

    return () => {
      socket.off(`company-${socketCompanyId}-whatsappSession`, onWhatsappData);
    };
  }, [whatsAppId, onClose, user.companyId, companyId, socket]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      classes={{ paper: classes.dialogPaper }}
      aria-labelledby="qr-code-dialog"
    >
      <DialogContent className={classes.content}>
        <Paper elevation={0} className={classes.innerWrap}>
          <Typography variant="h6" color="primary" gutterBottom>
            {i18n.t("qrCode.message")}
          </Typography>
          <div className={classes.root}>
            {qrCode ? (
              <div className={classes.qrCodeContainer}>
                <QRCode
                  value={qrCode}
                  size={280}
                  style={{ maxWidth: "100%", height: "auto", display: "block" }}
                />
              </div>
            ) : (
              <div className={classes.loadingWrap}>
                <CircularProgress size={36} color="primary" />
                <Typography variant="body2" className={classes.loadingText}>
                  {i18n.t("qrCode.waiting")}
                </Typography>
                {showRetry && (
                  <Button
                    size="small"
                    variant="outlined"
                    color="primary"
                    startIcon={<RefreshIcon />}
                    onClick={handleRequestNewQr}
                    disabled={isRetrying}
                    className={classes.retryButton}
                  >
                    {isRetrying ? "Gerando..." : "Gerar novo QR Code"}
                  </Button>
                )}
              </div>
            )}
          </div>
        </Paper>
      </DialogContent>
    </Dialog>
  );
};

export default React.memo(QrcodeModal);