import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes safely */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format token count for display */
export function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000)    return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

/** Format cost in USD */
export function formatCost(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.0001) return `$${usd.toExponential(2)}`;
  if (usd < 0.01)   return `$${usd.toFixed(4)}`;
  if (usd < 1)      return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/** Estimate cost for a given token count */
export function estimateCost(inputTokens: number, outputTokens: number, inputRate: number, outputRate: number): number {
  return (inputTokens / 1000) * inputRate + (outputTokens / 1000) * outputRate;
}

/** Truncate string with ellipsis */
export function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + "…" : str;
}

/** Generate a conversation title from first message */
export function autoTitle(firstMessage: string): string {
  return truncate(firstMessage.trim().replace(/\n/g, " "), 40);
}

/** Relative time label */
export function relativeDate(date: Date): string {
  const d     = new Date(date);
  const now   = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH  = diffMs / 3600000;
  const diffD  = diffMs / 86400000;

  if (diffH < 24)  return "Today";
  if (diffD < 2)   return "Yesterday";
  if (diffD < 7)   return d.toLocaleDateString("en-AU", { weekday: "long" });
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

/** Group array by key */
export function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}

/** Generate a short random ID */
export function shortId(): string {
  return Math.random().toString(36).slice(2, 9);
}

/** Parse SSE line into event data */
export function parseSSELine(line: string): string | null {
  if (!line.startsWith("data: ")) return null;
  const data = line.slice(6);
  if (data === "[DONE]") return null;
  return data;
}
