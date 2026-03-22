import { useCallback, useRef } from "react";
import { useAppStore, useActiveConversation } from "@/store";
import type { Message, ToolCall, MCPRoute } from "@/types";
import { getModel } from "@/lib/models";
import { estimateCost } from "@/lib/utils";
import { autoTitle } from "@/lib/utils";

export function useChat(conversationId?: string) {
  const store            = useAppStore();
  const activeConv       = useActiveConversation();
  const abortRef         = useRef<AbortController | null>(null);

  // Use provided convId, or fall back to active
  const convId = conversationId ?? store.activeConversationId;

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;

    // Ensure a conversation exists — created lazily on first send so the
    // conversation is never persisted until the user actually submits a prompt.
    let cid = convId;
    if (!cid) {
      cid = store.createConversation(store.activeModelId);
      // Persist to DB now that the user has committed to this conversation
      persistConversationToDB(cid, store.activeModelId);
    }

    // Add user message
    const userMsg: Message = {
      id: crypto.randomUUID(), role: "user", content, createdAt: new Date(),
    };
    store.addMessage(cid, userMsg);

    // Create empty assistant message (will stream into this)
    const asstId = crypto.randomUUID();
    const asstMsg: Message = {
      id: asstId, role: "assistant", content: "",
      model: store.activeModelId, streaming: true,
      toolCalls: [], createdAt: new Date(),
    };
    store.addMessage(cid, asstMsg);
    store.setStreamingMsgId(asstId);

    // Abort any previous stream
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Gather history for the API — read fresh state to include just-added messages
    const conv     = useAppStore.getState().conversations.find(c => c.id === cid);
    const history  = (conv?.messages ?? [])
      .filter(m => !m.streaming)
      .map(m => ({ role: m.role, content: m.content }));

    // Build routing table: for custom servers with a URL, map each tool to
    // its serverId + serverUrl so the API route can forward the call.
    // Built-in catalog servers (no url) are excluded — executeTool handles them.
    const enabledServers = store.mcpServers.filter(s => s.enabled);
    const mcpToolRoutes: MCPRoute[] = enabledServers
      .filter(s => !!s.url)
      .flatMap(s =>
        s.tools.map(t => ({
          toolName:  t.name,
          serverId:  s.id,
          serverUrl: s.url as string,
        }))
      );

    try {
      const res = await fetch("/api/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          model:         store.activeModelId,
          messages:      history,
          tools:         enabledServers.flatMap(s => s.tools),
          mcpToolRoutes,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`API error ${res.status}: ${await res.text()}`);
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value, { stream: true }).split("\n").filter(Boolean);
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6);
          if (raw === "[DONE]") break;
          try {
            handleEvent(JSON.parse(raw), cid, asstId);
          } catch { /* malformed chunk */ }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") return;
      store.updateMessage(cid, asstId, {
        content:   "⚠️ Something went wrong. Check your API key and try again.",
        streaming: false,
      });
    } finally {
      store.updateMessage(cid, asstId, { streaming: false });
      store.setStreamingMsgId(null);

      // Auto-generate a smart title after first exchange
      generateSmartTitle(store, cid);
    }
  }, [store, convId]);

  function handleEvent(
    event: { type: string; payload: unknown },
    cid: string,
    msgId: string,
  ) {
    switch (event.type) {
      case "text_delta":
        store.appendContent(cid, msgId, event.payload as string);
        break;

      case "tool_start": {
        const tool = event.payload as ToolCall;
        const conv = store.conversations.find(c => c.id === cid);
        const msg  = conv?.messages.find(m => m.id === msgId);
        store.updateMessage(cid, msgId, {
          toolCalls: [...(msg?.toolCalls ?? []), { ...tool, status: "running" }],
        });
        break;
      }

      case "tool_result": {
        const { id, result, durationMs } = event.payload as { id: string; result: unknown; durationMs: number };
        const conv = store.conversations.find(c => c.id === cid);
        const msg  = conv?.messages.find(m => m.id === msgId);
        if (msg?.toolCalls) {
          store.updateMessage(cid, msgId, {
            toolCalls: msg.toolCalls.map(tc =>
              tc.id === id ? { ...tc, result, durationMs, status: "done" as const } : tc
            ),
          });
        }
        break;
      }

      case "message_done": {
        const { tokenCount, cost } = event.payload as { tokenCount: number; cost: number };
        store.updateMessage(cid, msgId, { tokenCount, cost, streaming: false });
        store.addUsage(tokenCount, cost);
        break;
      }

      case "compression_notice":
        store.setCompressionNotice(event.payload as string);
        setTimeout(() => store.setCompressionNotice(null), 8000);
        break;

      case "error":
        store.updateMessage(cid, msgId, {
          content:   `⚠️ ${event.payload}`,
          streaming: false,
        });
        break;
    }
  }

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    store.setStreamingMsgId(null);
    if (convId && store.streamingMsgId) {
      store.updateMessage(convId, store.streamingMsgId, { streaming: false });
    }
  }, [store, convId]);

  return {
    sendMessage,
    stopStreaming,
    isStreaming: !!store.streamingMsgId,
    conversation: activeConv,
  };
}

// ── DB persistence helpers ────────────────────────────────────────────────────

function persistConversationToDB(id: string, modelId: string, title?: string) {
  fetch("/api/conversations", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ id, model_id: modelId, title: title ?? "New conversation" }),
  }).catch(() => { /* non-critical — localStorage is the source of truth */ });
}

// ── Auto-title generation ────────────────────────────────────────────────────
// Fires in background after first assistant reply. Uses cheapest connected
// model via /api/title to replace the truncated autoTitle with a smart one.

const titleInFlight = new Set<string>();

function generateSmartTitle(store: ReturnType<typeof useAppStore.getState>, cid: string) {
  const conv = store.conversations.find(c => c.id === cid);
  if (!conv) return;

  // Only generate on first exchange (user + assistant = 2 messages)
  // or if title is still the default
  const isDefault = conv.title === "New conversation";
  const isAutoTruncated = conv.messages.length === 2 && conv.messages[0]?.role === "user";
  if (!isDefault && !isAutoTruncated) return;
  if (titleInFlight.has(cid)) return;

  titleInFlight.add(cid);

  const messages = conv.messages
    .filter(m => m.content && !m.streaming)
    .map(m => ({ role: m.role, content: m.content }));

  fetch("/api/title", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data?.title) {
        store.updateTitle(cid, data.title);
        // Sync the generated title to the DB
        persistConversationToDB(cid, conv.modelId, data.title);
      }
    })
    .catch(() => { /* keep existing title */ })
    .finally(() => titleInFlight.delete(cid));
}
