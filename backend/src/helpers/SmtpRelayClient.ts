import type { SendMailOptions } from "nodemailer";
import { getSmtpCredentialsForCompany } from "./SmtpTransport";

type RelayAttachment = {
  filename: string;
  contentBase64: string;
  contentType?: string;
  cid?: string;
  contentDisposition?: string;
};

type RelayPayload = {
  smtp: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    encryption?: string;
  };
  mail: {
    from?: string;
    to: string | string[];
    subject: string;
    html?: string;
    text?: string;
    attachments?: RelayAttachment[];
  };
};

const RELAY_MAX_ATTEMPTS = 3;
const RELAY_RETRY_BASE_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableRelayFailure(status: number | undefined, errMsg: string): boolean {
  if (status != null && (status === 408 || status === 429 || status >= 500)) return true;
  const m = String(errMsg || "").toLowerCase();
  return (
    /timeout|timed out|aborted|econnreset|econnrefused|enotfound|fetch failed|network|socket hang up|503|502|504/i.test(
      m
    )
  );
}

function serializeAttachments(mail: SendMailOptions): RelayAttachment[] | undefined {
  const list = mail.attachments;
  if (!list?.length) return undefined;
  const out: RelayAttachment[] = [];
  for (const a of list as any[]) {
    if (a.path && !a.content) {
      throw new Error(
        "SMTP_RELAY_PATH_ATTACHMENT: anexo só com path não é suportado no relay; o disparo deve usar buffer em memória."
      );
    }
    if (a.content != null) {
      const buf = Buffer.isBuffer(a.content) ? a.content : Buffer.from(String(a.content));
      out.push({
        filename: String(a.filename || "attachment"),
        contentBase64: buf.toString("base64"),
        contentType: a.contentType,
        cid: a.cid,
        contentDisposition: a.contentDisposition
      });
    }
  }
  return out.length ? out : undefined;
}

/**
 * Envia e-mail via worker HTTP (relay) que abre SMTP na internet.
 * Algumas hospedagens bloqueiam saída SMTP; o relay usa HTTPS (443) até o worker.
 * Retenta em falhas transitórias (cold start, 5xx, timeout de rede).
 */
export async function sendMailThroughHttpRelay(
  companyId: number,
  mail: SendMailOptions,
  relayUrl: string,
  relaySecret: string
): Promise<void> {
  const creds = await getSmtpCredentialsForCompany(companyId);
  const payload: RelayPayload = {
    smtp: {
      host: creds.smtpHost,
      port: creds.smtpPort,
      username: creds.smtpUsername,
      password: creds.smtpPassword ? String(creds.smtpPassword).replace(/\s+/g, "") : undefined,
      encryption: creds.smtpEncryption
    },
    mail: {
      from: mail.from as string | undefined,
      to: mail.to as string | string[],
      subject: String(mail.subject || ""),
      html: mail.html as string | undefined,
      text: mail.text as string | undefined,
      attachments: serializeAttachments(mail)
    }
  };

  const url = relayUrl.replace(/\/+$/, "");
  const targetUrl = url.endsWith("/api/send-mail") ? url : `${url}/api/send-mail`;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= RELAY_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${relaySecret}`
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(120_000)
      });

      const text = await res.text();
      let body: { error?: string; ok?: boolean };
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { error: text || `HTTP ${res.status}` };
      }

      if (!res.ok) {
        const err = new Error(body.error || `SMTP_RELAY_HTTP_${res.status}: ${text.slice(0, 500)}`);
        if (attempt < RELAY_MAX_ATTEMPTS && isRetryableRelayFailure(res.status, err.message)) {
          lastError = err;
          console.warn(
            `[SmtpRelayClient] tentativa ${attempt}/${RELAY_MAX_ATTEMPTS} falhou (${err.message}); retry...`
          );
          await sleep(RELAY_RETRY_BASE_MS * attempt);
          continue;
        }
        throw err;
      }
      if (body.ok !== true) {
        throw new Error(body.error || "SMTP_RELAY_INVALID_RESPONSE");
      }
      return;
    } catch (e: any) {
      const err = e instanceof Error ? e : new Error(String(e));
      lastError = err;
      if (attempt < RELAY_MAX_ATTEMPTS && isRetryableRelayFailure(undefined, err.message)) {
        console.warn(
          `[SmtpRelayClient] tentativa ${attempt}/${RELAY_MAX_ATTEMPTS} falhou (${err.message}); retry...`
        );
        await sleep(RELAY_RETRY_BASE_MS * attempt);
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error("SMTP_RELAY_EXHAUSTED");
}
