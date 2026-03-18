import { describe, it, expect } from "vitest";
import { toDbProvider } from "@/lib/keys";

// ── toDbProvider ──────────────────────────────────────────────────────────────
// Maps app-level provider names to the DB enum values stored in Supabase.
describe("toDbProvider", () => {
  it("maps 'google' → 'google_ai'", () => {
    expect(toDbProvider("google")).toBe("google_ai");
  });

  it("passes through unmapped providers unchanged", () => {
    expect(toDbProvider("anthropic")).toBe("anthropic");
    expect(toDbProvider("openai")).toBe("openai");
    expect(toDbProvider("mistral")).toBe("mistral");
    expect(toDbProvider("cohere")).toBe("cohere");
  });

  it("passes through unknown strings unchanged", () => {
    expect(toDbProvider("some_future_provider")).toBe("some_future_provider");
  });
});
