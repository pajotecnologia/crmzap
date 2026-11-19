import { google } from "googleapis";
import { Readable } from "stream";
import AppError from "../../errors/AppError";
import GoogleWorkspaceConnection, {
  GoogleWorkspaceServiceId
} from "../../models/GoogleWorkspaceConnection";
import { getAuthorizedGoogleClient } from "./googleOAuthService";
import {
  listGoogleCalendarEventsForCompany,
  GoogleCalendarEventDto
} from "./googleCalendarEventsService";

async function resolveActiveConnection(
  companyId: number,
  service: GoogleWorkspaceServiceId
): Promise<GoogleWorkspaceConnection | null> {
  return GoogleWorkspaceConnection.findOne({
    where: { companyId, service, isActive: true },
    order: [["createdAt", "DESC"]]
  });
}

function connectionHint(service: GoogleWorkspaceServiceId): string {
  const keys: Record<GoogleWorkspaceServiceId, string> = {
    google_drive: "google-drive",
    google_sheets: "google-sheets",
    google_calendar: "google-calendar"
  };
  return `Conecte em Integrações → ${keys[service] || service}.`;
}

export async function brainListGoogleDriveFiles(params: {
  companyId: number;
  query?: string;
  maxResults?: number;
}): Promise<{
  connected: boolean;
  accountEmail?: string;
  files: Array<{
    id: string;
    name: string;
    mimeType: string;
    modifiedTime?: string;
    webViewLink?: string;
  }>;
}> {
  const connection = await resolveActiveConnection(params.companyId, "google_drive");
  if (!connection) {
    return { connected: false, files: [] };
  }

  const auth = await getAuthorizedGoogleClient(connection);
  const drive = google.drive({ version: "v3", auth });
  const qParts = ["trashed = false"];
  const q = String(params.query || "").trim();
  if (q) {
    const safe = q.replace(/'/g, "\\'");
    qParts.push(`(name contains '${safe}' or fullText contains '${safe}')`);
  }

  const { data } = await drive.files.list({
    pageSize: Math.min(params.maxResults || 20, 50),
    fields:
      "files(id,name,mimeType,modifiedTime,webViewLink,size),nextPageToken",
    orderBy: "modifiedTime desc",
    q: qParts.join(" and ")
  });

  const files = (data.files || []).map(f => ({
    id: String(f.id || ""),
    name: String(f.name || ""),
    mimeType: String(f.mimeType || ""),
    modifiedTime: f.modifiedTime || undefined,
    webViewLink: f.webViewLink || undefined
  }));

  return {
    connected: true,
    accountEmail: connection.accountEmail,
    files
  };
}

const TEXT_EXPORT_MIMES: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain"
};

export async function brainReadGoogleDriveFile(params: {
  companyId: number;
  fileId: string;
  maxChars?: number;
}): Promise<{
  connected: boolean;
  name?: string;
  mimeType?: string;
  content?: string;
  webViewLink?: string;
  truncated?: boolean;
}> {
  const connection = await resolveActiveConnection(params.companyId, "google_drive");
  if (!connection) {
    return { connected: false };
  }

  const fileId = String(params.fileId || "").trim();
  if (!fileId) {
    throw new AppError("Informe fileId (use list_google_drive_files).", 400);
  }

  const auth = await getAuthorizedGoogleClient(connection);
  const drive = google.drive({ version: "v3", auth });
  const meta = await drive.files.get({
    fileId,
    fields: "id,name,mimeType,webViewLink,size"
  });

  const mimeType = String(meta.data.mimeType || "");
  const name = String(meta.data.name || "");
  const maxChars = params.maxChars || 12000;

  let content = "";

  if (mimeType.startsWith("text/") || mimeType === "application/json") {
    const res = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "text" }
    );
    content = String(res.data || "");
  } else if (TEXT_EXPORT_MIMES[mimeType]) {
    const res = await drive.files.export(
      { fileId, mimeType: TEXT_EXPORT_MIMES[mimeType] },
      { responseType: "text" }
    );
    content = String(res.data || "");
  } else {
    return {
      connected: true,
      name,
      mimeType,
      webViewLink: meta.data.webViewLink || undefined,
      content: `[Arquivo binário ou tipo não suportado para leitura automática: ${mimeType}. Use o link webViewLink ou exporte manualmente.]`
    };
  }

  const truncated = content.length > maxChars;
  if (truncated) {
    content = `${content.slice(0, maxChars)}\n\n[… conteúdo truncado em ${maxChars} caracteres]`;
  }

  return {
    connected: true,
    name,
    mimeType,
    content,
    webViewLink: meta.data.webViewLink || undefined,
    truncated
  };
}

export async function brainReadGoogleSheetsRange(params: {
  companyId: number;
  spreadsheetId: string;
  range?: string;
}): Promise<{
  connected: boolean;
  accountEmail?: string;
  spreadsheetId: string;
  range: string;
  values: string[][];
}> {
  const connection = await resolveActiveConnection(params.companyId, "google_sheets");
  if (!connection) {
    throw new AppError(
      `Google Sheets não conectado. ${connectionHint("google_sheets")}`,
      400
    );
  }

  const spreadsheetId = String(params.spreadsheetId || "").trim();
  if (!spreadsheetId) {
    throw new AppError("Informe spreadsheetId (ID da planilha na URL do Sheets).", 400);
  }

  const range = String(params.range || "A1:Z100").trim() || "A1:Z100";
  const auth = await getAuthorizedGoogleClient(connection);
  const sheets = google.sheets({ version: "v4", auth });
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range
  });

  return {
    connected: true,
    accountEmail: connection.accountEmail,
    spreadsheetId,
    range,
    values: (data.values || []) as string[][]
  };
}

export async function brainListGoogleCalendarEvents(params: {
  companyId: number;
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
}): Promise<{
  connected: boolean;
  accountEmail?: string;
  events: GoogleCalendarEventDto[];
}> {
  const now = new Date();
  const defaultMin = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultMax = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59);

  const result = await listGoogleCalendarEventsForCompany({
    companyId: params.companyId,
    timeMin: params.timeMin || defaultMin.toISOString(),
    timeMax: params.timeMax || defaultMax.toISOString(),
    maxResults: params.maxResults || 50
  });

  return {
    connected: result.connected,
    accountEmail: result.accountEmail,
    events: result.events
  };
}

export function googleWorkspaceConnectionStatus(companyId: number): Promise<
  Record<GoogleWorkspaceServiceId, { connected: boolean; accountEmail?: string }>
> {
  return (async () => {
    const services: GoogleWorkspaceServiceId[] = [
      "google_drive",
      "google_sheets",
      "google_calendar"
    ];
    const out = {} as Record<
      GoogleWorkspaceServiceId,
      { connected: boolean; accountEmail?: string }
    >;
    for (const service of services) {
      const conn = await resolveActiveConnection(companyId, service);
      out[service] = conn
        ? { connected: true, accountEmail: conn.accountEmail }
        : { connected: false };
    }
    return out;
  })();
}

function escapeCsvCell(value: string): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsv(columns: string[], rows: string[][]): string {
  const header = columns.map(escapeCsvCell).join(",");
  const body = rows.map(row =>
    row.map(cell => escapeCsvCell(String(cell ?? ""))).join(",")
  );
  return [header, ...body].join("\n");
}

async function createSpreadsheetViaSheetsApi(
  connection: GoogleWorkspaceConnection,
  params: { title: string; columns: string[]; rows: string[][] }
): Promise<{ spreadsheetId: string; webViewLink: string; name: string }> {
  const auth = await getAuthorizedGoogleClient(connection);
  const sheets = google.sheets({ version: "v4", auth });
  const title = String(params.title || "Planilha").trim() || "Planilha";
  const columns = Array.isArray(params.columns) ? params.columns : [];
  const rows = Array.isArray(params.rows) ? params.rows : [];
  const values =
    columns.length > 0 ? [columns, ...rows] : rows.length > 0 ? rows : [["Dados"]];

  let created;
  try {
    created = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title },
        sheets: [{ properties: { title: "Planilha1" } }]
      }
    });
  } catch (err: any) {
    const msg = String(err?.message || err || "");
    if (/insufficient|scope|403|permission/i.test(msg)) {
      throw new AppError(
        `Sem permissão para criar planilhas.${connectionHint("google_sheets")} Reconecte a conta para autorizar escrita.`,
        403
      );
    }
    throw err;
  }

  const spreadsheetId = String(created.data.spreadsheetId || "");
  if (!spreadsheetId) {
    throw new AppError("Google não retornou ID da planilha.", 502);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Planilha1!A1",
    valueInputOption: "USER_ENTERED",
    requestBody: { values }
  });

  const drive = google.drive({ version: "v3", auth });
  const meta = await drive.files.get({
    fileId: spreadsheetId,
    fields: "id,name,webViewLink"
  });

  return {
    spreadsheetId,
    webViewLink:
      meta.data.webViewLink ||
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    name: String(meta.data.name || title)
  };
}

async function uploadCsvToDrive(
  connection: GoogleWorkspaceConnection,
  params: { title: string; csvContent: string }
): Promise<{ fileId: string; webViewLink: string; name: string }> {
  const auth = await getAuthorizedGoogleClient(connection);
  const drive = google.drive({ version: "v3", auth });
  const name = String(params.title || "planilha.csv").trim();
  const fileName = name.endsWith(".csv") ? name : `${name}.csv`;

  let created;
  try {
    created = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: "text/csv"
      },
      media: {
        mimeType: "text/csv",
        body: Readable.from([params.csvContent])
      },
      fields: "id,name,webViewLink"
    });
  } catch (err: any) {
    const msg = String(err?.message || err || "");
    if (/insufficient|scope|403|permission/i.test(msg)) {
      throw new AppError(
        `Sem permissão para enviar arquivos ao Drive.${connectionHint("google_drive")} Reconecte a conta.`,
        403
      );
    }
    throw err;
  }

  const fileId = String(created.data.id || "");
  return {
    fileId,
    webViewLink:
      created.data.webViewLink ||
      `https://drive.google.com/file/d/${fileId}/view`,
    name: String(created.data.name || fileName)
  };
}

/** Cria planilha Google Sheets (preferencial) ou CSV no Drive e retorna link público da conta conectada. */
export async function brainSaveSpreadsheetToGoogle(params: {
  companyId: number;
  title: string;
  columns?: string[];
  rows?: string[][];
}): Promise<{
  success: boolean;
  accountEmail?: string;
  webViewLink?: string;
  spreadsheetId?: string;
  fileId?: string;
  name?: string;
  method?: "google_sheets" | "drive_csv";
  error?: string;
}> {
  const title = String(params.title || "Planilha").trim() || "Planilha";
  const columns = Array.isArray(params.columns) ? params.columns.map(String) : [];
  const rows = Array.isArray(params.rows)
    ? params.rows.map(r => (Array.isArray(r) ? r.map(String) : []))
    : [];

  const sheetsConn = await resolveActiveConnection(params.companyId, "google_sheets");
  if (sheetsConn) {
    const result = await createSpreadsheetViaSheetsApi(sheetsConn, {
      title,
      columns,
      rows
    });
    return {
      success: true,
      accountEmail: sheetsConn.accountEmail,
      webViewLink: result.webViewLink,
      spreadsheetId: result.spreadsheetId,
      name: result.name,
      method: "google_sheets"
    };
  }

  const driveConn = await resolveActiveConnection(params.companyId, "google_drive");
  if (driveConn) {
    const csvContent = buildCsv(columns, rows);
    const result = await uploadCsvToDrive(driveConn, { title, csvContent });
    return {
      success: true,
      accountEmail: driveConn.accountEmail,
      webViewLink: result.webViewLink,
      fileId: result.fileId,
      name: result.name,
      method: "drive_csv"
    };
  }

  return {
    success: false,
    error:
      "Conecte Google Sheets ou Google Drive em Integrações antes de salvar planilhas."
  };
}

/** Envia arquivo binário (PNG, JSON, PDF…) ao Drive da organização. */
export async function brainUploadBinaryToGoogleDrive(params: {
  companyId: number;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<{
  success: boolean;
  accountEmail?: string;
  fileId?: string;
  webViewLink?: string;
  name?: string;
  error?: string;
}> {
  const connection = await resolveActiveConnection(params.companyId, "google_drive");
  if (!connection) {
    return {
      success: false,
      error: `Google Drive não conectado.${connectionHint("google_drive")}`
    };
  }

  const auth = await getAuthorizedGoogleClient(connection);
  const drive = google.drive({ version: "v3", auth });
  const fileName = String(params.fileName || "arquivo").trim();

  try {
    const created = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: params.mimeType
      },
      media: {
        mimeType: params.mimeType,
        body: Readable.from([params.buffer])
      },
      fields: "id,name,webViewLink"
    });
    const fileId = String(created.data.id || "");
    return {
      success: true,
      accountEmail: connection.accountEmail,
      fileId,
      webViewLink:
        created.data.webViewLink ||
        `https://drive.google.com/file/d/${fileId}/view`,
      name: String(created.data.name || fileName)
    };
  } catch (err: any) {
    const msg = String(err?.message || err || "");
    if (/insufficient|scope|403|permission/i.test(msg)) {
      return {
        success: false,
        error: `Sem permissão para enviar ao Drive.${connectionHint("google_drive")} Reconecte a conta.`
      };
    }
    return { success: false, error: msg.slice(0, 500) };
  }
}
