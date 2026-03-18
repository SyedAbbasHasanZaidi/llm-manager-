"use client";
import { useState } from "react";
import type { Message, ToolCall } from "@/types";
import { PROVIDER_META } from "@/lib/models";
import { formatCost, formatTokens } from "@/lib/utils";

export function MessageBubble({ message }: { message: Message }) {
  const isUser   = message.role === "user";
  const meta     = message.provider ? PROVIDER_META[message.provider] : null;

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"} items-start`}>
      {/* Avatar */}
      <div
        className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-xs font-bold mt-0.5"
        style={{
          borderRadius: isUser ? "50%" : "50% 50% 50% 8px",
          background:   isUser ? "var(--bg-elevated)" : "#8b5cf6",
          color:        isUser ? "#6b7280" : "white",
        }}
      >
        {isUser ? "U" : "L"}
      </div>

      <div className={`flex flex-col gap-1.5 max-w-[78%] min-w-0 ${isUser ? "items-end" : "items-start"}`}>
        {/* Model label */}
        {!isUser && message.model && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold" style={{ color: meta?.color ?? "#8b5cf6" }}>
              {message.model}
            </span>
            {message.streaming && <StreamDots />}
          </div>
        )}

        {/* Tool calls */}
        {(message.toolCalls ?? []).map(tc => (
          <ToolCallBadge key={tc.id} toolCall={tc} />
        ))}

        {/* Content */}
        {message.content && (
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
            {message.content}
            {message.streaming && (
              <span
                className="inline-block w-0.5 h-4 ml-0.5 align-middle animate-pulse rounded-sm"
                style={{ background: meta?.color ?? "#8b5cf6" }}
              />
            )}
          </div>
        )}

        {/* Meta */}
        {!isUser && !message.streaming && (message.tokenCount || message.cost) && (
          <div className="flex gap-3 text-xs" style={{ color: "#374151" }}>
            {message.tokenCount && <span>{formatTokens(message.tokenCount)} tokens</span>}
            {message.cost       && <span>{formatCost(message.cost)}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tool call display ──────────────────────────────────────────────────────────
function ToolCallBadge({ toolCall }: { toolCall: ToolCall }) {
  const [open, setOpen] = useState(false);
  const isDone    = toolCall.status === "done";
  const isRunning = toolCall.status === "running";

  return (
    <div
      className="rounded-lg overflow-hidden cursor-pointer text-xs"
      style={{
        background: "#1e1e1e",
        border: `1px solid ${isDone ? "#3f3f3f" : isRunning ? "rgba(245,158,11,0.3)" : "#2a2a2a"}`,
        minWidth: 160,
      }}
      onClick={() => setOpen(!open)}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <span
          className={isRunning ? "animate-spin" : ""}
          style={{ color: isDone ? "#8b5cf6" : isRunning ? "#f59e0b" : "#4b5563", fontSize: 10 }}
        >
          {isDone ? "●" : isRunning ? "○" : "◌"}
        </span>
        <span style={{ color: isDone ? "#acacac" : "#f59e0b" }}>{toolCall.name}</span>
        {toolCall.durationMs && (
          <span className="ml-auto" style={{ color: "#4b5563" }}>{toolCall.durationMs}ms</span>
        )}
        <span style={{ color: "#4b5563" }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div className="px-3 py-2 border-t text-[11px]" style={{ borderColor: "#2a2a2a", background: "rgba(0,0,0,0.2)" }}>
          <div className="mb-1" style={{ color: "#4b5563" }}>INPUT</div>
          <pre className="overflow-auto max-h-20" style={{ color: "#6b7280" }}>
            {JSON.stringify(toolCall.input, null, 2)}
          </pre>
          {toolCall.result !== undefined && (
            <>
              <div className="mt-2 mb-1" style={{ color: "#4b5563" }}>RESULT</div>
              <pre className="overflow-auto max-h-20" style={{ color: "#6ee7b7" }}>
                {JSON.stringify(toolCall.result, null, 2)}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StreamDots() {
  return (
    <div className="flex gap-0.5 items-center">
      {[0,1,2].map(i => (
        <div
          key={i}
          className="w-1 h-1 rounded-full animate-bounce"
          style={{ background: "#8b5cf6", animationDelay: `${i * 0.15}s`, animationDuration: "0.8s" }}
        />
      ))}
    </div>
  );
}
