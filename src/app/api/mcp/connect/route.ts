import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateSSRFUrl, sanitizeErrorResponse } from "@/lib/security";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

// POST /api/mcp/connect  { serverId, url?, transport?, action? }
//
// For HTTP/SSE servers with a url: connects via MCP SDK, discovers tools, returns them.
// For stdio servers or servers without a url: returns success (tools managed client-side).
// Note: stdio transport requires a persistent process and cannot run in serverless (Vercel).

export async function POST(req: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limiting
  const limitResult = await rateLimit(req, "mcp-connect", RATE_LIMITS.mcpConnect, user.id);
  if (!limitResult.success) {
    return limitResult.response;
  }

  const { serverId, url, transport, action = "connect" } = await req.json();

  if (!serverId) {
    return NextResponse.json({ error: "serverId is required" }, { status: 400 });
  }

  if (action === "disconnect") {
    return NextResponse.json({ status: "disconnected", serverId });
  }

  // If no URL provided, the server is a catalog entry — mark as connected
  // (tools are pre-defined client-side in mcp-servers.ts)
  if (!url) {
    return NextResponse.json({ status: "connected", serverId, tools: [] });
  }

  // For HTTP/SSE servers with a real URL, connect via MCP SDK and discover tools
  try {
    // SSRF protection: validate URL before connecting
    const ssrfCheck = await validateSSRFUrl(url);
    if (!ssrfCheck.valid) {
      return NextResponse.json(
        { error: `Invalid URL: ${ssrfCheck.error}`, status: "error", serverId },
        { status: 400 },
      );
    }

    const mcpTransport = transport === "sse"
      ? new SSEClientTransport(new URL(url))
      : new StreamableHTTPClientTransport(new URL(url));

    const client = new Client(
      { name: "llm-manager", version: "1.0.0" },
      { capabilities: {} },
    );

    await client.connect(mcpTransport);
    const { tools: discoveredTools } = await client.listTools();
    await client.close();

    const tools = discoveredTools.map(t => ({
      name:        t.name,
      description: t.description ?? "",
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));

    return NextResponse.json({ status: "connected", serverId, tools });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message, status: "error", serverId },
      { status: 502 },
    );
  }
}
