import { describe, it, expect, vi } from "vitest";
import { estimateTokens, compressContext } from "@/lib/context-compression";

// ── Module mocks ──────────────────────────────────────────────────────────────
//
// getDecryptedKey → null: simulates no connected providers.
// When all providers return null, compressContext falls back to a plain-text
// fallbackSummary (no real LLM call needed). This lets us inspect the summary
// output directly without API credentials.
vi.mock("@/lib/keys", () => ({
  getDecryptedKey: vi.fn().mockResolvedValue(null),
}));

// Override getModel so "test-small" returns a model with a 10k context window
// (budget ≈ 4 404 tokens). This lets short, readable test messages trigger
// compression instead of needing tens of thousands of filler words.
vi.mock("@/lib/models", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/models")>();
  return {
    ...original,
    getModel: (id: string) =>
      id === "test-small"
        ? {
            id: "test-small",
            name: "Test Small",
            provider: "anthropic" as const,
            contextWindow: 10_000,   // budget = floor(10000*0.85) - 4096 = 4 404 tokens
            costPer1kInput: 0.001,
            costPer1kOutput: 0.002,
            supportsVision: false,
            supportsTools: false,
            speed: "fast" as const,
          }
        : original.getModel(id),
  };
});

// ── estimateTokens ────────────────────────────────────────────────────────────

describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("returns ceil(length / 4)", () => {
    expect(estimateTokens("abcd")).toBe(1);   // 4/4 = 1.00 → 1
    expect(estimateTokens("abcde")).toBe(2);  // 5/4 = 1.25 → 2
    expect(estimateTokens("abc")).toBe(1);    // 3/4 = 0.75 → 1
  });

  it("scales linearly with text length", () => {
    expect(estimateTokens("a".repeat(100))).toBe(25);
    expect(estimateTokens("a".repeat(400))).toBe(100);
    expect(estimateTokens("a".repeat(401))).toBe(101);
  });
});

// ── compressContext ───────────────────────────────────────────────────────────

describe("compressContext", () => {
  // contextWindow 10k → budget = floor(10000 * 0.85) - 4096 = 4 404 tokens
  const SMALL_MODEL = "test-small";

  it("returns messages unchanged when under token budget", async () => {
    const messages = [
      { role: "user",      content: "Hello, can you help me?" },
      { role: "assistant", content: "Of course! What do you need?" },
    ];

    const result = await compressContext({ messages, modelId: SMALL_MODEL, userId: "u1" });

    expect(result.wasCompressed).toBe(false);
    expect(result.messages).toEqual(messages);
    expect(result.originalCount).toBe(2);
    expect(result.compressedCount).toBe(2);
  });

  it("compresses when total tokens exceed budget", async () => {
    // ~1 200 tokens per message (4 800 chars). 6 × 1 200 = 7 200 > 4 404 budget.
    const pad = "word ".repeat(960);
    const messages = Array.from({ length: 6 }, (_, i) => ({
      role:    i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i}: ${pad}`,
    }));

    const result = await compressContext({ messages, modelId: SMALL_MODEL, userId: "u1" });

    expect(result.wasCompressed).toBe(true);
    expect(result.originalCount).toBe(6);
    expect(result.compressedCount).toBeLessThan(6);
  });

  it("first compressed message is the summary block with role 'user'", async () => {
    const pad = "word ".repeat(960);
    const messages = Array.from({ length: 6 }, (_, i) => ({
      role:    i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i}: ${pad}`,
    }));

    const result = await compressContext({ messages, modelId: SMALL_MODEL, userId: "u1" });

    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content).toMatch(/^Context summary of earlier conversation:/);
  });

  it("never splits a user/assistant pair (recent messages always start with 'user')", async () => {
    const pad = "word ".repeat(960);
    const messages = Array.from({ length: 6 }, (_, i) => ({
      role:    i % 2 === 0 ? "user" : "assistant",
      content: `Pair ${Math.floor(i / 2)}, turn ${i % 2}: ${pad}`,
    }));

    const result = await compressContext({ messages, modelId: SMALL_MODEL, userId: "u1" });

    // result.messages[0] is the summary; result.messages[1] is the first retained message.
    // If this were "assistant", its preceding user turn would have been split off into
    // the summary — a broken pair. It must always be "user".
    expect(result.messages[1]?.role).toBe("user");
  });

  it("returns unchanged when modelId is unknown", async () => {
    const messages = [{ role: "user", content: "hi" }];
    const result = await compressContext({ messages, modelId: "unknown-model-xyz", userId: "u1" });

    expect(result.wasCompressed).toBe(false);
    expect(result.messages).toEqual(messages);
  });

  // ── Summary vs originals comparison ────────────────────────────────────────
  //
  // This test uses distinct, readable facts in each message so you can visually
  // verify that the generated summary (printed below) faithfully covers the old
  // messages. Run with: npm test -- --reporter=verbose
  //
  // Because getDecryptedKey is mocked to return null, the "summary" is produced
  // by fallbackSummary() which formats each old message as:
  //   [role]: <first 150 chars>…
  // This lets you compare originals vs summary without real API credentials.

  it("summary output covers the compressed messages (visual check)", async () => {
    // 30 pairs = 60 messages, each ~240 tokens → total ~14 400 > 4 404 budget
    const messages: Array<{ role: string; content: string }> = [];
    for (let i = 0; i < 30; i++) {
      messages.push({
        role:    "user",
        content: `Q${i}: The boiling point of element_${i} is ${200 + i} °C. ` + "filler ".repeat(130),
      });
      messages.push({
        role:    "assistant",
        content: `A${i}: Confirmed — element_${i} boils at ${200 + i} °C. ` + "filler ".repeat(130),
      });
    }

    const result = await compressContext({ messages, modelId: SMALL_MODEL, userId: "u1" });
    expect(result.wasCompressed).toBe(true);

    // Reconstruct which messages went into the summary vs which were kept recent
    const recentCount  = result.compressedCount - 1; // subtract the summary block
    const oldMessages  = messages.slice(0, messages.length - recentCount);
    const summary      = result.messages[0].content;

    // The fallback summary embeds each old message, so at least the first fact must appear
    expect(summary).toContain("element_0");

    // ── Visual output ─────────────────────────────────────────────────────────
    console.log("\n╔══════════════════════════════════════════════════════════╗");
    console.log(`║ ORIGINAL MESSAGES THAT WENT INTO SUMMARY (${String(oldMessages.length).padStart(2)} messages)  ║`);
    console.log("╚══════════════════════════════════════════════════════════╝");
    oldMessages.forEach((m, i) => {
      const preview = m.content.slice(0, 90).trimEnd();
      console.log(`  [${String(i).padStart(2)}] ${m.role.padEnd(9)}: ${preview}…`);
    });

    console.log("\n╔══════════════════════════════════════════════════════════╗");
    console.log("║ GENERATED SUMMARY                                        ║");
    console.log("╚══════════════════════════════════════════════════════════╝");
    // Print 80-char wrapped lines so it's readable in the terminal
    const summaryBody = summary.replace(/^Context summary of earlier conversation:\n\n/, "");
    summaryBody.split("\n").forEach(line => console.log("  " + line.slice(0, 110)));

    console.log("\n╔══════════════════════════════════════════════════════════╗");
    console.log(`║ RETAINED RECENT MESSAGES (${String(recentCount).padStart(2)} messages)                    ║`);
    console.log("╚══════════════════════════════════════════════════════════╝");
    result.messages.slice(1).forEach((m, i) => {
      const preview = m.content.slice(0, 90).trimEnd();
      console.log(`  [${String(i).padStart(2)}] ${m.role.padEnd(9)}: ${preview}…`);
    });
    console.log("");
  });
});
