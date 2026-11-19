import { Request, Response } from "express";
import SmtpConfig from "../models/SmtpConfig";
import AppError from "../errors/AppError";
import {
  verifyCredentials,
  invalidateSmtpTransportCache,
  probeSmtpTcp,
  isGmailSmtpHost,
  isRailwayRuntime
} from "../helpers/SmtpTransport";
import { resolveSmtpRelayForCompany } from "../helpers/resolveSmtpRelay";
import Setting from "../models/Setting";
import { encryptRelaySecret, decryptRelaySecret } from "../helpers/RelayCrypto";
import {
  SMTP_RELAY_SETTING_URL,
  SMTP_RELAY_SETTING_SECRET_ENC
} from "../helpers/resolveSmtpRelay";

function parseSmtpPort(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 1 || n > 65535) {
    throw new AppError("INVALID_SMTP_CONFIG", 400);
  }
  return Math.trunc(n);
}

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const items = await SmtpConfig.findAll({ where: { companyId }, order: [["isDefault", "DESC"], ["createdAt", "DESC"]] });
  return res.json({ items });
};

/** Só testa conexão/credenciais — use timeout maior no cliente (não bloqueia Salvar). */
export const verifyConnection = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id, smtpHost, smtpPort, smtpUsername, smtpPassword, smtpEncryption } = req.body || {};

  const host = String(smtpHost || "").trim();
  if (!host) {
    throw new AppError("INVALID_SMTP_CONFIG", 400);
  }
  const port = parseSmtpPort(smtpPort);

  const rawPass = typeof smtpPassword === "string" ? smtpPassword.replace(/\s+/g, "") : "";
  let pass: string | undefined = rawPass.length > 0 ? rawPass : undefined;
  let selectedConfig: SmtpConfig | null = null;

  if (id != null) {
    selectedConfig = await SmtpConfig.findOne({ where: { id, companyId } });
    if (!selectedConfig) throw new AppError("SMTP_CONFIG_NOT_FOUND", 404);
  } else {
    selectedConfig = await SmtpConfig.findOne({
      where: { companyId, smtpHost: host, smtpUsername },
      order: [["isDefault", "DESC"], ["updatedAt", "DESC"]]
    });
    if (!selectedConfig) {
      selectedConfig = await SmtpConfig.findOne({
        where: { companyId },
        order: [["isDefault", "DESC"], ["updatedAt", "DESC"]]
      });
    }
  }

  if ((!pass || pass === "") && selectedConfig) {
    pass = selectedConfig.smtpPassword || undefined;
  }
  if (!pass || pass === "") {
    throw new AppError(
      "Nenhuma senha SMTP persistida foi recuperada. Salve novamente a senha de app e teste de novo. Se persistir, confira SMTP_SECRET_KEY no servidor.",
      400
    );
  }

  /** Hospedagens sem saída SMTP: verificação via worker HTTPS (relay de e-mail). */
  const relayCfg = await resolveSmtpRelayForCompany(companyId);
  if (relayCfg) {
    const base = relayCfg.url.replace(/\/+$/, "");
    const r = await fetch(`${base}/api/verify-smtp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${relayCfg.secret}`
      },
      body: JSON.stringify({
        smtp: {
          host,
          port,
          username: smtpUsername,
          password: pass,
          encryption: smtpEncryption || "tls"
        }
      }),
      signal: AbortSignal.timeout(120_000)
    });
    const text = await r.text();
    let data: { error?: string; ok?: boolean } = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new AppError(text || `RELAY_VERIFY_HTTP_${r.status}`, 400);
    }
    if (!r.ok) {
      throw new AppError(data.error || text || `Verificação via worker falhou (HTTP ${r.status}).`, 400);
    }
    return res.json({
      ok: true,
      tcpLatencyMs: 0,
      smtpRelay: true,
      message:
        "SMTP verificado pelo worker (HTTPS). O disparo de e-mails na API usa o mesmo relay quando essas variáveis estão definidas."
    });
  }

  let tcp = await probeSmtpTcp(host, port, 12000);

  // Fallback bidirecional: se a porta testada (ex.: 587 ou 465) falhar a nível TCP, testa a porta alternativa
  const altPort = port === 587 ? 465 : port === 465 ? 587 : null;
  if (tcp.ok === false && altPort && (isGmailSmtpHost(host) || host.includes("smtp"))) {
    const altProbe = await probeSmtpTcp(host, altPort, 12000);
    if (altProbe.ok === true) {
      const altEnc = altPort === 465 ? "ssl" : "tls";
      try {
        await verifyCredentials({
          smtpHost: host,
          smtpPort: altPort,
          smtpUsername,
          smtpPassword: pass,
          smtpEncryption: altEnc
        });
        return res.json({
          ok: true,
          tcpLatencyMs: altProbe.ms,
          fallbackTriggered: true,
          suggestedPort: altPort,
          suggestedEncryption: altEnc,
          message:
            `A porta ${port} não respondeu neste ambiente, mas a verificação na porta ${altPort} (${altEnc.toUpperCase()}) foi bem-sucedida! Recomendamos salvar com Porta ${altPort}.`
        });
      } catch (e: any) {
        /* se a porta alternativa também falhou a autenticação, continua tratamento normal */
      }
    }
  }

  if (tcp.ok === false) {
    const base =
      `O servidor onde roda a API não conseguiu abrir TCP até ${host}:${port} (${tcp.error}). ` +
      `Isso não é senha de app — é bloqueio de rede até o servidor SMTP.`;
    let hint = ` Peça liberação de saída nas portas 587 e 465 ou configure 465 com SSL / 587 com TLS.`;
    if (isRailwayRuntime()) {
      hint +=
        ` Esta hospedagem bloqueia saída SMTP (só HTTPS). Configure o relay de e-mail (EMAIL_SMTP_RELAY_URL + EMAIL_SMTP_RELAY_SECRET) — veja Integrações → E-mail → Para Desenvolvedores.`;
    }
    throw new AppError(base + hint, 400);
  }

  try {
    await verifyCredentials({
      smtpHost: host,
      smtpPort: port,
      smtpUsername,
      smtpPassword: pass,
      smtpEncryption
    });
  } catch (e: any) {
    const raw = String(e?.message || e || "");

    // Se falhar a autenticação TLS na porta escolhida, tenta a porta alternativa
    if (altPort && (isGmailSmtpHost(host) || host.includes("smtp"))) {
      const altEnc = altPort === 465 ? "ssl" : "tls";
      try {
        await verifyCredentials({
          smtpHost: host,
          smtpPort: altPort,
          smtpUsername,
          smtpPassword: pass,
          smtpEncryption: altEnc
        });
        return res.json({
          ok: true,
          tcpLatencyMs: tcp.ms,
          fallbackTriggered: true,
          suggestedPort: altPort,
          suggestedEncryption: altEnc,
          message:
            `A verificação na porta ${port} resultou em timeout/falha TLS (${raw}), mas a conexão na porta ${altPort} (${altEnc.toUpperCase()}) funcionou com SUCESSO! Salve com Porta ${altPort}.`
        });
      } catch {
        /* noop */
      }
    }

    const afterTcp =
      /connection timeout|ETIMEDOUT/i.test(raw) || /timeout/i.test(raw)
        ? " O teste TCP inicial passou: o bloqueio costuma ser na fase STARTTLS/TLS ou na autenticação — tente alternar entre porta 465 (SSL) e 587 (TLS), ou revise a senha de app."
        : "";
    throw new AppError(
      (raw || "Falha ao verificar SMTP após conectar (credencial, TLS ou servidor SMTP).") + afterTcp,
      400
    );
  }

  return res.json({ ok: true, tcpLatencyMs: tcp.ms });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { smtpHost, smtpPort, smtpUsername, smtpPassword, smtpEncryption, isDefault } = req.body;

  if (!smtpHost || smtpPort === undefined || smtpPort === null || smtpPort === "") {
    throw new AppError("INVALID_SMTP_CONFIG", 400);
  }
  const port = parseSmtpPort(smtpPort);

  const existingCount = await SmtpConfig.count({ where: { companyId } });
  const firstForCompany = existingCount === 0;
  const defaultWanted = !!isDefault || firstForCompany;

  if (defaultWanted) {
    await SmtpConfig.update({ isDefault: false }, { where: { companyId } });
  }

  const item = await SmtpConfig.create({
    companyId,
    smtpHost,
    smtpPort: port,
    smtpUsername,
    smtpEncryption: smtpEncryption || "tls",
    isDefault: defaultWanted
  } as any);

  if (smtpPassword) {
    (item as any).smtpPassword = smtpPassword;
    await item.save();
  }

  invalidateSmtpTransportCache(companyId);

  return res.status(201).json(item);
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params as any;
  const item = await SmtpConfig.findOne({ where: { id, companyId } });
  if (!item) throw new AppError("SMTP_CONFIG_NOT_FOUND", 404);

  const { smtpHost, smtpPort, smtpUsername, smtpPassword, smtpEncryption, isDefault } = req.body;

  if (isDefault) {
    await SmtpConfig.update({ isDefault: false }, { where: { companyId } });
  }

  const nextPort =
    smtpPort !== undefined && smtpPort !== null && smtpPort !== "" ? parseSmtpPort(smtpPort) : item.smtpPort;

  await item.update({
    smtpHost: smtpHost ?? item.smtpHost,
    smtpPort: nextPort,
    smtpUsername: smtpUsername ?? item.smtpUsername,
    smtpEncryption: smtpEncryption ?? item.smtpEncryption,
    isDefault: isDefault ?? item.isDefault
  });

  // Não apagar senha quando vier string vazia; somente atualizar se houver conteúdo
  if (smtpPassword !== undefined && smtpPassword !== "") {
    (item as any).smtpPassword = smtpPassword;
    await item.save();
  }

  invalidateSmtpTransportCache(companyId);

  return res.json(item);
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params as any;
  const item = await SmtpConfig.findOne({ where: { id, companyId } });
  if (!item) throw new AppError("SMTP_CONFIG_NOT_FOUND", 404);

  await item.destroy();
  invalidateSmtpTransportCache(companyId);
  return res.status(204).send();
};

export const setDefault = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params as any;
  const item = await SmtpConfig.findOne({ where: { id, companyId } });
  if (!item) throw new AppError("SMTP_CONFIG_NOT_FOUND", 404);

  await SmtpConfig.update({ isDefault: false }, { where: { companyId } });
  await item.update({ isDefault: true });
  invalidateSmtpTransportCache(companyId);
  return res.json(item);
};

/** GET: URL do worker (sem segredo). Segredo nunca é devolvido. */
export const getRelaySettings = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const envActive =
    !!String(process.env.EMAIL_SMTP_RELAY_URL || "").trim() &&
    !!String(process.env.EMAIL_SMTP_RELAY_SECRET || "").trim();
  const urlRow = await Setting.findOne({ where: { companyId, key: SMTP_RELAY_SETTING_URL } });
  const secRow = await Setting.findOne({ where: { companyId, key: SMTP_RELAY_SETTING_SECRET_ENC } });
  const dbUrl = String(urlRow?.value || "").trim();
  const hasDbSecret = !!(secRow?.value && decryptRelaySecret(String(secRow.value)));
  return res.json({
    environmentOverride: envActive,
    relayUrl: envActive ? "" : dbUrl,
    hasSecret: envActive || hasDbSecret,
    source: envActive ? "environment" : dbUrl || hasDbSecret ? "database" : "none"
  });
};

/** PUT: salva URL/segredo do worker no banco (criptografado). Ignorado se env da API já definir relay. */
export const putRelaySettings = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  if (
    String(process.env.EMAIL_SMTP_RELAY_URL || "").trim() &&
    String(process.env.EMAIL_SMTP_RELAY_SECRET || "").trim()
  ) {
    throw new AppError(
      "RELAY_LOCKED_BY_ENV: Worker SMTP está definido nas variáveis do servidor (EMAIL_SMTP_RELAY_*). Remova-as no painel da hospedagem para editar aqui.",
      400
    );
  }
  const { relayUrl, relaySecret } = (req.body || {}) as { relayUrl?: string; relaySecret?: string };
  const url = String(relayUrl ?? "").trim();

  if (!url) {
    await Setting.destroy({ where: { companyId, key: SMTP_RELAY_SETTING_URL } });
    await Setting.destroy({ where: { companyId, key: SMTP_RELAY_SETTING_SECRET_ENC } });
    return res.json({ ok: true });
  }

  const [urlSetting] = await Setting.findOrCreate({
    where: { companyId, key: SMTP_RELAY_SETTING_URL },
    defaults: { companyId, key: SMTP_RELAY_SETTING_URL, value: "" }
  });
  await urlSetting.update({ value: url });

  if (relaySecret !== undefined && String(relaySecret).length > 0) {
    const [secSetting] = await Setting.findOrCreate({
      where: { companyId, key: SMTP_RELAY_SETTING_SECRET_ENC },
      defaults: { companyId, key: SMTP_RELAY_SETTING_SECRET_ENC, value: "" }
    });
    await secSetting.update({ value: encryptRelaySecret(String(relaySecret)) });
  }

  return res.json({ ok: true });
};
