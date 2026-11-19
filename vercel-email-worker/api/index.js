module.exports = async function handler(_req, res) {
  res.status(200).json({
    ok: true,
    service: "vercel-email-worker",
    endpoints: ["/api/health", "/api/send-mail", "/api/verify-smtp"]
  });
};
