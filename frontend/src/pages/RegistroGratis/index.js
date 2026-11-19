import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import {
  Search,
  Pencil,
  Trash2,
  Play,
  RefreshCw,
  Plus,
  Table as TableIcon
} from "lucide-react";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import ShimmerButton from "../../components/magic-ui/ShimmerButton";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogActions
} from "@material-ui/core";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import "./registroGratis.css";

const RegistroGratisManager = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchParam, setSearchParam] = useState("");
  const [reloadData, setReloadData] = useState(false);

  const [editRecord, setEditRecord] = useState(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editStatusWa, setEditStatusWa] = useState("");
  const [editStatusMail, setEditStatusMail] = useState("");
  const [editStatusAuto, setEditStatusAuto] = useState("");
  const [editLogs, setEditLogs] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);

  const [triggerOpen, setTriggerOpen] = useState(false);
  const [trigName, setTrigName] = useState("");
  const [trigEmail, setTrigEmail] = useState("");
  const [trigPhone, setTrigPhone] = useState("");
  const [trigBusy, setTrigBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const fetchRecords = async () => {
      try {
        const { data } = await api.get("/registro-gratis", {
          params: { searchParam }
        });
        if (!cancelled) setRecords(data.records || []);
      } catch (err) {
        toastError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchRecords();
    return () => {
      cancelled = true;
    };
  }, [searchParam, reloadData]);

  const handleOpenEdit = (rec) => {
    setEditRecord(rec);
    setEditName(rec.name || "");
    setEditEmail(rec.email || "");
    setEditPhone(rec.phone || "");
    setEditStatusWa(rec.statusWhatsapp || "");
    setEditStatusMail(rec.statusEmail || "");
    setEditStatusAuto(rec.statusAutomation || "");
    setEditLogs(rec.logs || "");
  };

  const handleSaveEdit = async () => {
    if (!editRecord) return;
    setSaveBusy(true);
    try {
      await api.put(`/registro-gratis/${editRecord.id}`, {
        name: editName,
        email: editEmail,
        phone: editPhone,
        statusWhatsapp: editStatusWa,
        statusEmail: editStatusMail,
        statusAutomation: editStatusAuto,
        logs: editLogs
      });
      toast.success("Registro atualizado com sucesso");
      setEditRecord(null);
      setReloadData((v) => !v);
    } catch (err) {
      toastError(err);
    } finally {
      setSaveBusy(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Deseja realmente excluir este registro?")) return;
    try {
      await api.delete(`/registro-gratis/${id}`);
      toast.success("Registro excluído com sucesso");
      setReloadData((v) => !v);
    } catch (err) {
      toastError(err);
    }
  };

  const handleTriggerAutomation = async () => {
    if (!trigName || !trigEmail || !trigPhone) {
      toast.error("Preencha Nome, E-mail e Telefone.");
      return;
    }
    setTrigBusy(true);
    try {
      await api.post("/registro-gratis/trigger", {
        name: trigName,
        email: trigEmail,
        phone: trigPhone
      });
      toast.success("Automação executada com sucesso!");
      setTriggerOpen(false);
      setTrigName("");
      setTrigEmail("");
      setTrigPhone("");
      setReloadData((v) => !v);
    } catch (err) {
      toastError(err);
    } finally {
      setTrigBusy(false);
    }
  };

  return (
    <div className="registro-gratis-page">
      <div className="registro-gratis-header">
        <div>
          <h1 className="registro-gratis-title">
            <TableIcon size={24} style={{ marginRight: 8, verticalAlign: "middle" }} />
            Tabela Registro Grátis
          </h1>
          <p className="registro-gratis-subtitle">
            Registros duplos capturados da página <code>register/teste-gratis</code>
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <ShimmerButton onClick={() => setTriggerOpen(true)}>
            <Play size={16} style={{ marginRight: 6 }} />
            Testar Automação Pós-Teste
          </ShimmerButton>
          <button
            className="registro-gratis-refresh-btn"
            onClick={() => setReloadData((v) => !v)}
            title="Atualizar Tabela"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      <div className="registro-gratis-search">
        <Search size={16} />
        <input
          value={searchParam}
          onChange={(e) => setSearchParam(e.target.value)}
          placeholder="Buscar por nome, e-mail, telefone ou status..."
        />
      </div>

      {loading ? (
        <div className="registro-gratis-loading">Carregando registros...</div>
      ) : records.length === 0 ? (
        <div className="registro-gratis-empty">
          Nenhum registro cadastrado na tabela <code>RegistroGratis</code> ainda.
        </div>
      ) : (
        <div className="registro-gratis-table-container">
          <table className="registro-gratis-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Telefone</th>
                <th>Data / Horário</th>
                <th>Status WhatsApp</th>
                <th>Status E-mail</th>
                <th>Status Automação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {records.map((rec) => (
                <tr key={rec.id}>
                  <td>#{rec.id}</td>
                  <td><strong>{rec.name || "-"}</strong></td>
                  <td>{rec.email || "-"}</td>
                  <td>{rec.phone || "-"}</td>
                  <td>{new Date(rec.createdAt).toLocaleString("pt-BR")}</td>
                  <td>
                    <span className={`status-badge status-${String(rec.statusWhatsapp).toLowerCase()}`}>
                      {rec.statusWhatsapp || "PENDENTE"}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge status-${String(rec.statusEmail).toLowerCase()}`}>
                      {rec.statusEmail || "PENDENTE"}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge status-${String(rec.statusAutomation).toLowerCase()}`}>
                      {rec.statusAutomation || "EM_PROCESSAMENTO"}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="action-btn edit-btn"
                        onClick={() => handleOpenEdit(rec)}
                        title="Editar Registro"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="action-btn delete-btn"
                        onClick={() => handleDelete(rec.id)}
                        title="Excluir Registro"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Edição de Registro */}
      {Boolean(editRecord) && (
        <Dialog open onClose={() => setEditRecord(null)} maxWidth="sm" fullWidth>
          <DialogTitle>Editar Registro Grátis #{editRecord?.id}</DialogTitle>
          <DialogContent style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 10 }}>
            <TextField
              label="Nome"
              variant="outlined"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              fullWidth
            />
            <TextField
              label="E-mail"
              variant="outlined"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              fullWidth
            />
            <TextField
              label="Telefone"
              variant="outlined"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              fullWidth
            />
            <TextField
              label="Status WhatsApp"
              variant="outlined"
              value={editStatusWa}
              onChange={(e) => setEditStatusWa(e.target.value)}
              fullWidth
            />
            <TextField
              label="Status E-mail"
              variant="outlined"
              value={editStatusMail}
              onChange={(e) => setEditStatusMail(e.target.value)}
              fullWidth
            />
            <TextField
              label="Status Automação"
              variant="outlined"
              value={editStatusAuto}
              onChange={(e) => setEditStatusAuto(e.target.value)}
              fullWidth
            />
            <TextField
              label="Logs / Observações"
              variant="outlined"
              multiline
              rows={4}
              value={editLogs}
              onChange={(e) => setEditLogs(e.target.value)}
              fullWidth
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditRecord(null)}>Cancelar</Button>
            <Button color="primary" variant="contained" disabled={saveBusy} onClick={handleSaveEdit}>
              {saveBusy ? "Salvando..." : "Salvar"}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Modal Testar Automação */}
      {triggerOpen && (
        <Dialog open onClose={() => setTriggerOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Executar Automação Pós-Teste Manualmente</DialogTitle>
          <DialogContent style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 10 }}>
            <p style={{ fontSize: 13, color: "#666", margin: 0 }}>
              Simula um cadastro na página <code>register/teste-gratis</code>, salva o registro duplicado na tabela <code>RegistroGratis</code>, valida o número e faz os disparos do WhatsApp Template e Email.
            </p>
            <TextField
              label="Nome Completo"
              variant="outlined"
              value={trigName}
              onChange={(e) => setTrigName(e.target.value)}
              fullWidth
            />
            <TextField
              label="Endereço de E-mail"
              variant="outlined"
              value={trigEmail}
              onChange={(e) => setTrigEmail(e.target.value)}
              fullWidth
            />
            <TextField
              label="Telefone (DDD + Número)"
              variant="outlined"
              value={trigPhone}
              onChange={(e) => setTrigPhone(e.target.value)}
              placeholder="Ex: 41997695759"
              fullWidth
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setTriggerOpen(false)}>Cancelar</Button>
            <Button color="primary" variant="contained" disabled={trigBusy} onClick={handleTriggerAutomation}>
              {trigBusy ? "Executando..." : "Disparar Automação"}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </div>
  );
};

export default RegistroGratisManager;
