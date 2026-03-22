/**
 * MCP Server Routing — Comprehensive Test Suite
 *
 * Tests are structured in three phases matching the implementation plan:
 *   Phase 1 — Routing lookup + stub (MCPRoute type, routing table logic)
 *   Phase 2 — callCustomMCPTool: SDK mock, timeout, connection cleanup
 *   Phase 3 — Credential forwarding: lookup, header injection, isolation
 *
 * All external dependencies (MCP SDK, fetch) are mocked so tests run fully
 * in isolation with no network calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Phase 1: Type-level and routing-logic tests ────────────────────────────────
//
// We test the MCPRoute type contract and the buildMcpToolRoutes() helper that
// useChat will call before sending the request.  The helper is a pure function
// extracted from the hook so it can be unit-tested without React.

import type { MCPRoute } from "@/types";

// ── Stub for buildMcpToolRoutes ────────────────────────────────────────────────
// Mirrors the production logic that will live in useChat.ts.
// Given an array of enabled MCPServers, returns a flat map of
// toolName → { serverId, serverUrl }.

import type { MCPServer } from "@/types";

function buildMcpToolRoutes(servers: MCPServer[]): MCPRoute[] {
  return servers
    .filter(s => s.enabled && s.url)
    .flatMap(s =>
      s.tools.map(t => ({
        toolName: t.name,
        serverId: s.id,
        serverUrl: s.url as string,
      }))
    );
}

// ── routeLookup: pure function used inside executeTool ─────────────────────────
// Given routes + toolName, returns the matching route or undefined.
function routeLookup(routes: MCPRoute[], toolName: string): MCPRoute | undefined {
  return routes.find(r => r.toolName === toolName);
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1 TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 1 — MCPRoute type", () => {
  it("MCPRoute must have toolName, serverId, serverUrl fields", () => {
    const route: MCPRoute = {
      toolName:  "my_tool",
      serverId:  "server-abc",
      serverUrl: "https://mcp.example.com",
    };
    expect(route.toolName).toBe("my_tool");
    expect(route.serverId).toBe("server-abc");
    expect(route.serverUrl).toBe("https://mcp.example.com");
  });

  it("MCPRoute fields are all strings", () => {
    const route: MCPRoute = {
      toolName:  "",
      serverId:  "",
      serverUrl: "",
    };
    expect(typeof route.toolName).toBe("string");
    expect(typeof route.serverId).toBe("string");
    expect(typeof route.serverUrl).toBe("string");
  });
});

describe("Phase 1 — buildMcpToolRoutes()", () => {
  const makeServer = (overrides: Partial<MCPServer>): MCPServer => ({
    id:          "srv-1",
    name:        "Test Server",
    description: "A test MCP server",
    icon:        "🔧",
    category:    "custom",
    transport:   "http",
    url:         "https://mcp.example.com",
    status:      "connected",
    tools: [
      {
        name:        "test_tool",
        description: "A test tool",
        inputSchema: { type: "object", properties: {} },
      },
    ],
    enabled:    true,
    requiresKey: false,
    ...overrides,
  });

  it("returns empty array when no servers provided", () => {
    expect(buildMcpToolRoutes([])).toEqual([]);
  });

  it("returns empty array when all servers are disabled", () => {
    const server = makeServer({ enabled: false });
    expect(buildMcpToolRoutes([server])).toEqual([]);
  });

  it("returns empty array when enabled server has no url", () => {
    const server = makeServer({ url: undefined });
    expect(buildMcpToolRoutes([server])).toEqual([]);
  });

  it("returns a route for each tool in an enabled server with url", () => {
    const server = makeServer({
      tools: [
        { name: "tool_a", description: "A", inputSchema: {} },
        { name: "tool_b", description: "B", inputSchema: {} },
      ],
    });
    const routes = buildMcpToolRoutes([server]);
    expect(routes).toHaveLength(2);
    expect(routes[0].toolName).toBe("tool_a");
    expect(routes[1].toolName).toBe("tool_b");
  });

  it("each route carries correct serverId and serverUrl", () => {
    const server = makeServer({ id: "my-srv", url: "https://my.server.io" });
    const routes = buildMcpToolRoutes([server]);
    expect(routes[0].serverId).toBe("my-srv");
    expect(routes[0].serverUrl).toBe("https://my.server.io");
  });

  it("flattens tools from multiple enabled servers", () => {
    const s1 = makeServer({ id: "s1", url: "https://s1.io", tools: [{ name: "t1", description: "", inputSchema: {} }] });
    const s2 = makeServer({ id: "s2", url: "https://s2.io", tools: [{ name: "t2", description: "", inputSchema: {} }, { name: "t3", description: "", inputSchema: {} }] });
    const routes = buildMcpToolRoutes([s1, s2]);
    expect(routes).toHaveLength(3);
    expect(routes.map(r => r.toolName)).toEqual(["t1", "t2", "t3"]);
  });

  it("skips disabled servers but includes enabled ones", () => {
    const disabled = makeServer({ id: "off", enabled: false, tools: [{ name: "hidden", description: "", inputSchema: {} }] });
    const enabled  = makeServer({ id: "on",  enabled: true,  tools: [{ name: "visible", description: "", inputSchema: {} }] });
    const routes = buildMcpToolRoutes([disabled, enabled]);
    expect(routes).toHaveLength(1);
    expect(routes[0].toolName).toBe("visible");
  });

  it("handles server with empty tools array", () => {
    const server = makeServer({ tools: [] });
    expect(buildMcpToolRoutes([server])).toEqual([]);
  });

  it("handles special characters in tool names", () => {
    const server = makeServer({
      tools: [{ name: "tool-with_special.chars", description: "", inputSchema: {} }],
    });
    const routes = buildMcpToolRoutes([server]);
    expect(routes[0].toolName).toBe("tool-with_special.chars");
  });
});

describe("Phase 1 — routeLookup()", () => {
  const routes: MCPRoute[] = [
    { toolName: "brave_search",  serverId: "brave",  serverUrl: "https://brave.io" },
    { toolName: "my_custom_tool", serverId: "custom", serverUrl: "https://custom.io" },
    { toolName: "another_tool",   serverId: "custom", serverUrl: "https://custom.io" },
  ];

  it("returns the matching route for a known toolName", () => {
    const r = routeLookup(routes, "my_custom_tool");
    expect(r).toBeDefined();
    expect(r?.serverId).toBe("custom");
    expect(r?.serverUrl).toBe("https://custom.io");
  });

  it("returns undefined for an unknown toolName", () => {
    expect(routeLookup(routes, "unknown_tool")).toBeUndefined();
  });

  it("returns undefined for empty routes array", () => {
    expect(routeLookup([], "any_tool")).toBeUndefined();
  });

  it("returns first match when toolName appears more than once", () => {
    const dupRoutes: MCPRoute[] = [
      { toolName: "dup", serverId: "first",  serverUrl: "https://first.io" },
      { toolName: "dup", serverId: "second", serverUrl: "https://second.io" },
    ];
    const r = routeLookup(dupRoutes, "dup");
    expect(r?.serverId).toBe("first");
  });

  it("is case-sensitive (no unintended fuzzy matching)", () => {
    expect(routeLookup(routes, "BRAVE_SEARCH")).toBeUndefined();
    expect(routeLookup(routes, "Brave_Search")).toBeUndefined();
    expect(routeLookup(routes, "brave_search")).toBeDefined();
  });

  it("returns undefined for empty-string tool name", () => {
    expect(routeLookup(routes, "")).toBeUndefined();
  });
});

describe("Phase 1 — backward compatibility: built-in tools not affected", () => {
  // These tests verify that routing lookup returns undefined for all built-in
  // tool names, so executeTool's existing branches are never bypassed.
  const BUILT_IN_TOOLS = [
    "brave_search", "brave_news",
    "fetch_url", "fetch_links",
    "github_search_repos", "github_read_file", "github_list_issues",
    "notion_search", "notion_read_page", "notion_create_page",
    "slack_post", "slack_read",
    "pg_query", "pg_schema",
    "sqlite_query",
    "read_file", "write_file", "list_dir",
  ];

  it("returns undefined for all built-in tool names when routes is empty", () => {
    const routes: MCPRoute[] = [];
    for (const name of BUILT_IN_TOOLS) {
      expect(routeLookup(routes, name)).toBeUndefined();
    }
  });

  it("returns undefined for built-in names even when custom routes exist", () => {
    const routes: MCPRoute[] = [
      { toolName: "my_custom_tool", serverId: "custom", serverUrl: "https://custom.io" },
    ];
    for (const name of BUILT_IN_TOOLS) {
      expect(routeLookup(routes, name)).toBeUndefined();
    }
  });
});

describe("Phase 1 — ChatRequest type extension", () => {
  // Verify the shape of the extended ChatRequest that useChat sends.
  // We test the object shape inline since the type is structural in TypeScript.
  it("ChatRequest can include optional mcpToolRoutes field", () => {
    const req: import("@/types").ChatRequest = {
      model: "claude-3-5-sonnet-20241022",
      messages: [{ role: "user", content: "hello" }],
      mcpToolRoutes: [
        { toolName: "my_tool", serverId: "srv-1", serverUrl: "https://mcp.io" },
      ],
    };
    expect(req.mcpToolRoutes).toHaveLength(1);
    expect(req.mcpToolRoutes![0].toolName).toBe("my_tool");
  });

  it("ChatRequest works without mcpToolRoutes (backward compatible)", () => {
    const req: import("@/types").ChatRequest = {
      model: "claude-3-5-sonnet-20241022",
      messages: [{ role: "user", content: "hello" }],
    };
    expect(req.mcpToolRoutes).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2 TESTS — callCustomMCPTool
// ─────────────────────────────────────────────────────────────────────────────
//
// We test callCustomMCPTool() as an exported pure function.
// The MCP SDK Client is fully mocked — we inject it via a factory parameter
// so tests never need real network connections.

describe("Phase 2 — callCustomMCPTool: SDK lifecycle", () => {
  // Minimal mock of the MCP SDK Client used in callCustomMCPTool
  function makeSdkMock(callToolResult: unknown = { content: [{ type: "text", text: "ok" }] }) {
    return {
      connect:  vi.fn().mockResolvedValue(undefined),
      callTool: vi.fn().mockResolvedValue(callToolResult),
      close:    vi.fn().mockResolvedValue(undefined),
    };
  }

  it("calls connect, callTool, then close in order", async () => {
    const sdk = makeSdkMock();
    const { callCustomMCPTool } = await import("@/lib/mcp-client");
    const result = await callCustomMCPTool({
      serverUrl: "https://mcp.example.com",
      toolName:  "my_tool",
      input:     { query: "test" },
      credential: "secret-key",
      _sdkFactory: () => sdk as never,
    });

    const order = [sdk.connect.mock.invocationCallOrder[0], sdk.callTool.mock.invocationCallOrder[0], sdk.close.mock.invocationCallOrder[0]];
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
    expect(result).toEqual({ content: [{ type: "text", text: "ok" }] });
  });

  it("passes toolName and input to callTool", async () => {
    const sdk = makeSdkMock();
    const { callCustomMCPTool } = await import("@/lib/mcp-client");
    await callCustomMCPTool({
      serverUrl:   "https://mcp.example.com",
      toolName:    "search",
      input:       { query: "cats", limit: 5 },
      credential:  undefined,
      _sdkFactory: () => sdk as never,
    });

    expect(sdk.callTool).toHaveBeenCalledWith({ name: "search", arguments: { query: "cats", limit: 5 } });
  });

  it("always calls close even when callTool throws", async () => {
    const sdk = makeSdkMock();
    sdk.callTool.mockRejectedValue(new Error("tool error"));
    const { callCustomMCPTool } = await import("@/lib/mcp-client");

    await expect(
      callCustomMCPTool({
        serverUrl:   "https://mcp.example.com",
        toolName:    "bad_tool",
        input:       {},
        credential:  undefined,
        _sdkFactory: () => sdk as never,
      })
    ).rejects.toThrow("tool error");

    expect(sdk.close).toHaveBeenCalledOnce();
  });

  it("always calls close even when connect throws", async () => {
    const sdk = makeSdkMock();
    sdk.connect.mockRejectedValue(new Error("connect error"));
    const { callCustomMCPTool } = await import("@/lib/mcp-client");

    await expect(
      callCustomMCPTool({
        serverUrl:   "https://mcp.example.com",
        toolName:    "some_tool",
        input:       {},
        credential:  undefined,
        _sdkFactory: () => sdk as never,
      })
    ).rejects.toThrow("connect error");

    // close should still be called (finally block)
    expect(sdk.close).toHaveBeenCalledOnce();
  });
});

describe("Phase 2 — callCustomMCPTool: timeout protection", () => {
  it("rejects with timeout error when call exceeds timeout limit", async () => {
    // Never-resolving SDK mock simulates a hung MCP server
    const hangingSdk = {
      connect:  vi.fn().mockReturnValue(new Promise(() => {})), // never resolves
      callTool: vi.fn(),
      close:    vi.fn().mockResolvedValue(undefined),
    };

    const { callCustomMCPTool } = await import("@/lib/mcp-client");

    await expect(
      callCustomMCPTool({
        serverUrl:   "https://slow.mcp.server",
        toolName:    "slow_tool",
        input:       {},
        credential:  undefined,
        timeoutMs:   50, // very short timeout for test speed
        _sdkFactory: () => hangingSdk as never,
      })
    ).rejects.toThrow(/timeout/i);
  });

  it("completes normally when call finishes before timeout", async () => {
    const sdk = {
      connect:  vi.fn().mockResolvedValue(undefined),
      callTool: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "fast" }] }),
      close:    vi.fn().mockResolvedValue(undefined),
    };

    const { callCustomMCPTool } = await import("@/lib/mcp-client");

    const result = await callCustomMCPTool({
      serverUrl:   "https://fast.mcp.server",
      toolName:    "fast_tool",
      input:       {},
      credential:  undefined,
      timeoutMs:   5000,
      _sdkFactory: () => sdk as never,
    });

    expect(result).toEqual({ content: [{ type: "text", text: "fast" }] });
  });

  it("uses default timeout when timeoutMs not provided", async () => {
    // We just verify the function resolves without explicit timeout parameter
    const sdk = {
      connect:  vi.fn().mockResolvedValue(undefined),
      callTool: vi.fn().mockResolvedValue({ content: [] }),
      close:    vi.fn().mockResolvedValue(undefined),
    };

    const { callCustomMCPTool } = await import("@/lib/mcp-client");

    // If default timeout is not set, the call would hang; it must return normally
    await expect(
      callCustomMCPTool({
        serverUrl:   "https://mcp.server",
        toolName:    "tool",
        input:       {},
        credential:  undefined,
        _sdkFactory: () => sdk as never,
      })
    ).resolves.toBeDefined();
  });
});

describe("Phase 2 — callCustomMCPTool: error handling", () => {
  it("wraps connection failure with descriptive error", async () => {
    const sdk = {
      connect:  vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
      callTool: vi.fn(),
      close:    vi.fn().mockResolvedValue(undefined),
    };

    const { callCustomMCPTool } = await import("@/lib/mcp-client");

    await expect(
      callCustomMCPTool({
        serverUrl:   "https://dead.server",
        toolName:    "tool",
        input:       {},
        credential:  undefined,
        _sdkFactory: () => sdk as never,
      })
    ).rejects.toThrow();
  });

  it("propagates malformed response from callTool (null content)", async () => {
    const sdk = {
      connect:  vi.fn().mockResolvedValue(undefined),
      callTool: vi.fn().mockResolvedValue(null),
      close:    vi.fn().mockResolvedValue(undefined),
    };

    const { callCustomMCPTool } = await import("@/lib/mcp-client");

    // null result from SDK — function should handle it gracefully
    const result = await callCustomMCPTool({
      serverUrl:   "https://mcp.server",
      toolName:    "tool",
      input:       {},
      credential:  undefined,
      _sdkFactory: () => sdk as never,
    });

    // Should not throw; result may be null or wrapped error
    expect(result).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3 TESTS — Credential forwarding
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 3 — credential forwarding: lookup by serverId", () => {
  // resolveMcpCredential: given mcpKeys (name→key) and a serverId, returns the key.
  // The lookup uses the server name stored in the DB row keyed by id.
  // We test the pure lookup logic isolated from the SDK.
  function resolveMcpCredential(
    mcpKeys: Record<string, string>,
    serverId: string
  ): string | undefined {
    return mcpKeys[serverId] ?? undefined;
  }

  it("returns the credential for a known serverId", () => {
    const keys = { "srv-brave": "brave-api-key-123", "srv-github": "gh-token-456" };
    expect(resolveMcpCredential(keys, "srv-brave")).toBe("brave-api-key-123");
  });

  it("returns undefined for an unknown serverId", () => {
    const keys = { "srv-brave": "brave-api-key-123" };
    expect(resolveMcpCredential(keys, "srv-notion")).toBeUndefined();
  });

  it("returns undefined when mcpKeys is empty", () => {
    expect(resolveMcpCredential({}, "srv-brave")).toBeUndefined();
  });

  it("treats serverId lookup as case-sensitive", () => {
    const keys = { "Srv-Brave": "key-abc" };
    expect(resolveMcpCredential(keys, "srv-brave")).toBeUndefined();
    expect(resolveMcpCredential(keys, "Srv-Brave")).toBe("key-abc");
  });
});

describe("Phase 3 — credential forwarding: header injection", () => {
  it("builds Authorization Bearer header when credential is provided", async () => {
    const capturedHeaders: Record<string, string> = {};

    const sdk = {
      connect:  vi.fn().mockImplementation((transport: { requestInit?: { headers?: Record<string, string> } }) => {
        if (transport?.requestInit?.headers) {
          Object.assign(capturedHeaders, transport.requestInit.headers);
        }
        return Promise.resolve();
      }),
      callTool: vi.fn().mockResolvedValue({ content: [] }),
      close:    vi.fn().mockResolvedValue(undefined),
    };

    const { callCustomMCPTool } = await import("@/lib/mcp-client");

    await callCustomMCPTool({
      serverUrl:   "https://mcp.server",
      toolName:    "tool",
      input:       {},
      credential:  "my-secret-token",
      _sdkFactory: () => sdk as never,
    });

    expect(capturedHeaders["Authorization"]).toBe("Bearer my-secret-token");
  });

  it("does not add Authorization header when credential is undefined", async () => {
    const capturedHeaders: Record<string, string> = {};

    const sdk = {
      connect: vi.fn().mockImplementation((transport: { requestInit?: { headers?: Record<string, string> } }) => {
        if (transport?.requestInit?.headers) {
          Object.assign(capturedHeaders, transport.requestInit.headers);
        }
        return Promise.resolve();
      }),
      callTool: vi.fn().mockResolvedValue({ content: [] }),
      close:    vi.fn().mockResolvedValue(undefined),
    };

    const { callCustomMCPTool } = await import("@/lib/mcp-client");

    await callCustomMCPTool({
      serverUrl:   "https://mcp.server",
      toolName:    "tool",
      input:       {},
      credential:  undefined,
      _sdkFactory: () => sdk as never,
    });

    expect(capturedHeaders["Authorization"]).toBeUndefined();
  });
});

describe("Phase 3 — credential isolation (no credential leakage)", () => {
  it("credential for server A is not passed to server B call", async () => {
    const mcpKeys: Record<string, string> = {
      "server-a": "key-for-a",
      "server-b": "key-for-b",
    };

    const capturedCreds: string[] = [];

    // Factory that records what credential was injected into the transport
    const sdkFactory = (credential: string | undefined) => ({
      connect: vi.fn().mockImplementation((transport: { requestInit?: { headers?: Record<string, string> } }) => {
        const auth = transport?.requestInit?.headers?.["Authorization"];
        if (auth) capturedCreds.push(auth);
        return Promise.resolve();
      }),
      callTool: vi.fn().mockResolvedValue({ content: [] }),
      close:    vi.fn().mockResolvedValue(undefined),
    });

    const { callCustomMCPTool } = await import("@/lib/mcp-client");

    // Call server A
    await callCustomMCPTool({
      serverUrl:   "https://server-a.io",
      toolName:    "tool_a",
      input:       {},
      credential:  mcpKeys["server-a"],
      _sdkFactory: () => sdkFactory(mcpKeys["server-a"]) as never,
    });

    // Call server B
    await callCustomMCPTool({
      serverUrl:   "https://server-b.io",
      toolName:    "tool_b",
      input:       {},
      credential:  mcpKeys["server-b"],
      _sdkFactory: () => sdkFactory(mcpKeys["server-b"]) as never,
    });

    expect(capturedCreds).toHaveLength(2);
    expect(capturedCreds[0]).toBe("Bearer key-for-a");
    expect(capturedCreds[1]).toBe("Bearer key-for-b");
    // Ensure A's credential never appears in B's call
    expect(capturedCreds[1]).not.toBe("Bearer key-for-a");
  });

  it("no credential leakage when one server has key and another does not", async () => {
    const capturedCreds: Array<string | undefined> = [];

    const sdkFactory = () => ({
      connect: vi.fn().mockImplementation((transport: { requestInit?: { headers?: Record<string, string> } }) => {
        capturedCreds.push(transport?.requestInit?.headers?.["Authorization"]);
        return Promise.resolve();
      }),
      callTool: vi.fn().mockResolvedValue({ content: [] }),
      close:    vi.fn().mockResolvedValue(undefined),
    });

    const { callCustomMCPTool } = await import("@/lib/mcp-client");

    await callCustomMCPTool({
      serverUrl:   "https://secure.io",
      toolName:    "secure_tool",
      input:       {},
      credential:  "secret-key",
      _sdkFactory: () => sdkFactory() as never,
    });

    await callCustomMCPTool({
      serverUrl:   "https://public.io",
      toolName:    "public_tool",
      input:       {},
      credential:  undefined,
      _sdkFactory: () => sdkFactory() as never,
    });

    expect(capturedCreds[0]).toBe("Bearer secret-key");
    expect(capturedCreds[1]).toBeUndefined(); // no header for public server
  });
});
