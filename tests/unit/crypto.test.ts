import { describe, it, expect, beforeAll } from "vitest";
import { encryptKey, decryptKey } from "@/lib/crypto";

beforeAll(() => {
  // The crypto module reads ENCRYPTION_SECRET at call time
  process.env.ENCRYPTION_SECRET = "test-secret-for-unit-tests-32chars!!";
});

// ── encryptKey / decryptKey roundtrip ─────────────────────────────────────────
describe("encryptKey + decryptKey", () => {
  it("roundtrips a simple string", () => {
    const original = "sk-ant-api03-test-key-value";
    const encrypted = encryptKey(original);
    expect(decryptKey(encrypted)).toBe(original);
  });

  it("roundtrips an empty string", () => {
    const encrypted = encryptKey("");
    expect(decryptKey(encrypted)).toBe("");
  });

  it("roundtrips a unicode string", () => {
    const original = "héllo wörld 🔑";
    const encrypted = encryptKey(original);
    expect(decryptKey(encrypted)).toBe(original);
  });

  it("roundtrips a long string (simulates real API key)", () => {
    const original = "sk-proj-" + "a".repeat(128);
    const encrypted = encryptKey(original);
    expect(decryptKey(encrypted)).toBe(original);
  });

  it("produces different ciphertext each time (random IV)", () => {
    const key = "same-plaintext";
    const enc1 = encryptKey(key);
    const enc2 = encryptKey(key);
    // IVs are random so ciphertexts differ
    expect(enc1.equals(enc2)).toBe(false);
    // But both decrypt correctly
    expect(decryptKey(enc1)).toBe(key);
    expect(decryptKey(enc2)).toBe(key);
  });

  it("encrypted output has correct minimum byte length (IV=12 + tag=16 + data)", () => {
    const original = "hello"; // 5 bytes
    const encrypted = encryptKey(original);
    expect(encrypted.length).toBe(12 + 16 + 5); // IV + tag + ciphertext
  });
});

// ── decryptKey with hex string input ─────────────────────────────────────────
describe("decryptKey with hex string input", () => {
  it("accepts a plain hex string (no prefix)", () => {
    const original = "my-api-key-value";
    const encrypted = encryptKey(original);
    const hexStr = encrypted.toString("hex");
    expect(decryptKey(hexStr)).toBe(original);
  });

  it("accepts \\x-prefixed hex string (Supabase bytea format)", () => {
    const original = "my-api-key-value";
    const encrypted = encryptKey(original);
    const hexStr = "\\x" + encrypted.toString("hex");
    expect(decryptKey(hexStr)).toBe(original);
  });
});

// ── Error cases ───────────────────────────────────────────────────────────────
describe("encryptKey error handling", () => {
  it("throws when ENCRYPTION_SECRET is missing", () => {
    const saved = process.env.ENCRYPTION_SECRET;
    delete process.env.ENCRYPTION_SECRET;
    expect(() => encryptKey("anything")).toThrow("ENCRYPTION_SECRET");
    process.env.ENCRYPTION_SECRET = saved;
  });
});

describe("decryptKey error handling", () => {
  it("throws on tampered ciphertext (GCM auth tag mismatch)", () => {
    const encrypted = encryptKey("original");
    // Flip a byte in the ciphertext area (after IV + tag)
    encrypted[12 + 16] ^= 0xff;
    expect(() => decryptKey(encrypted)).toThrow();
  });
});
