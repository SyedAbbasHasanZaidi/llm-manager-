import { useCallback, useEffect, useRef } from "react";
import { useAppStore } from "@/store";
import type { MCPServer } from "@/types";

export function useMCP() {
  const store = useAppStore();
  const fetched = useRef(false);

  // Fetch servers from DB on mount (once)
  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;

    fetch("/api/mcp/servers")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.servers) {
          const servers: MCPServer[] = data.servers.map((s: MCPServer & { hasKey?: boolean }) => ({
            ...s,
            status: "disconnected" as const,
          }));
          store.setMCPServers(servers);
        }
      })
      .catch(() => { /* keep defaults */ });
  }, [store]);

  // Toggle enabled — persists to DB
  const toggleServer = useCallback(async (serverId: string) => {
    const srv = store.mcpServers.find(s => s.id === serverId);
    if (!srv) return;

    const newEnabled = !srv.enabled;
    store.toggleMCPServer(serverId);

    fetch("/api/mcp/servers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: serverId, enabled: newEnabled }),
    }).catch(() => {
      // Revert on failure
      store.toggleMCPServer(serverId);
    });
  }, [store]);

  // Add custom server — persists to DB
  const addCustomServer = useCallback(async (server: Omit<MCPServer, "status" | "tools" | "id">) => {
    try {
      const res = await fetch("/api/mcp/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(server),
      });
      if (!res.ok) return;
      const { server: created } = await res.json();
      store.addCustomMCPServer({ ...created, status: "disconnected", tools: created.tools ?? [] });
    } catch { /* ignore */ }
  }, [store]);

  // Save MCP server key — persists encrypted to DB
  const saveServerKey = useCallback(async (serverId: string, keyLabel: string, key: string) => {
    try {
      const res = await fetch("/api/mcp/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId, keyLabel, key }),
      });
      if (!res.ok) return false;
      store.updateMCPServerKey(serverId, true);
      return true;
    } catch {
      return false;
    }
  }, [store]);

  // Delete MCP server key
  const deleteServerKey = useCallback(async (serverId: string) => {
    try {
      const res = await fetch(`/api/mcp/keys?serverId=${serverId}`, { method: "DELETE" });
      if (!res.ok) return false;
      store.updateMCPServerKey(serverId, false);
      return true;
    } catch {
      return false;
    }
  }, [store]);

  // Delete custom server
  const deleteServer = useCallback(async (serverId: string) => {
    try {
      const res = await fetch(`/api/mcp/servers?id=${serverId}`, { method: "DELETE" });
      if (!res.ok) return;
      store.setMCPServers(store.mcpServers.filter(s => s.id !== serverId));
    } catch { /* ignore */ }
  }, [store]);

  // Connect to an MCP server (for tool discovery on HTTP/SSE servers)
  const connectServer = useCallback(async (serverId: string) => {
    const srv = store.mcpServers.find(s => s.id === serverId);
    if (!srv) return;

    store.setMCPServerStatus(serverId, "connecting");
    try {
      const res = await fetch("/api/mcp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId, url: srv.url, transport: srv.transport }),
      });
      if (!res.ok) throw new Error(await res.text());
      store.setMCPServerStatus(serverId, "connected");
    } catch {
      store.setMCPServerStatus(serverId, "error");
    }
  }, [store]);

  const disconnectServer = useCallback((serverId: string) => {
    store.setMCPServerStatus(serverId, "disconnected");
  }, [store]);

  return {
    servers:         store.mcpServers,
    enabledServers:  store.mcpServers.filter(s => s.enabled),
    toggleServer,
    addCustomServer,
    saveServerKey,
    deleteServerKey,
    deleteServer,
    connectServer,
    disconnectServer,
  };
}
