import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Divider,
  List,
  ListItem,
  ListItemText,
  Popover,
  TextField,
  Typography,
  makeStyles
} from "@material-ui/core";
import SearchIcon from "@material-ui/icons/Search";
import WhatsApp from "@material-ui/icons/WhatsApp";

const useStyles = makeStyles((theme) => {
  const isDark = theme.palette.type === "dark";
  return {
    paper: {
      width: 360,
      maxWidth: "calc(100vw - 16px)",
      maxHeight: "min(72vh, 560px)",
      display: "flex",
      flexDirection: "column",
      borderRadius: 12,
      overflow: "hidden",
      boxShadow: isDark
        ? "0 12px 40px rgba(0,0,0,0.5)"
        : "0 12px 32px rgba(15,23,42,0.14)",
      border: isDark
        ? "1px solid rgba(255,255,255,0.08)"
        : "1px solid rgba(15,23,42,0.08)"
    },
    header: {
      padding: theme.spacing(1.25, 1.5, 1),
      flexShrink: 0
    },
    title: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      fontWeight: 500,
      fontSize: "0.82rem",
      color: "#25D366"
    },
    hint: {
      fontSize: "0.68rem",
      marginTop: 4,
      color: theme.palette.text.secondary,
      lineHeight: 1.35
    },
    body: {
      padding: theme.spacing(1, 1.5, 1),
      overflowY: "auto",
      flex: 1
    },
    searchContainer: {
      display: "flex",
      alignItems: "center",
      marginBottom: theme.spacing(1),
      gap: 6
    },
    searchInput: {
      flex: 1,
      "& .MuiOutlinedInput-input": { padding: "10px 12px", fontSize: "0.8rem" }
    },
    templateItem: {
      borderRadius: 8,
      marginBottom: 6,
      paddingTop: 8,
      paddingBottom: 8,
      backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.03)",
      "&:hover": {
        backgroundColor: isDark
          ? "rgba(37,211,102,0.1)"
          : "rgba(37,211,102,0.08)"
      }
    },
    templateInfo: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 8
    },
    actions: {
      display: "flex",
      justifyContent: "flex-end",
      gap: 8,
      padding: theme.spacing(1, 1.5, 1.25),
      borderTop: isDark
        ? "1px solid rgba(255,255,255,0.08)"
        : "1px solid rgba(15,23,42,0.08)",
      flexShrink: 0
    },
    field: { marginBottom: 10 },
    meta: {
      fontSize: "0.68rem",
      color: theme.palette.text.secondary,
      marginBottom: 8,
      lineHeight: 1.4
    },
    error: {
      color: "#ef4444",
      fontSize: "0.72rem",
      marginTop: 6
    }
  };
});

const ACCEPT = {
  image: "image/jpeg,image/png,.jpg,.jpeg,.png",
  video: "video/mp4,video/3gpp,.mp4,.3gp",
  document: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
};

function parseButtons(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function placeholders(text) {
  const found = [];
  const regex = /\{\{\s*([^{}]+?)\s*\}\}/g;
  let match;
  while ((match = regex.exec(String(text || ""))) !== null) {
    const key = String(match[1] || "").trim();
    if (key && !found.includes(key)) found.push(key);
  }
  return found;
}

const extractVariablesByComponent = (components) => {
  const result = { header: [], body: [], button: [] };
  (components || []).forEach((component) => {
    const type = String(component.type || "").toUpperCase();
    const format = String(component.format || "TEXT").toUpperCase();
    const text = component.text || "";

    if (type === "HEADER") {
      if (["IMAGE", "VIDEO", "DOCUMENT"].includes(format)) {
        result.header.push({
          index: "1",
          prompt: `Mídia do cabeçalho (${format})`,
          kind: format.toLowerCase()
        });
        return;
      }
      placeholders(text).forEach((key) => {
        result.header.push({
          index: key,
          prompt: `Cabeçalho {{${key}}}`
        });
      });
      return;
    }

    if (type === "BODY") {
      placeholders(text).forEach((key) => {
        result.body.push({
          index: key,
          prompt: `Corpo {{${key}}}`
        });
      });
      return;
    }

    if (type === "BUTTONS") {
      parseButtons(component.buttons).forEach((button, btnIndex) => {
        const btnType = String(button?.type || "").toUpperCase();
        if (btnType === "COPY_CODE") {
          result.button.push({
            index: String(btnIndex),
            buttonIndex: btnIndex,
            prompt: `Código do cupom (botão ${btnIndex + 1})`,
            kind: "copy_code"
          });
        } else if (
          btnType === "URL" &&
          placeholders(button?.url || "").length > 0
        ) {
          result.button.push({
            index: String(btnIndex),
            buttonIndex: btnIndex,
            prompt: `Trecho variável da URL (botão ${btnIndex + 1})`,
            kind: "url"
          });
        }
      });
    }
  });
  return result;
};

function describeTemplate(template) {
  const components = template?.components || [];
  const header = components.find(
    (item) => String(item.type || "").toUpperCase() === "HEADER"
  );
  const footer = components.find(
    (item) => String(item.type || "").toUpperCase() === "FOOTER"
  );
  const buttons = components
    .filter((item) => String(item.type || "").toUpperCase() === "BUTTONS")
    .flatMap((item) => parseButtons(item.buttons));
  const body = components.find(
    (item) => String(item.type || "").toUpperCase() === "BODY"
  );
  return {
    headerLabel: header
      ? `Cabeçalho: ${String(header.format || "TEXT").toUpperCase()}`
      : null,
    body: body?.text || "",
    footer: footer?.text || "",
    buttons
  };
}

const TemplateModal = ({
  open,
  handleClose,
  templates,
  onSelectTemplate,
  anchorEl,
  allowFileUpload = true
}) => {
  const classes = useStyles();
  const autoPicked = useRef(false);
  const [search, setSearch] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [variables, setVariables] = useState({ header: [], body: [], button: [] });
  const [variableValues, setVariableValues] = useState({});
  const [headerFile, setHeaderFile] = useState(null);
  const [formError, setFormError] = useState("");

  const selectTemplate = (template) => {
    setSelectedTemplate(template);
    setVariables(extractVariablesByComponent(template?.components || []));
    setVariableValues({});
    setHeaderFile(null);
    setFormError("");
  };

  useEffect(() => {
    if (!open) {
      autoPicked.current = false;
      return;
    }
    if (autoPicked.current) return;
    if ((templates || []).length === 1) {
      autoPicked.current = true;
      selectTemplate(templates[0]);
    }
  }, [open, templates]);

  const handleSendTemplate = () => {
    if (!selectedTemplate) return;
    const missing = [];
    Object.keys(variables).forEach((componentType) => {
      (variables[componentType] || []).forEach((variable) => {
        const value =
          variableValues[componentType]?.[String(variable.index)]?.value;
        const isMedia = ["image", "video", "document"].includes(variable.kind);
        if (isMedia && headerFile) return;
        if (!String(value || "").trim()) missing.push(variable.prompt);
      });
    });
    if (missing.length) {
      setFormError(`Preencha: ${missing.join(", ")}.`);
      return;
    }

    const normalized = { ...variableValues };
    if (normalized.buttons && !normalized.button) {
      normalized.button = normalized.buttons;
      delete normalized.buttons;
    }
    onSelectTemplate({
      ...selectedTemplate,
      variables: normalized,
      headerFile: headerFile || null
    });
    setSelectedTemplate(null);
    setVariableValues({});
    setHeaderFile(null);
    setFormError("");
    setSearch("");
  };

  const handleVariableChange = (componentType, index, value, buttonIndex) => {
    const newComponentValues = {
      ...variableValues[componentType],
      [String(index)]: { value, buttonIndex }
    };
    setVariableValues({ ...variableValues, [componentType]: newComponentValues });
    setFormError("");
  };

  const filteredTemplates = (templates || []).filter((template) =>
    String(template?.shortcode || template?.name || "")
      .toLowerCase()
      .includes(String(search || "").toLowerCase())
  );

  const onClose = () => {
    setSelectedTemplate(null);
    setVariableValues({});
    setHeaderFile(null);
    setFormError("");
    setSearch("");
    handleClose?.();
  };

  const summary = selectedTemplate ? describeTemplate(selectedTemplate) : null;
  const mediaField = (variables.header || []).find((item) =>
    ["image", "video", "document"].includes(item.kind)
  );

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "top", horizontal: "right" }}
      transformOrigin={{ vertical: "bottom", horizontal: "right" }}
      marginThreshold={8}
      disableScrollLock
      PaperProps={{ className: classes.paper, elevation: 8 }}
    >
      <Box className={classes.header}>
        <Typography className={classes.title} component="div">
          <WhatsApp style={{ fontSize: 18 }} />
          Templates do WhatsApp
        </Typography>
        <Typography className={classes.hint}>
          Selecione um template APPROVED. Obrigatório fora da janela 24h.
        </Typography>
      </Box>
      <Divider />
      <Box className={classes.body}>
        {!selectedTemplate ? (
          <>
            <div className={classes.searchContainer}>
              <SearchIcon style={{ fontSize: 18, opacity: 0.7 }} />
              <TextField
                variant="outlined"
                size="small"
                placeholder="Pesquisar Templates"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={classes.searchInput}
                fullWidth
              />
            </div>
            <List dense disablePadding>
              {filteredTemplates.map((template, index) => (
                <ListItem
                  key={template.id || index}
                  button
                  className={classes.templateItem}
                  onClick={() => selectTemplate(template)}
                >
                  <ListItemText
                    primary={
                      <div className={classes.templateInfo}>
                        <Typography style={{ fontSize: "0.8rem", fontWeight: 500 }}>
                          {template.shortcode || template.name}
                        </Typography>
                        <Typography style={{ fontSize: "0.68rem" }} color="textSecondary">
                          {template.language}
                        </Typography>
                      </div>
                    }
                    secondary={
                      <Typography
                        component="span"
                        style={{ fontSize: "0.68rem", lineHeight: 1.35 }}
                        color="textSecondary"
                      >
                        {(template?.components || [])
                          .map((c) => c?.text)
                          .filter(Boolean)
                          .join(" · ")
                          .slice(0, 120)}
                      </Typography>
                    }
                  />
                </ListItem>
              ))}
              {filteredTemplates.length === 0 ? (
                <Typography
                  variant="caption"
                  color="textSecondary"
                  style={{ display: "block", padding: "8px 4px" }}
                >
                  Nenhum template encontrado. Sincronize a Meta na conexão.
                </Typography>
              ) : null}
            </List>
          </>
        ) : (
          <Box>
            <Typography style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: 6 }}>
              {selectedTemplate.shortcode || selectedTemplate.name}
            </Typography>
            <Typography className={classes.meta}>
              {[
                selectedTemplate.language,
                summary?.headerLabel,
                summary?.buttons?.length
                  ? `${summary.buttons.length} botão(ões)`
                  : null
              ]
                .filter(Boolean)
                .join(" · ")}
            </Typography>
            {summary?.body ? (
              <Typography
                color="textSecondary"
                style={{ fontSize: "0.72rem", whiteSpace: "pre-wrap", marginBottom: 8 }}
              >
                {summary.body}
              </Typography>
            ) : null}
            {summary?.footer ? (
              <Typography className={classes.meta}>{summary.footer}</Typography>
            ) : null}
            {summary?.buttons?.length ? (
              <Typography className={classes.meta}>
                {summary.buttons
                  .map((button) => `${button.text || button.type} (${button.type})`)
                  .join(" · ")}
              </Typography>
            ) : null}
            {mediaField ? (
              <Box className={classes.field}>
                <Typography style={{ fontSize: "0.72rem", fontWeight: 600, marginBottom: 4 }}>
                  {mediaField.prompt}
                </Typography>
                <Typography className={classes.hint}>
                  A mídia de exemplo da Meta não é reenviada.
                  {allowFileUpload
                    ? " Envie o arquivo ou cole um link https público."
                    : " Em campanhas, informe um link https público."}
                </Typography>
                {allowFileUpload ? (
                  <TextField
                    type="file"
                    inputProps={{ accept: ACCEPT[mediaField.kind] || undefined }}
                    onChange={(event) => {
                      setHeaderFile(event.target.files?.[0] || null);
                      setFormError("");
                    }}
                    fullWidth
                    size="small"
                    variant="outlined"
                    margin="dense"
                  />
                ) : null}
                {headerFile ? (
                  <Typography className={classes.meta}>{headerFile.name}</Typography>
                ) : null}
              </Box>
            ) : null}
            {Object.keys(variables).map((componentType) =>
              (variables[componentType] || []).length > 0 ? (
                <Box key={componentType} className={classes.field}>
                  <Typography style={{ fontSize: "0.72rem", fontWeight: 600, marginBottom: 4 }}>
                    {componentType === "button" ? "BOTÕES" : componentType.toUpperCase()}
                  </Typography>
                  {variables[componentType].map((variable) => {
                    if (
                      ["image", "video", "document"].includes(variable.kind) &&
                      headerFile
                    ) {
                      return null;
                    }
                    return (
                      <TextField
                        key={`${componentType}-${variable.index}`}
                        label={
                          ["image", "video", "document"].includes(variable.kind)
                            ? "Link https público (se não enviar arquivo)"
                            : variable.prompt
                        }
                        value={
                          variableValues[componentType]?.[String(variable.index)]?.value ||
                          ""
                        }
                        onChange={(event) =>
                          handleVariableChange(
                            componentType,
                            variable.index,
                            event.target.value,
                            variable.buttonIndex ?? variable.index
                          )
                        }
                        fullWidth
                        size="small"
                        variant="outlined"
                        margin="dense"
                      />
                    );
                  })}
                </Box>
              ) : null
            )}
            {formError ? <div className={classes.error}>{formError}</div> : null}
          </Box>
        )}
      </Box>
      {selectedTemplate ? (
        <Box className={classes.actions}>
          <Button
            size="small"
            onClick={() => {
              setSelectedTemplate(null);
              setVariableValues({});
              setHeaderFile(null);
              setFormError("");
            }}
          >
            Voltar
          </Button>
          <Button
            size="small"
            variant="contained"
            color="primary"
            onClick={handleSendTemplate}
          >
            Enviar
          </Button>
        </Box>
      ) : null}
    </Popover>
  );
};

export default TemplateModal;
