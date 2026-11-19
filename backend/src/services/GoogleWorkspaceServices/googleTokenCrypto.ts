import crypto from "crypto";

const ALG = "aes-256-gcm";
const IV_LEN = 16;

function getKey(): Buffer {
  const raw =
    process.env.GOOGLE_WORKSPACE_ENCRYPTION_SECRET ||
    process.env.SMTP_SECRET_KEY ||
    process.env.JWT_SECRET ||
    "";
  return Buffer.from(crypto.createHash("sha256").update(raw).digest());
}

export function encryptGoogleSecret(text: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const key = getKey();
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptGoogleSecret(payload: string): string | null {
  try {
    const raw = Buffer.from(payload, "base64");
    if (raw.length < IV_LEN + 16) return null;
    const iv = raw.subarray(0, IV_LEN);
    const tag = raw.subarray(IV_LEN, IV_LEN + 16);
    const data = raw.subarray(IV_LEN + 16);
    const key = getKey();
    const decipher = crypto.createDecipheriv(ALG, key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}
