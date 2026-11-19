function buildTransportOptions(smtp) {
  const port = Number(smtp.port) || 587;
  const enc = String(smtp.encryption || "tls").toLowerCase();
  const ignoreTLS = enc === "none";
  let secure = false;
  if (!ignoreTLS && port === 465) {
    secure = true;
  } else if (!ignoreTLS && enc === "ssl" && port !== 587 && port !== 25) {
    secure = true;
  }
  const requireTLS = !secure && !ignoreTLS && port !== 587 && port !== 2587;
  const password = smtp.password ? String(smtp.password).replace(/\s+/g, "") : undefined;
  return {
    host: String(smtp.host || "").trim(),
    port,
    secure,
    ignoreTLS,
    requireTLS,
    connectionTimeout: 55_000,
    greetingTimeout: 28_000,
    socketTimeout: 55_000,
    auth:
      smtp.username || password
        ? { user: smtp.username, pass: password }
        : undefined,
    tls: {
      rejectUnauthorized: false,
      servername: String(smtp.host || "").trim()
    }
  };
}

module.exports = { buildTransportOptions };
