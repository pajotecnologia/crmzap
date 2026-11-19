import React, { useContext, useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { Facebook, Instagram, MessageCircle, Search, Table2 } from "lucide-react";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { WhatsAppsContext } from "../../context/WhatsApp/WhatsAppsContext";
import BorderBeam from "../../components/magic-ui/BorderBeam";
import SidebarToggleButton from "../../layout/SidebarToggleButton";
import {
  AUTOMATION_FONT,
  AUTOMATION_TEMPLATES,
  matchesChannel
} from "../FlowBuilder/automationTemplates";
import {
  AutomationsDialog,
  ConnectionPicker,
  FieldLabel,
  GhostButton,
  PrimaryButton,
  TextArea,
  TextInput
} from "../FlowBuilder/AutomationsDialogs";
import "../FlowBuilder/automations.css";

const ChannelMark = ({ channels, large }) => {
  const key = channels.join("-");
  const cls =
    key === "instagram"
      ? "ig"
      : key === "facebook"
        ? "fb"
        : key === "whatsapp"
          ? "wa"
          : "mix";
  return (
    <span className={`automations-mark${large ? " automations-mark--lg" : ""} automations-mark--${cls}`}>
      {cls === "fb" ? (
        <Facebook size={large ? 26 : 22} />
      ) : cls === "wa" ? (
        <MessageCircle size={large ? 26 : 22} />
      ) : (
        <Instagram size={large ? 26 : 22} />
      )}
    </span>
  );
};

/**
 * Automações internas da plataforma (somente admin@admin.com).
 * A rota é protegida no front e os endpoints usados aqui validam o e-mail no backend.
 */
const AutomacaoInterna = () => {
  const history = useHistory();
  const whatsContext = useContext(WhatsAppsContext) || {};
  const connections = Array.isArray(whatsContext.whatsApps)
    ? whatsContext.whatsApps
    : [];

  const [searchParam, setSearchParam] = useState("");
  const [template, setTemplate] = useState(null);
  const [templateMessage, setTemplateMessage] = useState("");
  const [templatePhrase, setTemplatePhrase] = useState("");
  const [templateIds, setTemplateIds] = useState([]);
  const [templateBusy, setTemplateBusy] = useState(false);

  const term = searchParam.trim().toLowerCase();

  const visibleTemplates = useMemo(() => {
    if (!term) return AUTOMATION_TEMPLATES;
    return AUTOMATION_TEMPLATES.filter((item) =>
      `${item.name} ${item.action} ${item.description}`.toLowerCase().includes(term)
    );
  }, [term]);

  const featured = visibleTemplates.find((item) => item.featured);
  const recipes = visibleTemplates.filter((item) => !item.featured);
  const showTrialCard =
    !term || "registro grátis teste gratuito free trial cadastro".includes(term);

  const openTemplate = (item) => {
    const matching = connections.filter((connection) =>
      matchesChannel(connection, item.channels)
    );
    setTemplate(item);
    setTemplateMessage(item.defaultMessage);
    setTemplatePhrase(item.defaultPhrase || "");
    setTemplateIds(matching.map((connection) => connection.id));
  };

  const toggleConnection = (id) => {
    setTemplateIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const matchingConnections = template
    ? connections.filter((connection) =>
        matchesChannel(connection, template.channels)
      )
    : [];

  const handleActivateTemplate = async () => {
    if (!template) return;
    setTemplateBusy(true);
    try {
      const { data } = await api.post("/flowbuilder/template", {
        templateId: template.id,
        message: templateMessage,
        phrase: templatePhrase,
        connectionIds: templateIds
      });
      if (data?.unboundReason) toast.info(data.unboundReason);
      else toast.success("Automação salva e ligada às conexões");
      setTemplate(null);
    } catch (err) {
      toastError(err);
    } finally {
      setTemplateBusy(false);
    }
  };

  return (
    <div className="automations-page" style={{ fontFamily: AUTOMATION_FONT }}>
      <div className="automations-page__inner">
        <header className="automations-page__header">
          <div className="automations-page__heading">
            <SidebarToggleButton />
            <h1 className="automations-page__title">Automação Interna</h1>
          </div>
          <GhostButton onClick={() => history.push("/flowbuilders")}>
            Ver fluxos
          </GhostButton>
        </header>

        <div className="automations-page__search">
          <Search size={15} />
          <input
            value={searchParam}
            onChange={(event) => setSearchParam(event.target.value)}
            placeholder="Buscar automações internas"
            aria-label="Buscar automações internas"
          />
        </div>

        {showTrialCard ? (
          <>
            <p className="automations-page__label">Teste gratuito</p>
            <div className="automations-list" style={{ marginBottom: 36 }}>
              <div
                className="automations-flow"
                role="button"
                tabIndex={0}
                onClick={() => history.push("/registro-gratis")}
                onKeyDown={(event) => {
                  if (event.key === "Enter") history.push("/registro-gratis");
                }}
              >
                <span className="automations-mark automations-mark--wa">
                  <Table2 size={18} />
                </span>
                <div className="automations-flow__body">
                  <p className="automations-flow__name">Registro Grátis</p>
                  <p className="automations-tile__desc" style={{ margin: 0 }}>
                    Cadastros do teste gratuito e disparo da automação de boas-vindas.
                  </p>
                </div>
              </div>
            </div>
          </>
        ) : null}

        <p className="automations-page__label">Instagram e Facebook</p>

        {featured ? (
          <article className="automations-hero">
            <BorderBeam
              size={110}
              duration={16}
              colorFrom="rgba(225, 48, 108, 0.45)"
              colorTo="rgba(0, 113, 227, 0.2)"
            />
            <ChannelMark channels={featured.channels} large />
            <div className="automations-hero__copy">
              <p className="automations-hero__kicker">Instagram</p>
              <h2 className="automations-hero__title">{featured.name}</h2>
              <p className="automations-hero__action">{featured.action}</p>
              <p className="automations-hero__note">{featured.description}</p>
            </div>
            <button
              type="button"
              className="automations-btn automations-hero__cta"
              onClick={() => openTemplate(featured)}
            >
              Ativar
            </button>
          </article>
        ) : null}

        {recipes.length ? (
          <div className="automations-grid">
            {recipes.map((item) => (
              <article key={item.id} className="automations-tile">
                <ChannelMark channels={item.channels} />
                <h3 className="automations-tile__title">{item.name}</h3>
                <p className="automations-tile__desc">{item.description}</p>
                <button
                  type="button"
                  className="automations-btn"
                  onClick={() => openTemplate(item)}
                >
                  Ativar
                </button>
              </article>
            ))}
          </div>
        ) : featured ? null : (
          <div className="automations-empty">
            <p className="automations-empty__title">Nenhuma automação com esse termo</p>
          </div>
        )}
      </div>

      <AutomationsDialog
        open={Boolean(template)}
        title={template?.name}
        onClose={() => setTemplate(null)}
        footer={
          <>
            <GhostButton onClick={() => setTemplate(null)}>Cancelar</GhostButton>
            <PrimaryButton disabled={templateBusy} onClick={handleActivateTemplate}>
              {templateBusy ? "Salvando…" : "Ativar automação"}
            </PrimaryButton>
          </>
        }
      >
        {template ? (
          <div style={{ display: "grid", gap: 16 }}>
            <p className="automations-hint" style={{ padding: 0, background: "transparent" }}>
              {template.description}
            </p>
            {template.needsCommentsPermission ? (
              <p
                className="automations-hint"
                style={{
                  margin: 0,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "rgba(225, 48, 108, 0.08)",
                  color: "#8a2a4a"
                }}
              >
                Esta automação já fica ligada no CRM. O envio real de resposta/DM a
                comentários só completa quando a Meta aprovar{" "}
                <strong>instagram_business_manage_comments</strong> (screencast).
              </p>
            ) : null}
            {template.bind === "keyword" || template.bind === "ig_comment_dm" ? (
              <div>
                <FieldLabel>Palavra-chave</FieldLabel>
                <TextInput
                  value={templatePhrase}
                  onChange={(event) => setTemplatePhrase(event.target.value)}
                  placeholder={
                    template.bind === "ig_comment_dm"
                      ? "Ex.: GUIA"
                      : "Ex.: oi, preço, quero"
                  }
                />
              </div>
            ) : null}
            <div>
              <FieldLabel>Mensagem enviada</FieldLabel>
              <TextArea
                value={templateMessage}
                onChange={(event) => setTemplateMessage(event.target.value)}
              />
            </div>
            <div>
              <FieldLabel>Conexões</FieldLabel>
              <ConnectionPicker
                connections={matchingConnections}
                selectedIds={templateIds}
                onToggle={toggleConnection}
              />
            </div>
          </div>
        ) : null}
      </AutomationsDialog>
    </div>
  );
};

export default AutomacaoInterna;
