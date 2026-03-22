import dns from "dns";
import { promisify } from "util";

const lookup = promisify(dns.lookup);

/**
 * Validates and sanitizes URLs to prevent SSRF attacks.
 * Rejects:
 * - Non-HTTPS schemes
 * - RFC-1918 private ranges (10.x, 172.16-31.x, 192.168.x)
 * - Link-local (169.254.x)
 * - Loopback (127.x, ::1)
 * - Metadata endpoints (169.254.169.254)
 */
export async function validateSSRFUrl(url: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const parsed = new URL(url);

    // Only HTTPS allowed
    if (parsed.protocol !== "https:") {
      return { valid: false, error: "Only HTTPS URLs are allowed" };
    }

    // Resolve hostname to IP
    let ip: string;
    try {
      const result = await lookup(parsed.hostname);
      ip = result.address;
    } catch {
      return { valid: false, error: "Failed to resolve hostname" };
    }

    // Block RFC-1918, link-local, loopback, metadata
    const blocked = [
      /^10\./,                    // 10.0.0.0/8
      /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12
      /^192\.168\./,              // 192.168.0.0/16
      /^127\./,                   // 127.0.0.0/8
      /^169\.254\./,              // 169.254.0.0/16 (link-local + metadata)
      /^::1$/,                    // IPv6 loopback
      /^fc00:/,                   // IPv6 private
    ];

    for (const pattern of blocked) {
      if (pattern.test(ip)) {
        return { valid: false, error: "URL points to a private or reserved IP range" };
      }
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, error: `Invalid URL: ${(err as Error).message}` };
  }
}

/**
 * Sanitizes user input for use in LLM prompts to prevent injection.
 * Wraps content in XML-style delimiters to signal data vs. instructions.
 */
export function sanitizeLLMContent(content: string): string {
  return `<user_data>${content}</user_data>`;
}

/**
 * Sanitizes paths to prevent directory traversal and injection.
 * Allows only alphanumeric, hyphens, underscores, dots, and forward slashes.
 */
export function sanitizeGitHubPath(input: string): { valid: boolean; error?: string; value?: string } {
  // Check for dangerous patterns
  if (input.includes("..") || input.includes("%") || !input.match(/^[\w/.-]*$/)) {
    return { valid: false, error: "Path contains invalid characters" };
  }
  return { valid: true, value: input };
}

/**
 * Generic sanitizer for GitHub identifiers (owner, repo, etc.)
 */
export function sanitizeGitHubIdentifier(input: string): { valid: boolean; error?: string; value?: string } {
  // GitHub allows alphanumeric, hyphens, underscores, dots
  if (!input.match(/^[\w.-]+$/)) {
    return { valid: false, error: "Invalid GitHub identifier" };
  }
  return { valid: true, value: input };
}

/**
 * Sanitizes error messages before returning to client.
 * Logs full error server-side, returns generic message to client.
 */
export function sanitizeErrorResponse(error: Error | unknown): { message: string; statusCode: number } {
  // Log full error server-side for debugging
  console.error("[Security] Error details:", error);

  // Return generic message to client
  return {
    message: "An internal error occurred. Please try again.",
    statusCode: 500,
  };
}
