const nodemailer = require("nodemailer");
const { buildTransportOptions } = require("../lib/smtpOptions");

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

  if (!body || !body.smtp || !body.smtp.host) {
    res.status(400).json({ error: "Missing smtp.host" });
    return;
  }

  const t = nodemailer.createTransport(buildTransportOptions(body.smtp));
  try {
    await t.verify();
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  } finally {
    try {
      t.close();
    } catch (_) {
      /* ignore */
    }
  }
};
