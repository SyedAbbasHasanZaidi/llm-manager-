import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatTokens,
  formatCost,
  estimateCost,
  truncate,
  autoTitle,
  relativeDate,
  groupBy,
  shortId,
  parseSSELine,
} from "@/lib/utils";

// ── formatTokens ──────────────────────────────────────────────────────────────
describe("formatTokens", () => {
  it("returns raw number below 1k", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(500)).toBe("500");
  });

  it("formats thousands with 'k'", () => {
    expect(formatTokens(1000)).toBe("1.0k");
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(999999)).toBe("1000.0k");
  });

  it("formats millions with 'M'", () => {
    expect(formatTokens(1000000)).toBe("1.0M");
    expect(formatTokens(2500000)).toBe("2.5M");
  });
});

// ── formatCost ────────────────────────────────────────────────────────────────
describe("formatCost", () => {
  it("returns '$0' for zero", () => {
    expect(formatCost(0)).toBe("$0");
  });

  it("uses exponential notation for very small values", () => {
    expect(formatCost(0.00001)).toMatch(/^\$\d+\.\d+e[+-]\d+$/);
  });

  it("uses 4 decimal places for small values", () => {
    expect(formatCost(0.001)).toBe("$0.0010");
    expect(formatCost(0.0099)).toBe("$0.0099");
  });

  it("uses 3 decimal places for sub-dollar values", () => {
    expect(formatCost(0.5)).toBe("$0.500");
    expect(formatCost(0.123)).toBe("$0.123");
  });

  it("uses 2 decimal places for dollar+ values", () => {
    expect(formatCost(1.5)).toBe("$1.50");
    expect(formatCost(100)).toBe("$100.00");
  });
});

// ── estimateCost ──────────────────────────────────────────────────────────────
describe("estimateCost", () => {
  it("calculates cost correctly", () => {
    // 1000 input @ $0.003/1k + 1000 output @ $0.015/1k = $0.018
    expect(estimateCost(1000, 1000, 0.003, 0.015)).toBeCloseTo(0.018);
  });

  it("returns 0 for zero tokens", () => {
    expect(estimateCost(0, 0, 0.003, 0.015)).toBe(0);
  });

  it("handles asymmetric input/output rates", () => {
    // 500 input tokens @ $0.01/1k = $0.005, 0 output = $0.005 total
    expect(estimateCost(500, 0, 0.01, 0.02)).toBeCloseTo(0.005);
  });
});

// ── truncate ──────────────────────────────────────────────────────────────────
describe("truncate", () => {
  it("returns string unchanged when under limit", () => {
    expect(truncate("hello", 10)).toBe("hello");
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("truncates and appends ellipsis when over limit", () => {
    expect(truncate("hello world", 5)).toBe("hello…");
  });

  it("handles empty string", () => {
    expect(truncate("", 5)).toBe("");
  });
});

// ── autoTitle ─────────────────────────────────────────────────────────────────
describe("autoTitle", () => {
  it("uses the message as title when short", () => {
    expect(autoTitle("Hello")).toBe("Hello");
  });

  it("truncates long messages to 40 chars", () => {
    const long = "A very long first message that exceeds forty characters";
    const result = autoTitle(long);
    expect(result.length).toBeLessThanOrEqual(41); // 40 + ellipsis
    expect(result.endsWith("…")).toBe(true);
  });

  it("collapses newlines into spaces", () => {
    expect(autoTitle("Line one\nLine two")).toBe("Line one Line two");
  });

  it("trims leading/trailing whitespace", () => {
    expect(autoTitle("  trimmed  ")).toBe("trimmed");
  });
});

// ── relativeDate ──────────────────────────────────────────────────────────────
describe("relativeDate", () => {
  beforeEach(() => {
    // Fix "now" to 2026-03-15 12:00:00 UTC
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'Today' for a date within the last 24h", () => {
    expect(relativeDate(new Date("2026-03-15T06:00:00Z"))).toBe("Today");
    expect(relativeDate(new Date("2026-03-15T00:00:00Z"))).toBe("Today");
  });

  it("returns 'Yesterday' for a date between 24-48h ago", () => {
    expect(relativeDate(new Date("2026-03-14T12:00:00Z"))).toBe("Yesterday");
  });

  it("returns weekday name for dates within last 7 days", () => {
    // 3 days ago = 2026-03-12 = Thursday (en-AU)
    const result = relativeDate(new Date("2026-03-12T12:00:00Z"));
    expect(result).toMatch(/Thursday|Wednesday/); // timezone-safe
  });

  it("returns short date for older dates", () => {
    const result = relativeDate(new Date("2026-01-01T12:00:00Z"));
    expect(result).toContain("Jan");
  });
});

// ── groupBy ───────────────────────────────────────────────────────────────────
describe("groupBy", () => {
  it("groups items by key", () => {
    const items = [
      { type: "a", val: 1 },
      { type: "b", val: 2 },
      { type: "a", val: 3 },
    ];
    const result = groupBy(items, i => i.type);
    expect(result.a).toHaveLength(2);
    expect(result.b).toHaveLength(1);
  });

  it("returns empty object for empty array", () => {
    expect(groupBy([], i => (i as string))).toEqual({});
  });
});

// ── shortId ───────────────────────────────────────────────────────────────────
describe("shortId", () => {
  it("generates a string of length 7", () => {
    expect(shortId()).toHaveLength(7);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => shortId()));
    expect(ids.size).toBeGreaterThan(90); // allow very small collision chance
  });
});

// ── parseSSELine ──────────────────────────────────────────────────────────────
describe("parseSSELine", () => {
  it("returns null for non-data lines", () => {
    expect(parseSSELine("event: ping")).toBeNull();
    expect(parseSSELine("id: 123")).toBeNull();
    expect(parseSSELine("")).toBeNull();
  });

  it("returns null for [DONE] sentinel", () => {
    expect(parseSSELine("data: [DONE]")).toBeNull();
  });

  it("returns the JSON payload for data lines", () => {
    const payload = JSON.stringify({ type: "text_delta", payload: "hello" });
    expect(parseSSELine(`data: ${payload}`)).toBe(payload);
  });
});
