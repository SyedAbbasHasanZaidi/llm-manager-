import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGORITHM  = "aes-256-gcm";
const IV_LENGTH  = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) throw new Error("ENCRYPTION_SECRET env var is not set");
  return createHash("sha256").update(secret).digest();
}

/** Encrypts a plaintext string → returns a Buffer (IV + auth tag + ciphertext) */
export function encryptKey(plaintext: string): Buffer {
  const key       = getKey();
  const iv        = randomBytes(IV_LENGTH);
  const cipher    = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag       = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

/** Decrypts a Buffer previously produced by encryptKey → returns the original string */
export function decryptKey(data: Buffer | Uint8Array | string): string {
  // Supabase returns bytea as a hex string prefixed with \x
  let buf: Buffer;
  if (typeof data === "string") {
    buf = Buffer.from(data.startsWith("\\x") ? data.slice(2) : data, "hex");
  } else {
    buf = Buffer.from(data);
  }

  const key       = getKey();
  const iv        = buf.subarray(0, IV_LENGTH);
  const tag       = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
}
