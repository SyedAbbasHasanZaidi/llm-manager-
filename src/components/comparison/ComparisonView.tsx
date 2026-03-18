"use client";
import { useState, useRef } from "react";
import { useAppStore, useConnectedProviders } from "@/store";
import { AVAILABLE_MODELS, PROVIDER_META } from "@/lib/models";
import { ChatInput } from "@/components/chat/ChatInput";
import type { Message } from "@/types";

interface ComparisonColumn {
  modelId: string;
  messages: Message[];
  streaming: boolean;
  elapsedMs?: number;
  tokenCount?: number;
}

export function ComparisonView() {
  const { setUI, activeModelId }   = useAppStore();
  const connectedProviders         = useConnectedProviders();
  const [input, setInput]          = useState("");
  const [columns, setColumns]      = useState<ComparisonColumn[]>([
    { modelId: "claude-sonnet-4-20250514", messages: [], streaming: false },
    { modelId: "gpt-4o",                   messages: [], streaming: false },
  ]);
  const streamRefs = useRef<Record<string, NodeJS.Timeout>>({});

  const accessibleModels = AVAILABLE_MODELS.filter(m => connectedProviders.has(m.provider));

  const updateColumn = (modelId: string, patch: Partial<ComparisonColumn>) =>
    setColumns(prev => prev.map(c => c.modelId === modelId ? { ...c, ...patch } : c));

  const addColumn = () => {
    const used = new Set(columns.map(c => c.modelId));
    const next = AVAILABLE_MODELS.find(m => !used.has(m.id));
    if (!next) return;
    setColumns(prev => [...prev, { modelId: next.id, messages: [], streaming: false }]);
  };

  const removeColumn = (modelId: string) =>
    setColumns(prev => prev.filter(c => c.modelId !== modelId));

  const changeColumnModel = (oldId: string, newId: string) =>
    setColumns(prev => prev.map(c => c.modelId === oldId ? { ...c, modelId: newId, messages: [], streaming: false } : c));

  const sendAll = () => {
    if (!input.trim()) return;
    const prompt = input;
    setInput("");

    columns.forEach(col => {
      const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: prompt, createdAt: new Date() };
      const asstId           = crypto.randomUUID();
      const startMs          = Date.now();

      updateColumn(col.modelId, {
        messages:  [userMsg, { id: asstId, role: "assistant", content: "", streaming: true, model: col.modelId, createdAt: new Date() }],
        streaming: true,
        elapsedMs: undefined,
      });

      // Real SSE call to /api/chat
      const abortCtrl = new AbortController();
      streamRefs.current[col.modelId] = abortCtrl as unknown as NodeJS.Timeout;

      (async () => {
        try {
          const res = await fetch("/api/chat", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ model: col.modelId, messages: [{ role: "user", content: prompt }] }),
            signal:  abortCtrl.signal,
          });

          if (!res.ok || !res.body) {
            setColumns(prev => prev.map(c =>
              c.modelId === col.modelId ? { ...c, streaming: false, messages: c.messages.map(m => m.id === asstId ? { ...m, content: `Error: ${res.statusText}`, streaming: false } : m) } : c
            ));
            return;
          }

          const reader  = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer    = "";
          let content   = "";
          let tokens    = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const raw = line.replace(/^data: /, "").trim();
              if (!raw || raw === "[DONE]") continue;
              try {
                const evt = JSON.parse(raw);
                if (evt.type === "text_delta") {
                  content += evt.payload;
                  setColumns(prev => prev.map(c =>
                    c.modelId === col.modelId ? { ...c, messages: c.messages.map(m => m.id === asstId ? { ...m, content } : m) } : c
                  ));
                }
                if (evt.type === "message_done" && evt.payload) {
                  tokens = evt.payload.tokenCount ?? 0;
                }
              } catch { /* ignore malformed SSE chunks */ }
            }
          }

          setColumns(prev => prev.map(c =>
            c.modelId === col.modelId
              ? { ...c, streaming: false, elapsedMs: Date.now() - startMs, tokenCount: tokens, messages: c.messages.map(m => m.id === asstId ? { ...m, streaming: false } : m) }
              : c
          ));
        } catch (err: unknown) {
          if ((err as Error).name === "AbortError") return;
          setColumns(prev => prev.map(c =>
            c.modelId === col.modelId ? { ...c, streaming: false, messages: c.messages.map(m => m.id === asstId ? { ...m, content: `Error: ${(err as Error).message}`, streaming: false } : m) } : c
          ));
        }
      })();
    });
  };

  return (
    <div className="flex flex-col h-full w-full" style={{ background: "var(--bg-base)" }}>
      {/* Top bar — matches ChatWindow */}
      <div
        className="flex items-center px-3 sm:px-4 gap-3 flex-shrink-0"
        style={{ height: 52, borderBottom: "1px solid var(--border)" }}
      >
        <span className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>Compare Models</span>
        <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--bg-elevated)", color: "var(--text-3)" }}>
          {columns.length} models
        </span>
        {columns.length < 4 && (
          <button
            onClick={addColumn}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: "var(--bg-elevated)", border: "none", color: "var(--accent)", cursor: "pointer" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-active)")}
            onMouseLeave={e => (e.currentTarget.style.background = "var(--bg-elevated)")}
          >
            + Add model
          </button>
        )}
        <button
          onClick={() => setUI({ comparisonMode: false })}
          className="ml-auto text-xs px-3 py-1.5 rounded-lg transition-colors"
          style={{ background: "transparent", border: "1px solid var(--border-2)", color: "var(--text-4)", cursor: "pointer" }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-elevated)")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          ← Back to chat
        </button>
      </div>

      {/* Columns */}
      <div className="flex flex-1 overflow-hidden">
        {columns.map((col, i) => {
          const model = AVAILABLE_MODELS.find(m => m.id === col.modelId);
          const meta  = model ? PROVIDER_META[model.provider] : null;
          return (
            <div
              key={col.modelId}
              className="flex flex-col flex-1 min-w-0 overflow-hidden"
              style={{ borderRight: i < columns.length - 1 ? "1px solid var(--border)" : "none" }}
            >
              {/* Column header */}
              <div
                className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
                style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-sidebar)" }}
              >
                <select
                  value={col.modelId}
                  onChange={e => changeColumnModel(col.modelId, e.target.value)}
                  style={{
                    flex: 1, background: "var(--bg-elevated)", border: "1px solid var(--border-2)",
                    color: "var(--text-1)", fontSize: 12, padding: "4px 8px", borderRadius: 6, outline: "none",
                  }}
                >
                  {AVAILABLE_MODELS.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                {columns.length > 2 && (
                  <button
                    onClick={() => removeColumn(col.modelId)}
                    style={{ background: "none", border: "none", color: "var(--text-4)", fontSize: 13, cursor: "pointer" }}
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Messages — same layout as ChatWindow message area */}
              <div className="flex-1 overflow-y-auto">
                {col.messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm" style={{ color: "var(--text-4)" }}>Type a prompt below to compare</p>
                  </div>
                ) : (
                  <div className="w-full mx-auto px-4 sm:px-6 pt-6" style={{ maxWidth: 820 }}>
                    {col.messages.map(msg => {
                      const isUser = msg.role === "user";
                      return (
                        <div key={msg.id} className="mb-6">
                          <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"} items-start`}>
                            {/* Avatar */}
                            <div
                              className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-xs font-bold mt-0.5"
                              style={{
                                borderRadius: isUser ? "50%" : "50% 50% 50% 8px",
                                background:   isUser ? "var(--bg-elevated)" : (meta?.color ?? "#8b5cf6"),
                                color:        isUser ? "var(--text-3)" : "white",
                              }}
                            >
                              {isUser ? "U" : "L"}
                            </div>

                            <div className={`flex flex-col gap-1.5 max-w-[78%] min-w-0 ${isUser ? "items-end" : "items-start"}`}>
                              {/* Model label */}
                              {!isUser && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold" style={{ color: meta?.color ?? "#8b5cf6" }}>
                                    {model?.name ?? col.modelId}
                                  </span>
                                  {msg.streaming && (
                                    <div className="flex gap-0.5 items-center">
                                      {[0,1,2].map(j => (
                                        <div key={j} className="w-1 h-1 rounded-full animate-bounce"
                                          style={{ background: meta?.color ?? "#8b5cf6", animationDelay: `${j * 0.15}s`, animationDuration: "0.8s" }} />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Content bubble */}
                              {msg.content && (
                                <div
                                  className="text-sm leading-relaxed whitespace-pre-wrap break-words"
                                  style={{
                                    padding:      "10px 14px",
                                    borderRadius: isUser ? "18px 18px 4px 18px" : "4px 18px 18px 18px",
                                    background:   isUser ? "var(--bg-elevated)" : "var(--bg-card)",
                                    color:        "var(--text-1)",
                                    lineHeight:   1.7,
                                  }}
                                >
                                  {msg.content}
                                  {msg.streaming && (
                                    <span className="inline-block w-0.5 h-4 ml-0.5 align-middle animate-pulse rounded-sm"
                                      style={{ background: meta?.color ?? "#8b5cf6" }} />
                                  )}
                                </div>
                              )}

                              {/* Meta */}
                              {!isUser && !msg.streaming && col.elapsedMs && (
                                <div className="flex gap-3 text-xs" style={{ color: "var(--text-5)" }}>
                                  <span>{col.elapsedMs}ms</span>
                                  {col.tokenCount && <span>{col.tokenCount} tokens</span>}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Shared input — matches ChatWindow */}
      <div className="flex-shrink-0 px-3 sm:px-4 pb-3 sm:pb-4 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="w-full mx-auto" style={{ maxWidth: 820 }}>
          <ChatInput
            value={input}
            onChange={setInput}
            onSend={sendAll}
            onStop={() => {}}
            isStreaming={columns.some(c => c.streaming)}
            placeholder="Send the same prompt to all models…"
          />
        </div>
      </div>
    </div>
  );
}
