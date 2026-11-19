const nodemailer = require("nodemailer");
const { buildTransportOptions } = require("../lib/smtpOptions");

function isConnTimeout(err) {
  const code = String((err && err.code) || "");
  const msg = String((err && err.message) || err || "").toLowerCase();
  return (
    code === "ETIMEDOUT" ||
    code === "ESOCKETTIMEDOUT" ||
    code === "ECONNRESET" ||
    /connection timeout|greeting timed out|timed out|etimedout|socket hang up/i.test(msg)
  );
}

async function sendWithPortFallback(smtp, mail) {
  const primary = {
    ...smtp,
    host: String(smtp.host || "").trim(),
    password: smtp.password ? String(smtp.password).replace(/\s+/g, "") : undefined
  };

  const trySend = async opts => {
    const t = nodemailer.createTransport(buildTransportOptions(opts));
    try {
      await t.sendMail({
        from: mail.from,
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        attachments: (mail.attachments || []).map(a => ({
          filename: a.filename,
          content: Buffer.from(a.contentBase64, "base64"),
          contentType: a.contentType,
          cid: a.cid,
          contentDisposition: a.contentDisposition
        }))
      });
    } finally {
      try {
        t.close();
      } catch (_) {
        /* ignore */
      }
    }
  };

  try {
    await trySend(primary);
    return;
  } catch (err) {
    const port = Number(primary.port) || 587;
    const canAlt = isConnTimeout(err) && (port === 465 || port === 587);
    if (!canAlt) throw err;

    const altPort = port === 465 ? 587 : 465;
    const altEnc = altPort === 465 ? "ssl" : "tls";
    console.warn(
      `[send-mail] porta ${port} falhou (${(err && err.message) || err}); tentando ${altPort}...`
    );
    await trySend({
      ...primary,
      port: altPort,
      encryption: altEnc
    });
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const secret = process.env.EMAIL_SMTP_RELAY_SECRET;
  const auth = String(req.headers.authorization || "");
  if (!secret || auth !== `Bearer ${secret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch (_) {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  if (!body || !body.smtp || !body.smtp.host || !body.mail || !body.mail.to || body.mail.subject === undefined) {
    res.status(400).json({ error: "Missing smtp.host, mail.to or mail.subject" });
    return;
  }

  try {
    await sendWithPortFallback(body.smtp, body.mail);
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
