import { NextRequest, NextResponse } from "next/server";

/**
 * Simple in-memory rate limiter for development.
 * In production on Vercel, use Upstash Redis.
 *
 * For production:
 * 1. npm install @upstash/ratelimit @upstash/redis
 * 2. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars
 * 3. Replace this implementation with Upstash client
 */

interface RateLimitConfig {
  tokensPerWindow: number;
  windowMs: number; // milliseconds
}

class InMemoryRateLimiter {
  private store = new Map<string, { tokens: number; resetTime: number }>();

  async limit(key: string, config: RateLimitConfig): Promise<{ success: boolean; remaining: number; retryAfter?: number }> {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now > entry.resetTime) {
      // Reset window
      this.store.set(key, { tokens: config.tokensPerWindow - 1, resetTime: now + config.windowMs });
      return { success: true, remaining: config.tokensPerWindow - 1 };
    }

    if (entry.tokens > 0) {
      entry.tokens--;
      return { success: true, remaining: entry.tokens };
    }

    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return { success: false, remaining: 0, retryAfter };
  }
}

const limiter = new InMemoryRateLimiter();

/**
 * Rate limit middleware for API routes
 * Usage in your route handler:
 *   const limitResult = await rateLimit(req, "chat", { tokensPerWindow: 10, windowMs: 60000 });
 *   if (!limitResult.success) return limitResult.response;
 */
export async function rateLimit(
  req: NextRequest,
  name: string,
  config: RateLimitConfig,
  identifier?: string, // custom identifier, defaults to user IP
): Promise<{ success: boolean; response?: Response }> {
  // Use header-provided identifier or IP from headers
  const key = identifier || req.headers.get("x-forwarded-for") || "unknown";
  const limitKey = `${name}:${key}`;

  const result = await limiter.limit(limitKey, config);

  if (!result.success) {
    const response = new Response("Too many requests", { status: 429 });
    if (result.retryAfter) {
      response.headers.set("Retry-After", String(result.retryAfter));
    }
    return { success: false, response };
  }

  return { success: true };
}

/**
 * Recommended rate limits per endpoint (per minute unless noted)
 */
export const RATE_LIMITS = {
  chat: { tokensPerWindow: 10, windowMs: 60000 },
  title: { tokensPerWindow: 20, windowMs: 60000 },
  keys: { tokensPerWindow: 5, windowMs: 60000 },
  mcpConnect: { tokensPerWindow: 10, windowMs: 60000 },
  mcpKeys: { tokensPerWindow: 10, windowMs: 60000 },
  conversations: { tokensPerWindow: 30, windowMs: 60000 },
};
