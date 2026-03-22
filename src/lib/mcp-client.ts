/**
 * MCP Client — callCustomMCPTool
 *
 * Handles the full lifecycle for routing a tool call to a custom HTTP MCP server:
 *   1. Build an SSE transport with optional Authorization header (credential forwarding)
 *   2. Create an MCP SDK Client and connect
 *   3. Call the tool with the provided input
 *   4. Always close the connection (finally block)
 *   5. Enforce a configurable timeout via Promise.race()
 *
 * Design decisions:
 *   - The `_sdkFactory` parameter is a testability seam — production code passes
 *     undefined, the real SDK Client is instantiated internally. Tests inject a mock.
 *   - timeout defaults to 15 000 ms (15 s) which is generous for a server-side
 *     Next.js route but prevents indefinite hangs in serverless environments.
 *   - Connections are always closed in a `finally` block to prevent resource leaks
 *     even when the call or connect step throws.
 *
 * Dependency flow:
 *   callCustomMCPTool → MCP SDK Client (connect → callTool → close)
 *                     → SSEClientTransport with optional Bearer header
 */

import { Client }              from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport }  from "@modelcontextprotocol/sdk/client/sse.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MCPSdkClient {
  connect(transport: unknown): Promise<void>;
  callTool(params: { name: string; arguments: Record<string, unknown> }): Promise<unknown>;
  close(): Promise<void>;
}

export interface CallCustomMCPToolOptions {
  /** Base URL of the MCP server (HTTP/SSE endpoint) */
  serverUrl:   string;
  /** Tool name to call, exactly as registered on the server */
  toolName:    string;
  /** Parsed input object to pass as tool arguments */
  input:       Record<string, unknown>;
  /** Optional Bearer token for Authorization header */
  credential:  string | undefined;
  /** Timeout in milliseconds before the call is rejected. Default: 15 000 */
  timeoutMs?:  number;
  /**
   * Testability seam — injected SDK client factory.
   * Production callers omit this; tests pass a mock factory.
   * @internal
   */
  _sdkFactory?: () => MCPSdkClient;
}

// Default call timeout (15 seconds) — protects the serverless function budget.
const DEFAULT_TIMEOUT_MS = 15_000;

// ── callCustomMCPTool ─────────────────────────────────────────────────────────

/**
 * Connects to a custom MCP server, calls a tool, and returns the result.
 * Enforces a timeout and always closes the connection.
 *
 * @throws if the connection fails, the call times out, or the server returns an error.
 */
export async function callCustomMCPTool(opts: CallCustomMCPToolOptions): Promise<unknown> {
  const {
    serverUrl,
    toolName,
    input,
    credential,
    timeoutMs   = DEFAULT_TIMEOUT_MS,
    _sdkFactory,
  } = opts;

  // Build the Authorization header when a credential is provided.
  // This header is forwarded to the MCP server on every transport request.
  const headers: Record<string, string> = {};
  if (credential) {
    headers["Authorization"] = `Bearer ${credential}`;
  }

  const hasHeaders = Object.keys(headers).length > 0;

  // Either use the injected factory (tests) or create a real SDK client.
  const client: MCPSdkClient = _sdkFactory
    ? _sdkFactory()
    : new Client({ name: "llm-manager", version: "1.0" }, {});

  // AbortController allows the timeout to actually cancel the underlying HTTP
  // request — without this, Promise.race() would discard the timeout rejection
  // but the fetch would continue running (dangling promise / resource leak).
  const ac = new AbortController();

  // Choose the transport argument passed to connect():
  //   - Production: real SSEClientTransport with requestInit headers + abort signal
  //   - Tests (_sdkFactory injected): a plain descriptor object so the mock's
  //     connect() can inspect headers without instantiating a real HTTP transport.
  const transportArg = _sdkFactory
    ? ({ requestInit: hasHeaders ? { headers } : undefined } as unknown)
    : new SSEClientTransport(new URL(serverUrl), {
        requestInit: { ...(hasHeaders ? { headers } : {}), signal: ac.signal },
      });

  // Wrap the entire call lifecycle in a timeout race so we never block
  // the streaming response indefinitely on a slow or unresponsive MCP server.
  const callPromise = async (): Promise<unknown> => {
    try {
      await client.connect(transportArg);
      const result = await client.callTool({ name: toolName, arguments: input });
      return result ?? { content: [] };
    } finally {
      // Always close — prevents connection leaks even on errors.
      await client.close().catch(() => { /* ignore close errors */ });
    }
  };

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      ac.abort();  // Actually cancel the underlying HTTP fetch
      reject(new Error(`MCP tool call timeout after ${timeoutMs}ms: ${toolName}`));
    }, timeoutMs);
  });

  // Race the real call against the timeout; clear the timer whichever wins.
  return Promise.race([callPromise(), timeoutPromise])
    .finally(() => clearTimeout(timeoutId));
}
