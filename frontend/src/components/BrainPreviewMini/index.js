import React, { useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import useScheduleTranslateWhen from "../../hooks/useScheduleTranslateWhen";
import { useIsMobile } from "../../hooks/useMediaQueryBrain";
import {
  X,
  Maximize2,
  ListTodo,
  Users,
  BarChart3,
  Target,
  FileText,
  FileSpreadsheet,
  TrendingUp,
  UserPlus,
  ClipboardList,
  FolderKanban,
  MessageSquare,
  Link2,
  PieChart,
  Pencil,
  Trash2,
} from "lucide-react";
import AiBrain from "../../pages/AiBrain";
import logoBrainAi from "../../assets/logo_brain_ai.png";
import { resolveBrainPageContext } from "../../utils/brainPageContext";
import { Sheet, SheetContent } from "../ui/sheet";

const BrainFlowerMini = ({ size = 20 }) => (
  <img src={logoBrainAi} alt="" style={{ width: size, height: size, objectFit: "contain" }} />
);

export { BrainFlowerMini };

const CONTEXT_SUGGESTIONS = {
  leads: [
    { icon: UserPlus, title: "Criar lead de venda", prompt: "Quero criar um novo lead de venda. Me pergunte nome, produto, origem e prioridade." },
    { icon: Pencil, title: "Editar lead", prompt: "Quero editar um lead de venda existente. Localize pelo nome e use update_lead_sale." },
    { icon: Trash2, title: "Excluir lead", prompt: "Quero excluir um lead de venda. Localize, confirme o id e use delete_lead_sale." },
  ],
  atividades: [
    { icon: ListTodo, title: "Criar atividade", prompt: "Crie uma nova atividade para hoje. Me pergunte o título e tipo." },
    { icon: Pencil, title: "Editar atividade", prompt: "Quero editar uma atividade existente (status, data ou título). Localize e use update_activity." },
    { icon: ClipboardList, title: "Pendentes", prompt: "Liste todas as minhas atividades pendentes e atrasadas com detalhes." },
    { icon: Trash2, title: "Excluir atividade", prompt: "Quero excluir uma atividade. Confirme comigo e use delete_activity." },
  ],
  contatos: [
    { icon: UserPlus, title: "Novo contato", prompt: "Quero criar um novo contato no CRM. Me pergunte os dados necessários." },
    { icon: Pencil, title: "Editar contato", prompt: "Quero editar um contato existente. Localize e use update_contact." },
    { icon: Users, title: "Listar contatos", prompt: "Liste os últimos 20 contatos cadastrados no CRM." },
    { icon: Trash2, title: "Excluir contato", prompt: "Quero excluir um contato. Confirme o id e use delete_contact." },
  ],
  projetos: [
    { icon: FolderKanban, title: "Listar projetos", prompt: "Liste todos os projetos do CRM com seus status atuais." },
    { icon: UserPlus, title: "Criar projeto", prompt: "Quero criar um novo projeto. Me pergunte nome, status e prazo." },
    { icon: Pencil, title: "Editar projeto", prompt: "Quero editar um projeto existente. Localize e use update_project." },
    { icon: Trash2, title: "Excluir projeto", prompt: "Quero excluir um projeto. Confirme e use delete_project." },
  ],
  tickets: [
    { icon: MessageSquare, title: "Tickets abertos", prompt: "Liste todos os tickets/atendimentos abertos e pendentes." },
    { icon: BarChart3, title: "Análise", prompt: "Me dê uma análise dos atendimentos: abertos, pendentes, tempo médio de resposta." },
    { icon: PieChart, title: "Dashboard", prompt: "Me dê os dados do dashboard de atendimento dos últimos 30 dias com insights." },
    { icon: FileText, title: "Relatório", prompt: "Gere um relatório em PDF dos atendimentos dos últimos 30 dias." },
  ],
  conexoes: [
    { icon: Link2, title: "Listar conexões", prompt: "Liste todas as conexões/canais configurados no CRM e seus status." },
    { icon: MessageSquare, title: "Criar conexão WhatsApp", prompt: "Quero criar uma nova conexão WhatsApp no CRM." },
    { icon: BarChart3, title: "Status geral", prompt: "Me dê um resumo de todas as conexões: ativas, desconectadas e canais." },
  ],
  metaTemplates: [
    {
      icon: MessageSquare,
      title: "Enviar Template Meta",
      prompt:
        "Quero enviar um Template Meta (WhatsApp API Oficial) via campanha. Oriente: 1) selecionar conexão oficial, 2) escolher template(s) sincronizados APPROVED, 3) escolher contatos/destinatários, 4) agendar ou enviar agora.",
    },
    {
      icon: Link2,
      title: "Sincronizar templates",
      prompt:
        "Explique como sincronizar templates aprovados da Meta (WABA) na página Templates Meta e o que significa APPROVED, PENDING e REJECTED.",
    },
    {
      icon: Target,
      title: "Criar campanha Meta",
      prompt:
        "Quero criar uma campanha com Templates Meta validados. Peça nome da campanha, conexão oficial, templates e lista de destinatários.",
    },
  ],
  dashboard: [
    { icon: BarChart3, title: "Análise completa", prompt: "Me dê uma análise completa dos dados do meu dashboard dos últimos 30 dias com insights e recomendações." },
    { icon: FileText, title: "Gerar relatório", prompt: "Gere um relatório em PDF com os dados do dashboard dos últimos 30 dias." },
    { icon: Target, title: "Resumo geral", prompt: "Me dê um resumo completo do meu CRM: total de contatos, tickets abertos, atividades pendentes, leads e projetos." },
  ],
  general: [
    { icon: Pencil, title: "Editar no CRM", prompt: "Quero editar um registro existente (lead, atividade, produto, projeto, contato). Localize e use update_*." },
    { icon: ListTodo, title: "Criar atividade", prompt: "Crie uma nova atividade para hoje com o título 'Follow-up com cliente' do tipo follow_up" },
    { icon: Target, title: "Resumo geral", prompt: "Me dê um resumo completo do meu CRM: total de contatos, tickets abertos, atividades pendentes, leads e projetos." },
  ],
};

function resolveContext(context) {
  return resolveBrainPageContext(context);
}

const BrainPreviewMini = ({ context, iconSize = 32 }) => {
  const isMobile = useIsMobile();
  const history = useHistory();
  const [open, setOpen] = useState(false);
  useScheduleTranslateWhen(open);

  const contextKey = resolveContext(context);
  const suggestions = useMemo(
    () => CONTEXT_SUGGESTIONS[contextKey] || CONTEXT_SUGGESTIONS.general,
    [contextKey]
  );

  const handleOpenFullScreen = () => {
    setOpen(false);
    history.push("/brain-ai");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Brain.AI"
        className="brain-preview-mini__trigger"
      >
        <BrainFlowerMini size={iconSize} />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          showClose={false}
          className={isMobile ? "w-full max-w-full" : "w-[560px] md:w-[680px] max-w-[calc(100vw-24px)] m-3 h-[calc(100%-24px)] rounded-2xl border brain-shell"}
        >
          <div className="brain-preview-mini__header">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <BrainFlowerMini size={22} />
              <span className="brain-preview-mini__title">Brain.AI</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                className="brain-voice__icon-btn"
                title="Abrir em tela cheia"
                onClick={handleOpenFullScreen}
              >
                <Maximize2 size={14} />
              </button>
              <button
                type="button"
                className="brain-voice__icon-btn"
                title="Fechar"
                onClick={() => setOpen(false)}
              >
                <X size={14} />
              </button>
            </div>
          </div>
          <div style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
            <AiBrain
              embedded
              onClose={() => setOpen(false)}
              contextSuggestions={suggestions}
              pageContext={context}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default BrainPreviewMini;
