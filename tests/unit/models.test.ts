import { describe, it, expect } from "vitest";
import {
  AVAILABLE_MODELS,
  PROVIDER_META,
  PROVIDER_ORDER,
  getModel,
  getModelsByProvider,
  groupModelsByProvider,
  selectCheapestModel,
} from "@/lib/models";
import type { Provider } from "@/types";

// ── AVAILABLE_MODELS catalog ──────────────────────────────────────────────────
describe("AVAILABLE_MODELS", () => {
  it("contains at least one model per provider", () => {
    const providers: Provider[] = ["anthropic", "openai", "google", "mistral", "cohere"];
    for (const p of providers) {
      expect(AVAILABLE_MODELS.some(m => m.provider === p)).toBe(true);
    }
  });

  it("every model has required fields with valid values", () => {
    for (const m of AVAILABLE_MODELS) {
      expect(m.id).toBeTruthy();
      expect(m.name).toBeTruthy();
      expect(m.contextWindow).toBeGreaterThan(0);
      expect(m.costPer1kInput).toBeGreaterThanOrEqual(0);
      expect(m.costPer1kOutput).toBeGreaterThanOrEqual(0);
      expect(["fast", "medium", "slow"]).toContain(m.speed);
      expect(typeof m.supportsVision).toBe("boolean");
      expect(typeof m.supportsTools).toBe("boolean");
    }
  });

  it("all model IDs are unique", () => {
    const ids = AVAILABLE_MODELS.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── PROVIDER_META ─────────────────────────────────────────────────────────────
describe("PROVIDER_META", () => {
  const providers: Provider[] = ["anthropic", "openai", "google", "mistral", "cohere"];

  it("has an entry for every provider", () => {
    for (const p of providers) {
      expect(PROVIDER_META[p]).toBeDefined();
    }
  });

  it("anthropic key prefix is 'sk-ant-'", () => {
    expect(PROVIDER_META.anthropic.keyPrefix).toBe("sk-ant-");
  });

  it("openai key prefix is 'sk-'", () => {
    expect(PROVIDER_META.openai.keyPrefix).toBe("sk-");
  });

  it("google key prefix is 'AIza'", () => {
    expect(PROVIDER_META.google.keyPrefix).toBe("AIza");
  });

  it("each entry has a non-empty label and docsUrl", () => {
    for (const p of providers) {
      expect(PROVIDER_META[p].label).toBeTruthy();
      expect(PROVIDER_META[p].docsUrl).toMatch(/^https:\/\//);
    }
  });
});

// ── PROVIDER_ORDER ────────────────────────────────────────────────────────────
describe("PROVIDER_ORDER", () => {
  it("contains all 5 providers", () => {
    expect(PROVIDER_ORDER).toHaveLength(5);
    expect(PROVIDER_ORDER).toContain("anthropic");
    expect(PROVIDER_ORDER).toContain("openai");
    expect(PROVIDER_ORDER).toContain("google");
    expect(PROVIDER_ORDER).toContain("mistral");
    expect(PROVIDER_ORDER).toContain("cohere");
  });
});

// ── getModel ──────────────────────────────────────────────────────────────────
describe("getModel", () => {
  it("returns the model for a known ID", () => {
    const m = getModel("gpt-4o");
    expect(m).toBeDefined();
    expect(m?.provider).toBe("openai");
  });

  it("returns undefined for an unknown ID", () => {
    expect(getModel("not-a-real-model-id")).toBeUndefined();
  });

  it("returns correct model for each known Claude ID", () => {
    expect(getModel("claude-opus-4-6")?.provider).toBe("anthropic");
    expect(getModel("claude-haiku-4-5-20251001")?.provider).toBe("anthropic");
  });
});

// ── getModelsByProvider ───────────────────────────────────────────────────────
describe("getModelsByProvider", () => {
  it("returns only models for the given provider", () => {
    const openai = getModelsByProvider("openai");
    expect(openai.length).toBeGreaterThan(0);
    expect(openai.every(m => m.provider === "openai")).toBe(true);
  });

  it("returns multiple models for anthropic", () => {
    expect(getModelsByProvider("anthropic").length).toBeGreaterThanOrEqual(3);
  });
});

// ── groupModelsByProvider ─────────────────────────────────────────────────────
describe("groupModelsByProvider", () => {
  it("returns a record keyed by provider", () => {
    const grouped = groupModelsByProvider();
    expect(grouped.anthropic).toBeDefined();
    expect(grouped.openai).toBeDefined();
    expect(grouped.google).toBeDefined();
    expect(grouped.mistral).toBeDefined();
    expect(grouped.cohere).toBeDefined();
  });

  it("grouped totals equal AVAILABLE_MODELS count", () => {
    const grouped = groupModelsByProvider();
    const total = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);
    expect(total).toBe(AVAILABLE_MODELS.length);
  });
});

// ── selectCheapestModel ───────────────────────────────────────────────────────
describe("selectCheapestModel", () => {
  it("returns a model with no constraints", () => {
    const m = selectCheapestModel();
    expect(m).toBeDefined();
    expect(m.id).toBeTruthy();
  });

  it("returned model supports vision when vision is required", () => {
    const m = selectCheapestModel({ vision: true });
    expect(m.supportsVision).toBe(true);
  });

  it("returned model supports tools when tools is required", () => {
    const m = selectCheapestModel({ tools: true });
    expect(m.supportsTools).toBe(true);
  });

  it("returned model meets minimum context window", () => {
    const m = selectCheapestModel({ minCtx: 200000 });
    expect(m.contextWindow).toBeGreaterThanOrEqual(200000);
  });

  it("cheapest unconstrained model has the lowest input cost in catalog", () => {
    const m = selectCheapestModel();
    const minCost = Math.min(...AVAILABLE_MODELS.map(x => x.costPer1kInput));
    expect(m.costPer1kInput).toBe(minCost);
  });

  it("falls back to first model when no candidates match", () => {
    // No model has a context window this large — should fall back
    const m = selectCheapestModel({ minCtx: 999_000_000 });
    expect(m).toBe(AVAILABLE_MODELS[0]);
  });
});
