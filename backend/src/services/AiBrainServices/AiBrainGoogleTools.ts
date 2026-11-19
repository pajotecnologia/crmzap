import type OpenAI from "openai";
import {
  brainListGoogleCalendarEvents,
  brainListGoogleDriveFiles,
  brainReadGoogleDriveFile,
  brainReadGoogleSheetsRange,
  brainSaveSpreadsheetToGoogle,
  googleWorkspaceConnectionStatus
} from "../GoogleWorkspaceServices/googleWorkspaceBrainService";
import { createGoogleCalendarEventForCompany } from "../GoogleWorkspaceServices/googleCalendarEventsService";

export const GOOGLE_MCP_IDS = new Set([
  "google_drive",
  "google_sheets",
  "google_calendar"
]);

export const GOOGLE_WORKSPACE_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_google_workspace_status",
      description:
        "Lista quais integrações Google (Drive, Sheets, Calendário) estão conectadas para a organização e o e-mail de cada conta.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "list_google_drive_files",
      description:
        "Busca arquivos no Google Drive da organização (nome ou texto). Use antes de read_google_drive_file para obter fileId.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Termo de busca (nome ou conteúdo)" },
          maxResults: { type: "number", description: "Máximo de arquivos (padrão 20)" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_google_drive_file",
      description:
        "Lê conteúdo de um arquivo do Drive (Docs/Sheets exportados como texto, CSV, arquivos .txt).",
      parameters: {
        type: "object",
        properties: {
          fileId: { type: "string", description: "ID do arquivo (campo id de list_google_drive_files)" },
          maxChars: { type: "number", description: "Limite de caracteres retornados (padrão 12000)" }
        },
        required: ["fileId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_google_sheets_range",
      description:
        "Lê células de uma planilha Google Sheets. spreadsheetId está na URL: /spreadsheets/d/{spreadsheetId}/edit",
      parameters: {
        type: "object",
        properties: {
          spreadsheetId: { type: "string", description: "ID da planilha" },
          range: {
            type: "string",
            description: "Intervalo A1, ex: 'Pedidos!A1:F50' ou 'A1:Z100'"
          }
        },
        required: ["spreadsheetId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "save_spreadsheet_to_google_drive",
      description:
        "Salva planilha na conta Google conectada (Google Sheets nativo ou CSV no Drive). Use quando o usuário pedir planilha no Drive, link da planilha, anexar planilha na conta Google, etc. Retorna webViewLink — confirme ao usuário com o link.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Nome/título da planilha" },
          columns: {
            type: "array",
            items: { type: "string" },
            description: "Cabeçalhos das colunas"
          },
          rows: {
            type: "array",
            items: { type: "array", items: { type: "string" } },
            description: "Linhas de dados"
          }
        },
        required: ["title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_google_calendar_events",
      description: "Lista eventos do Google Calendar conectado (agenda da organização).",
      parameters: {
        type: "object",
        properties: {
          timeMin: { type: "string", description: "Início ISO 8601 (opcional)" },
          timeMax: { type: "string", description: "Fim ISO 8601 (opcional)" },
          maxResults: { type: "number", description: "Máximo de eventos" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_google_calendar_event",
      description:
        "Cria evento na agenda Google Calendar da conta conectada E registra atividade no CRM (calendário interno). Use quando pedirem agendar reunião, evento, compromisso no Google Calendar.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Título do evento" },
          description: { type: "string", description: "Descrição/observações" },
          location: { type: "string", description: "Local (opcional)" },
          start: { type: "string", description: "Início ISO 8601 (ex: 2026-06-15T14:00:00)" },
          end: { type: "string", description: "Fim ISO 8601 (opcional; padrão +1h)" }
        },
        required: ["summary", "start"]
      }
    }
  }
];

const TOOL_BY_MCP: Record<string, string[]> = {
  google_drive: [
    "list_google_workspace_status",
    "list_google_drive_files",
    "read_google_drive_file",
    "save_spreadsheet_to_google_drive"
  ],
  google_sheets: [
    "list_google_workspace_status",
    "read_google_sheets_range",
    "list_google_drive_files",
    "save_spreadsheet_to_google_drive"
  ],
  google_calendar: [
    "list_google_workspace_status",
    "list_google_calendar_events",
    "create_google_calendar_event"
  ]
};

export function filterGoogleToolsForMcp(
  mcpConnections?: string[]
): OpenAI.Chat.Completions.ChatCompletionTool[] {
  if (!mcpConnections?.length) return [];

  const allowedNames = new Set<string>();
  for (const id of mcpConnections) {
    const key = String(id || "").trim();
    if (!GOOGLE_MCP_IDS.has(key)) continue;
    for (const name of TOOL_BY_MCP[key] || []) {
      allowedNames.add(name);
    }
  }

  return GOOGLE_WORKSPACE_TOOLS.filter(t => {
    if (t.type !== "function") return false;
    const name = (t as { function: { name: string } }).function.name;
    return allowedNames.has(name);
  });
}

export async function executeAiBrainGoogleTool(
  toolName: string,
  args: Record<string, unknown>,
  companyId: number,
  userId: number
): Promise<string | null> {
  switch (toolName) {
    case "list_google_workspace_status": {
      const status = await googleWorkspaceConnectionStatus(companyId);
      return JSON.stringify({ success: true, data: status });
    }
    case "list_google_drive_files": {
      const result = await brainListGoogleDriveFiles({
        companyId,
        query: args.query as string | undefined,
        maxResults: args.maxResults as number | undefined
      });
      if (!result.connected) {
        return JSON.stringify({
          success: false,
          error:
            "Google Drive não conectado. Conecte em Integrações → Google Drive."
        });
      }
      return JSON.stringify({
        success: true,
        accountEmail: result.accountEmail,
        files: result.files,
        message: `${result.files.length} arquivo(s) encontrado(s).`
      });
    }
    case "read_google_drive_file": {
      const result = await brainReadGoogleDriveFile({
        companyId,
        fileId: String(args.fileId || ""),
        maxChars: args.maxChars as number | undefined
      });
      if (!result.connected) {
        return JSON.stringify({
          success: false,
          error:
            "Google Drive não conectado. Conecte em Integrações → Google Drive."
        });
      }
      return JSON.stringify({ success: true, ...result });
    }
    case "read_google_sheets_range": {
      try {
        const result = await brainReadGoogleSheetsRange({
          companyId,
          spreadsheetId: String(args.spreadsheetId || ""),
          range: args.range as string | undefined
        });
        return JSON.stringify({
          success: true,
          accountEmail: result.accountEmail,
          spreadsheetId: result.spreadsheetId,
          range: result.range,
          rowCount: result.values.length,
          values: result.values
        });
      } catch (err: any) {
        return JSON.stringify({
          success: false,
          error: err.message || "Erro ao ler planilha."
        });
      }
    }
    case "save_spreadsheet_to_google_drive": {
      try {
        const result = await brainSaveSpreadsheetToGoogle({
          companyId,
          title: String(args.title || "Planilha"),
          columns: args.columns as string[] | undefined,
          rows: args.rows as string[][] | undefined
        });
        if (!result.success) {
          return JSON.stringify({ success: false, error: result.error });
        }
        return JSON.stringify({
          success: true,
          message: `Planilha "${result.name}" salva com sucesso no Google (${result.accountEmail}).`,
          accountEmail: result.accountEmail,
          webViewLink: result.webViewLink,
          spreadsheetId: result.spreadsheetId,
          fileId: result.fileId,
          method: result.method,
          instruction:
            "Informe ao usuário que salvou com sucesso e inclua o webViewLink clicável."
        });
      } catch (err: any) {
        return JSON.stringify({
          success: false,
          error: err.message || "Erro ao salvar planilha no Google."
        });
      }
    }
    case "list_google_calendar_events": {
      const result = await brainListGoogleCalendarEvents({
        companyId,
        timeMin: args.timeMin as string | undefined,
        timeMax: args.timeMax as string | undefined,
        maxResults: args.maxResults as number | undefined
      });
      if (!result.connected) {
        return JSON.stringify({
          success: false,
          error:
            "Google Calendário não conectado. Conecte em Integrações → Google Calendário."
        });
      }
      return JSON.stringify({
        success: true,
        accountEmail: result.accountEmail,
        events: result.events,
        message: `${result.events.length} evento(s).`
      });
    }
    case "create_google_calendar_event": {
      try {
        const created = await createGoogleCalendarEventForCompany({
          companyId,
          userId,
          summary: String(args.summary || ""),
          description: args.description as string | undefined,
          location: args.location as string | undefined,
          start: String(args.start || ""),
          end: args.end as string | undefined
        });
        return JSON.stringify({
          success: true,
          message: `Evento "${args.summary}" agendado no Google Calendar (${created.accountEmail}) e registrado no CRM.`,
          accountEmail: created.accountEmail,
          googleEventId: created.googleEventId,
          htmlLink: created.htmlLink,
          activityId: created.activityId,
          start: created.start,
          end: created.end,
          instruction:
            "Confirme ao usuário que agendou com sucesso no Google Calendar e no calendário do CRM; inclua htmlLink."
        });
      } catch (err: any) {
        return JSON.stringify({
          success: false,
          error: err.message || "Erro ao criar evento no Google Calendar."
        });
      }
    }
    default:
      return null;
  }
}
