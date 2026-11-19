import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import {
  Copy,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  SquareArrowOutUpRight,
  Trash2,
  Workflow
} from "lucide-react";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import ShimmerButton from "../../components/magic-ui/ShimmerButton";
import SidebarToggleButton from "../../layout/SidebarToggleButton";
import { AUTOMATION_FONT } from "./automationTemplates";
import { ConfirmDialog, NameDialog } from "./AutomationsDialogs";
import "./automations.css";

const FlowMenu = ({ onOpen, onRename, onDuplicate, onDelete }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  const run = (action) => {
    setOpen(false);
    action();
  };

  return (
    <div className="automations-menu">
      <button
        type="button"
        className="automations-menu__trigger"
        aria-label="Mais ações"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          const menuHeight = 176;
          const top =
            rect.bottom + 6 + menuHeight > window.innerHeight
              ? Math.max(12, rect.top - menuHeight - 6)
              : rect.bottom + 6;
          setPos({ top, left: rect.right - 168 });
          setOpen((value) => !value);
        }}
      >
        <MoreHorizontal size={16} />
      </button>
      {open
        ? createPortal(
            <div
              className="automations-menu__panel"
              role="menu"
              style={{ top: pos.top, left: Math.max(12, pos.left) }}
              onClick={(event) => event.stopPropagation()}
            >
              <button type="button" role="menuitem" onClick={() => run(onOpen)}>
                <SquareArrowOutUpRight size={14} />
                Abrir fluxo
              </button>
              <button type="button" role="menuitem" onClick={() => run(onRename)}>
                <Pencil size={14} />
                Editar nome
              </button>
              <button type="button" role="menuitem" onClick={() => run(onDuplicate)}>
                <Copy size={14} />
                Duplicar
              </button>
              <button
                type="button"
                role="menuitem"
                className="is-danger"
                onClick={() => run(onDelete)}
              >
                <Trash2 size={14} />
                Excluir fluxo
              </button>
            </div>,
            document.body
          )
        : null}
    </div>
  );
};

const FlowBuilder = () => {
  const history = useHistory();

  const [flows, setFlows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchParam, setSearchParam] = useState("");
  const [reloadData, setReloadData] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  const [renameFlow, setRenameFlow] = useState(null);
  const [renameName, setRenameName] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  const [confirmFlow, setConfirmFlow] = useState(null);
  const [confirmMode, setConfirmMode] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get("/flowbuilder");
        if (!cancelled) setFlows(Array.isArray(data?.flows) ? data.flows : []);
      } catch (err) {
        toastError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reloadData]);

  const term = searchParam.trim().toLowerCase();

  const filteredFlows = useMemo(() => {
    if (!term) return flows;
    return flows.filter((flow) =>
      String(flow.name || "").toLowerCase().includes(term)
    );
  }, [flows, term]);

  const openFlow = (flow) => history.push(`/flowbuilder/${flow.id}`);

  const handleCreateFlow = async () => {
    if (!createName.trim()) return;
    setCreateBusy(true);
    try {
      await api.post("/flowbuilder", { name: createName.trim() });
      toast.success("Fluxo criado");
      setCreateOpen(false);
      setCreateName("");
      setReloadData((value) => !value);
    } catch (err) {
      toastError(err);
    } finally {
      setCreateBusy(false);
    }
  };

  const handleRename = async () => {
    if (!renameFlow || !renameName.trim()) return;
    setRenameBusy(true);
    try {
      await api.put("/flowbuilder", {
        flowId: renameFlow.id,
        name: renameName.trim()
      });
      toast.success("Fluxo atualizado");
      setRenameFlow(null);
      setReloadData((value) => !value);
    } catch (err) {
      toastError(err);
    } finally {
      setRenameBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!confirmFlow || !confirmMode) return;
    setConfirmBusy(true);
    try {
      if (confirmMode === "delete") {
        await api.delete(`/flowbuilder/${confirmFlow.id}`);
        toast.success("Fluxo excluído");
      } else {
        await api.post("/flowbuilder/duplicate", { flowId: confirmFlow.id });
        toast.success("Fluxo duplicado");
      }
      setConfirmFlow(null);
      setConfirmMode(null);
      setReloadData((value) => !value);
    } catch (err) {
      toastError(err);
    } finally {
      setConfirmBusy(false);
    }
  };

  const askRename = (flow) => {
    setRenameFlow(flow);
    setRenameName(flow.name || "");
  };

  const askConfirm = (flow, mode) => {
    setConfirmFlow(flow);
    setConfirmMode(mode);
  };

  return (
    <div className="automations-page" style={{ fontFamily: AUTOMATION_FONT }}>
      <div className="automations-page__inner">
        <header className="automations-page__header">
          <div className="automations-page__heading">
            <SidebarToggleButton />
            <h1 className="automations-page__title">Automações</h1>
          </div>
          <ShimmerButton
            className="automations-page__create"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={15} />
            Criar fluxo
          </ShimmerButton>
        </header>

        <div className="automations-page__search">
          <Search size={15} />
          <input
            type="search"
            value={searchParam}
            onChange={(event) => setSearchParam(event.target.value)}
            placeholder="Buscar fluxos..."
            aria-label="Buscar fluxos"
          />
        </div>

        <p className="automations-page__label">
          {loading ? "Seus fluxos" : `Seus fluxos (${filteredFlows.length})`}
        </p>

        {loading ? (
          <>
            <div className="automations-skel" />
            <div className="automations-skel" />
            <div className="automations-skel" />
          </>
        ) : filteredFlows.length === 0 ? (
          <div className="automations-empty">
            <p className="automations-empty__title">
              {term ? "Nenhum fluxo encontrado" : "Nenhum fluxo criado ainda"}
            </p>
            <p className="automations-empty__hint">
              {term
                ? "Tente usar outros termos de pesquisa."
                : "Crie seu primeiro fluxo de conversa para automatizar atendimentos."}
            </p>
            {!term ? (
              <button
                type="button"
                className="automations-btn"
                style={{ marginTop: 16 }}
                onClick={() => setCreateOpen(true)}
              >
                <Plus size={14} style={{ marginRight: 6 }} />
                Criar primeiro fluxo
              </button>
            ) : null}
          </div>
        ) : (
          <div className="automations-list">
            {filteredFlows.map((flow) => (
              <div
                key={flow.id}
                className="automations-flow"
                role="button"
                tabIndex={0}
                onClick={() => openFlow(flow)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") openFlow(flow);
                }}
              >
                <span className="automations-mark automations-mark--mix automations-flow__mark">
                  <Workflow size={18} />
                </span>
                <div className="automations-flow__body">
                  <p className="automations-flow__name" title={flow.name}>
                    {flow.name}
                  </p>
                  <p className="automations-flow__sub">Automação de fluxo</p>
                </div>
                <span
                  className={
                    flow.active === false
                      ? "automations-pill automations-pill--off"
                      : "automations-pill"
                  }
                >
                  {flow.active === false ? "Inativo" : "Ativo"}
                </span>
                <div
                  className="automations-flow__actions"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    className="automations-menu__trigger automations-flow__quick"
                    aria-label={`Editar nome de ${flow.name}`}
                    title="Editar nome"
                    onClick={() => askRename(flow)}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    className="automations-menu__trigger automations-flow__quick"
                    aria-label={`Duplicar ${flow.name}`}
                    title="Duplicar"
                    onClick={() => askConfirm(flow, "duplicate")}
                  >
                    <Copy size={15} />
                  </button>
                  <FlowMenu
                    onOpen={() => openFlow(flow)}
                    onRename={() => askRename(flow)}
                    onDuplicate={() => askConfirm(flow, "duplicate")}
                    onDelete={() => askConfirm(flow, "delete")}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <NameDialog
        open={createOpen}
        title="Novo fluxo"
        value={createName}
        busy={createBusy}
        onChange={setCreateName}
        onClose={() => setCreateOpen(false)}
        onSave={handleCreateFlow}
      />

      <NameDialog
        open={Boolean(renameFlow)}
        title="Editar nome do fluxo"
        value={renameName}
        busy={renameBusy}
        onChange={setRenameName}
        onClose={() => setRenameFlow(null)}
        onSave={handleRename}
      />

      <ConfirmDialog
        open={Boolean(confirmFlow)}
        title={
          confirmMode === "delete"
            ? `Excluir “${confirmFlow?.name}”?`
            : `Duplicar “${confirmFlow?.name}”?`
        }
        body={
          confirmMode === "delete"
            ? "Esta ação não pode ser desfeita. Campanhas e integrações ligadas a este fluxo deixam de disparar."
            : "Uma cópia do fluxo será criada para você editar."
        }
        confirmLabel={confirmMode === "delete" ? "Excluir" : "Duplicar"}
        danger={confirmMode === "delete"}
        busy={confirmBusy}
        onClose={() => {
          setConfirmFlow(null);
          setConfirmMode(null);
        }}
        onConfirm={handleConfirm}
      />
    </div>
  );
};

export default FlowBuilder;
