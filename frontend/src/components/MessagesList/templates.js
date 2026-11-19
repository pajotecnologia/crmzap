import React, { useMemo, useState } from "react";
import { makeStyles } from "@material-ui/core/styles";
import { FileCopyOutlined, GetApp, Language, Phone } from "@material-ui/icons";
import MarkdownWrapper from "../MarkdownWrapper";

const useStyles = makeStyles((theme) => {
  const isDark = theme.palette.type === "dark";
  return {
    root: {
      minWidth: 180,
      maxWidth: 280
    },
    headerText: {
      fontWeight: 650,
      fontSize: "0.85rem",
      marginBottom: 4,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word"
    },
    bodyText: {
      whiteSpace: "pre-wrap",
      wordBreak: "break-word"
    },
    footer: {
      fontSize: "0.72rem",
      color: theme.palette.text.secondary,
      marginTop: 6,
      whiteSpace: "pre-wrap"
    },
    media: {
      width: "100%",
      maxHeight: 240,
      objectFit: "cover",
      borderRadius: 8,
      marginBottom: 8,
      display: "block",
      background: isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.04)"
    },
    doc: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
      padding: "8px 10px",
      borderRadius: 8,
      textDecoration: "none",
      color: "inherit",
      border: isDark
        ? "1px solid rgba(255,255,255,0.12)"
        : "1px solid rgba(15,23,42,0.1)",
      background: isDark ? "rgba(255,255,255,0.04)" : "#fff"
    },
    btn: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      width: "100%",
      marginTop: 6,
      padding: "8px 10px",
      borderRadius: 8,
      border: isDark
        ? "1px solid rgba(255,255,255,0.12)"
        : "1px solid rgba(15,23,42,0.1)",
      background: "transparent",
      color: "#0b8ec4",
      fontWeight: 650,
      fontSize: "0.8rem",
      cursor: "pointer",
      textDecoration: "none",
      textAlign: "center",
      "&:hover": {
        background: isDark ? "rgba(11,142,196,0.15)" : "rgba(11,142,196,0.08)"
      }
    },
    error: {
      marginTop: 8,
      fontSize: "0.72rem",
      color: "#ef4444",
      whiteSpace: "pre-wrap"
    },
    missing: {
      marginBottom: 8,
      fontSize: "0.75rem",
      color: theme.palette.text.secondary
    }
  };
});

function parseJson(value) {
  if (value == null || value === "") return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function flattenButtons(raw) {
  let current = raw;
  for (let i = 0; i < 3; i += 1) {
    if (Array.isArray(current)) {
      if (current.length === 1 && typeof current[0] === "string") {
        current = current[0];
        continue;
      }
      return current.flatMap((item) => {
        if (typeof item === "string") {
          const parsed = parseJson(item);
          return Array.isArray(parsed) ? parsed : [];
        }
        return item && typeof item === "object" ? [item] : [];
      });
    }
    if (typeof current === "string") {
      current = parseJson(current);
      continue;
    }
    break;
  }
  return [];
}

function safeHttpUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    ["access_token", "token", "signature"].forEach((key) =>
      parsed.searchParams.delete(key)
    );
    return parsed.toString();
  } catch {
    return null;
  }
}

function safeTel(phone) {
  const cleaned = String(phone || "").replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  return `tel:${cleaned}`;
}

function legacyView(message) {
  const raw = String(message?.body || "");
  const splitAt = raw.indexOf("||||");
  const text = splitAt >= 0 ? raw.slice(0, splitAt) : raw;
  const buttonsRaw = splitAt >= 0 ? raw.slice(splitAt + 4) : "";
  const buttons = flattenButtons(buttonsRaw).map((button, index) => ({
    type: String(button?.type || "QUICK_REPLY").toUpperCase(),
    text: button?.text || `Botão ${index + 1}`,
    url: button?.url || "",
    phone: button?.phone_number || button?.phone || "",
    copyCode: Array.isArray(button?.example) ? button.example[0] : button?.example,
    index
  }));
  const urlMatch = text.match(/https?:\/\/[^\s]+/i);
  const mediaUrl = urlMatch ? safeHttpUrl(urlMatch[0]) : null;
  let format = null;
  if (mediaUrl && /\.(jpe?g|png|gif|webp)(\?|$)/i.test(mediaUrl)) format = "IMAGE";
  else if (mediaUrl && /\.(mp4|3gp|webm)(\?|$)/i.test(mediaUrl)) format = "VIDEO";
  else if (mediaUrl && /\.(pdf|docx?|xlsx?|pptx?|txt)(\?|$)/i.test(mediaUrl)) {
    format = "DOCUMENT";
  }
  return {
    header: format
      ? {
          format,
          media: {
            kind: format.toLowerCase(),
            url: mediaUrl,
            filename: mediaUrl.split("/").pop()
          }
        }
      : null,
    body: format ? text.replace(urlMatch[0], "").trim() : text.trim(),
    footer: null,
    buttons,
    sendError: null
  };
}

function readView(message) {
  const parsed = parseJson(message?.dataJson);
  if (parsed?.metaTemplate && typeof parsed.metaTemplate === "object") {
    return parsed.metaTemplate;
  }
  const legacy = legacyView(message);
  if (parsed?.sendError) legacy.sendError = parsed.sendError;
  return legacy;
}

const Template = ({ message }) => {
  const classes = useStyles();
  const view = useMemo(() => readView(message), [message]);
  const [mediaFailed, setMediaFailed] = useState(false);
  const header = view?.header;
  const media = header?.media;
  const localUrl =
    media?.localFile && message?.mediaUrl ? message.mediaUrl : null;
  const remoteUrl = media?.url ? safeHttpUrl(media.url) : null;
  const src = localUrl || remoteUrl || null;
  const sendError = view?.sendError;
  const failed = message?.ack === -1 || Boolean(sendError);

  const openQuickReply = (label) => {
    const text = String(label || "").trim();
    if (!text) return;
    window.dispatchEvent(
      new CustomEvent("fillComposerMessage", {
        detail: { text, send: false }
      })
    );
  };

  const copyCode = async (code) => {
    const value = String(code || "").trim();
    if (!value || !navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className={classes.root}>
      {header?.format === "IMAGE" && src && !mediaFailed ? (
        <img
          src={src}
          alt=""
          className={classes.media}
          onError={() => setMediaFailed(true)}
        />
      ) : null}
      {header?.format === "VIDEO" && src && !mediaFailed ? (
        <video
          src={src}
          controls
          className={classes.media}
          onError={() => setMediaFailed(true)}
        />
      ) : null}
      {header?.format === "DOCUMENT" ? (
        src ? (
          <a
            className={classes.doc}
            href={src}
            target="_blank"
            rel="noopener noreferrer"
          >
            <GetApp fontSize="small" />
            <span>{media?.filename || "Documento"}</span>
          </a>
        ) : (
          <div className={classes.missing}>
            {media?.filename || "Documento enviado"}
          </div>
        )
      ) : null}
      {["IMAGE", "VIDEO"].includes(header?.format) && (!src || mediaFailed) ? (
        <div className={classes.missing}>
          {mediaFailed
            ? "Não foi possível carregar a mídia deste template."
            : "Mídia do template enviada."}
        </div>
      ) : null}
      {header?.format === "TEXT" && header?.text ? (
        <div className={classes.headerText}>{header.text}</div>
      ) : null}
      {view?.body ? (
        <div className={classes.bodyText}>
          <MarkdownWrapper>{view.body}</MarkdownWrapper>
        </div>
      ) : null}
      {view?.footer ? <div className={classes.footer}>{view.footer}</div> : null}
      {(view?.buttons || []).map((button, index) => {
        const type = String(button?.type || "").toUpperCase();
        const label = button?.text || `Botão ${index + 1}`;
        const key = `${type}-${button?.index ?? index}`;
        if (type === "URL") {
          const href = safeHttpUrl(button?.url);
          if (!href) {
            return (
              <div key={key} className={classes.btn} style={{ cursor: "default" }}>
                <Language fontSize="small" /> {label}
              </div>
            );
          }
          return (
            <a
              key={key}
              className={classes.btn}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Language fontSize="small" /> {label}
            </a>
          );
        }
        if (type === "PHONE_NUMBER" || type === "VOICE_CALL") {
          const href = safeTel(button?.phone);
          if (!href) {
            return (
              <div key={key} className={classes.btn} style={{ cursor: "default" }}>
                <Phone fontSize="small" /> {label}
              </div>
            );
          }
          return (
            <a key={key} className={classes.btn} href={href}>
              <Phone fontSize="small" /> {label}
            </a>
          );
        }
        if (type === "COPY_CODE") {
          return (
            <button
              key={key}
              type="button"
              className={classes.btn}
              onClick={() => copyCode(button?.copyCode)}
            >
              <FileCopyOutlined fontSize="small" /> {label}
            </button>
          );
        }
        return (
          <button
            key={key}
            type="button"
            className={classes.btn}
            title="Resposta rápida do template"
            onClick={() => openQuickReply(label)}
          >
            {label}
          </button>
        );
      })}
      {failed ? (
        <div className={classes.error}>
          {sendError?.message || "A Meta não entregou este template."}
          {sendError?.code ? ` (${sendError.code})` : ""}
        </div>
      ) : null}
    </div>
  );
};

export default Template;
