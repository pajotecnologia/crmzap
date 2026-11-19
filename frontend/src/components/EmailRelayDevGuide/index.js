import React, { useState } from "react";
import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
  Typography,
} from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import { Close, FileCopyOutlined, InfoOutlined } from "@material-ui/icons";
import { toast } from "react-toastify";

const FONT =
  '"Helvetica Neue", Helvetica, -apple-system, BlinkMacSystemFont, sans-serif';

const useStyles = makeStyles((theme) => {
  const isDark = theme.palette.type === "dark";
  const border = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)";
  return {
    paper: {
      borderRadius: 16,
      maxWidth: 760,
    },
    title: {
      fontFamily: FONT,
      fontWeight: 600,
      fontSize: 18,
      letterSpacing: "-0.02em",
      paddingRight: 48,
    },
    subtitle: {
      fontFamily: FONT,
      fontSize: 13,
      color: theme.palette.text.secondary,
      marginTop: 4,
      fontWeight: 400,
    },
    close: {
      position: "absolute",
      right: theme.spacing(1),
      top: theme.spacing(1),
    },
    intro: {
      display: "flex",
      gap: theme.spacing(1.25),
      padding: theme.spacing(1.5, 1.75),
      borderRadius: 12,
      border: `1px solid ${border}`,
      background: isDark ? "rgba(59,130,246,0.10)" : "rgba(59,130,246,0.06)",
      marginBottom: theme.spacing(2),
      fontFamily: FONT,
      fontSize: 13,
      lineHeight: 1.55,
    },
    introIcon: {
      color: theme.palette.primary.main,
      fontSize: 20,
      marginTop: 1,
      flexShrink: 0,
    },
    step: {
      display: "flex",
      gap: theme.spacing(1.5),
      position: "relative",
      paddingBottom: theme.spacing(2),
      "&:not(:last-child)::before": {
        content: '""',
        position: "absolute",
        left: 15,
        top: 34,
        bottom: 4,
        width: 2,
        background: border,
      },
    },
    stepNumber: {
      width: 32,
      height: 32,
      borderRadius: "50%",
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: FONT,
      fontWeight: 600,
      fontSize: 14,
      color: "#fff",
      background: theme.palette.primary.main,
    },
    stepBody: {
      flex: 1,
      minWidth: 0,
      padding: theme.spacing(1.25, 1.5),
      borderRadius: 12,
      border: `1px solid ${border}`,
      background: isDark ? "rgba(255,255,255,0.03)" : "#fff",
    },
    stepTitle: {
      fontFamily: FONT,
      fontWeight: 600,
      fontSize: 14,
      marginBottom: 4,
    },
    stepText: {
      fontFamily: FONT,
      fontSize: 13,
      lineHeight: 1.6,
      color: theme.palette.text.secondary,
      "& code": {
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: 12,
        padding: "1px 6px",
        borderRadius: 6,
        background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
        color: theme.palette.text.primary,
      },
      "& ul": {
        margin: theme.spacing(0.5, 0, 0),
        paddingLeft: theme.spacing(2.25),
      },
      "& li": {
        marginBottom: 2,
      },
    },
    code: {
      position: "relative",
      marginTop: theme.spacing(1),
      padding: theme.spacing(1.25, 5, 1.25, 1.5),
      borderRadius: 10,
      background: isDark ? "#0d1117" : "#0f172a",
      color: "#e2e8f0",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: 12.5,
      lineHeight: 1.6,
      whiteSpace: "pre-wrap",
      wordBreak: "break-all",
    },
    copyBtn: {
      position: "absolute",
      top: 6,
      right: 6,
      color: "rgba(226,232,240,0.75)",
      "&:hover": { color: "#fff" },
    },
    hostChips: {
      display: "flex",
      flexWrap: "wrap",
      gap: theme.spacing(0.75),
      marginTop: theme.spacing(1),
    },
    chip: {
      fontFamily: FONT,
      fontSize: 12,
    },
    sectionLabel: {
      fontFamily: FONT,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: theme.palette.text.secondary,
      margin: theme.spacing(0.5, 0, 1.25),
    },
  };
});

function CodeBlock({ children }) {
  const classes = useStyles();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(children));
      toast.success("Copiado!");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };
  return (
    <Box className={classes.code}>
      {children}
      <Tooltip title="Copiar">
        <IconButton size="small" className={classes.copyBtn} onClick={copy}>
          <FileCopyOutlined style={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

function Step({ number, title, children }) {
  const classes = useStyles();
  return (
    <Box className={classes.step}>
      <Box className={classes.stepNumber}>{number}</Box>
      <Box className={classes.stepBody}>
        <Typography className={classes.stepTitle}>{title}</Typography>
        <Box className={classes.stepText}>{children}</Box>
      </Box>
    </Box>
  );
}

const ENV_SNIPPET = `EMAIL_SMTP_RELAY_URL=https://seu-worker.vercel.app
EMAIL_SMTP_RELAY_SECRET=cole_aqui_o_mesmo_segredo_do_worker`;

const HOSTS = {
  vps: {
    label: "VPS (Hostinger, Contabo, DigitalOcean…)",
    content: (
      <>
        Acesse o servidor por SSH, edite o arquivo <code>backend/.env</code> e
        adicione as duas variáveis. Depois reinicie o backend:
        <CodeBlock>{`nano backend/.env
# cole as variáveis, salve (Ctrl+O) e saia (Ctrl+X)
pm2 restart all   # ou: docker compose restart backend`}</CodeBlock>
      </>
    ),
  },
  hostgator: {
    label: "HostGator / cPanel",
    content: (
      <>
        No cPanel, abra <strong>Setup Node.js App</strong>, selecione a
        aplicação do backend e, em <strong>Environment variables</strong>,
        clique em <strong>Add variable</strong> para cada uma. Salve e clique
        em <strong>Restart</strong>.
      </>
    ),
  },
  railway: {
    label: "Railway",
    content: (
      <>
        No projeto, abra o serviço do backend → aba <strong>Variables</strong>{" "}
        → <strong>New Variable</strong> (ou <strong>Raw Editor</strong> e cole o
        bloco acima). O Railway faz o redeploy automaticamente.
      </>
    ),
  },
  render: {
    label: "Render / Fly.io / outros",
    content: (
      <>
        Procure a seção <strong>Environment</strong> ou{" "}
        <strong>Secrets</strong> do serviço do backend, crie as duas variáveis
        e faça um novo deploy/restart do serviço.
      </>
    ),
  },
};

export default function EmailRelayDevGuide({ open, onClose }) {
  const classes = useStyles();
  const [host, setHost] = useState("vps");

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      scroll="paper"
      classes={{ paper: classes.paper }}
    >
      <DialogTitle disableTypography className={classes.title}>
        Para Desenvolvedores — Relay SMTP
        <Typography className={classes.subtitle}>
          Como garantir o envio de e-mails quando a hospedagem bloqueia SMTP
        </Typography>
        <IconButton
          className={classes.close}
          onClick={onClose}
          size="small"
          aria-label="Fechar"
        >
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Box className={classes.intro}>
          <InfoOutlined className={classes.introIcon} />
          <span>
            Muitas hospedagens (Railway, alguns planos de VPS e hospedagens
            compartilhadas) bloqueiam as portas SMTP <code>25</code>,{" "}
            <code>465</code> e <code>587</code>. O relay é um pequeno worker
            HTTPS: o backend envia o e-mail para ele pela porta 443 e o worker
            faz a conexão SMTP real com Gmail, Outlook ou o seu provedor. As
            credenciais SMTP continuam sendo as cadastradas em{" "}
            <strong>Integrações → E-mail</strong>.
          </span>
        </Box>

        <Typography className={classes.sectionLabel}>Passo a passo</Typography>

        <Step number={1} title="Gere um segredo forte">
          Esse valor protege o worker. Ele será usado no worker e no backend
          (os dois precisam ser idênticos):
          <CodeBlock>{`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`}</CodeBlock>
        </Step>

        <Step number={2} title="Publique o worker de e-mail">
          O código do worker já vem no projeto, na pasta{" "}
          <code>vercel-email-worker</code>. Na Vercel (ou na hospedagem do seu
          frontend que rode funções Node.js):
          <ul>
            <li>
              <strong>Add New → Project</strong> e importe o repositório.
            </li>
            <li>
              <strong>Root Directory:</strong> <code>vercel-email-worker</code>{" "}
              · <strong>Framework Preset:</strong> <code>Other</code>.
            </li>
            <li>
              Em <strong>Environment Variables</strong>, crie a variável abaixo
              com o segredo do passo 1 e clique em <strong>Deploy</strong>.
            </li>
          </ul>
          <CodeBlock>{`EMAIL_SMTP_RELAY_SECRET=cole_aqui_o_segredo_do_passo_1`}</CodeBlock>
        </Step>

        <Step number={3} title="Confirme que o worker está no ar">
          Copie a URL pública do deploy e abra no navegador o endpoint de
          saúde. A resposta deve ser <code>{`{ "ok": true }`}</code>:
          <CodeBlock>{`https://seu-worker.vercel.app/api/health`}</CodeBlock>
        </Step>

        <Step number={4} title="Aponte o backend para o relay">
          Crie estas duas variáveis de ambiente no servidor onde o{" "}
          <strong>backend</strong> está hospedado:
          <CodeBlock>{ENV_SNIPPET}</CodeBlock>
          <Box className={classes.hostChips}>
            {Object.entries(HOSTS).map(([key, item]) => (
              <Chip
                key={key}
                label={item.label}
                size="small"
                clickable
                color={host === key ? "primary" : "default"}
                variant={host === key ? "default" : "outlined"}
                className={classes.chip}
                onClick={() => setHost(key)}
              />
            ))}
          </Box>
          <Box mt={1.25}>{HOSTS[host].content}</Box>
        </Step>

        <Step number={5} title="Reinicie e teste o envio">
          Com o backend reiniciado, cadastre (ou edite) a conexão em{" "}
          <strong>Integrações → E-mail</strong> com o servidor SMTP, a porta e
          a senha de app. A partir daí, todo envio passa automaticamente pelo
          relay. Se as variáveis não existirem, o sistema tenta o SMTP direto.
        </Step>
      </DialogContent>
    </Dialog>
  );
}
