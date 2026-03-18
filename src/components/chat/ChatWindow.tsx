"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useChat } from "@/hooks/useChat";
import { useAppStore, useEnabledMCPServers } from "@/store";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";

const SUGGESTIONS = [
  "Search the web for latest AI news",
  "Write a SQL query for top customers by revenue",
  "What can MCP servers do for me?",
  "Compare GPT-4o vs Claude Sonnet 4",
];

export function ChatWindow() {
  const { sendMessage, stopStreaming, isStreaming, conversation } = useChat();
  const { activeModelId, ui, setUI } = useAppStore();
  const enabledMCP  = useEnabledMCPServers();
  const apiKeys     = useAppStore(s => s.apiKeys);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasKey = Object.values(apiKeys).some(Boolean);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(input);
    setInput("");
  };

  const convTitle = conversation?.title && conversation.title !== "New conversation"
    ? conversation.title
    : (conversation ? "New conversation" : "LLM Manager");

  return (
    <div className="flex flex-col h-full w-full" style={{ background: "var(--bg-base)" }}>
      {/* Top bar */}
      <div
        className="flex items-center px-3 sm:px-4 gap-2 flex-shrink-0"
        style={{ height: 52, borderBottom: "1px solid var(--border)" }}
      >
        {/* Left: hamburger + conversation title */}
        <div className="flex items-center gap-2 min-w-0 flex-shrink-1">
          <button
            onClick={() => setUI({ sidebarOpen: !ui.sidebarOpen })}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors flex-shrink-0"
            style={{ background: "transparent", border: "none", color: "var(--text-3)", fontSize: 16, cursor: "pointer" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-elevated)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            ☰
          </button>

          {/* Conversation title (clickable to open model picker) */}
          <button
            onClick={() => setUI({ activePanel: ui.activePanel === "models" ? "none" : "models" })}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors min-w-0"
            style={{ background: "transparent", border: "none", color: hasKey ? "var(--text-1)" : "var(--text-3)", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
            title={`Model: ${activeModelId}`}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-elevated)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <span className="truncate">{hasKey ? convTitle : "Select model"}</span>
            <span className="flex-shrink-0" style={{ color: "var(--text-4)", fontSize: 11 }}>▾</span>
          </button>
        </div>

        {/* Right: actions — full on desktop, dropdown on mobile */}
        <div className="flex items-center gap-2 ml-auto flex-shrink-0">
          {/* Active MCP icons — hidden on very small screens */}
          <div className="hidden sm:flex items-center gap-2">
            {enabledMCP.slice(0, 3).map(srv => (
              <span key={srv.id} className="text-sm" title={srv.name}>{srv.icon}</span>
            ))}
          </div>

          {/* Desktop buttons — hidden below 640px */}
          <div className="hidden sm:flex items-center gap-1.5">
            <TopBarButton
              active={ui.activePanel === "mcp"}
              onClick={() => setUI({ activePanel: ui.activePanel === "mcp" ? "none" : "mcp" })}
            >
              🔌 MCP
              {enabledMCP.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] text-white font-semibold" style={{ background: "var(--accent)" }}>
                  {enabledMCP.length}
                </span>
              )}
            </TopBarButton>

            <TopBarButton
              active={ui.comparisonMode}
              onClick={() => setUI({ comparisonMode: !ui.comparisonMode })}
            >
              ⚖ Compare
            </TopBarButton>

            <SignOutButton />
          </div>

          {/* Mobile dropdown — shown below 640px */}
          <div className="relative sm:hidden" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
              style={{ background: menuOpen ? "var(--bg-elevated)" : "transparent", border: "none", color: "var(--text-3)", fontSize: 16, cursor: "pointer" }}
            >
              ⋮
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-10 rounded-lg py-1 shadow-lg z-50"
                style={{ background: "var(--bg-active)", border: "1px solid var(--border-2)", minWidth: 180 }}
              >
                <DropdownItem onClick={() => { setUI({ activePanel: ui.activePanel === "mcp" ? "none" : "mcp" }); setMenuOpen(false); }}>
                  🔌 MCP {enabledMCP.length > 0 && `(${enabledMCP.length})`}
                </DropdownItem>
                <DropdownItem onClick={() => { setUI({ comparisonMode: !ui.comparisonMode }); setMenuOpen(false); }}>
                  ⚖ Compare
                </DropdownItem>
                <DropdownItem onClick={() => { setMenuOpen(false); signOut(); }}>
                  Sign out
                </DropdownItem>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {!conversation || conversation.messages.length === 0 ? (
          <EmptyState onSend={msg => { sendMessage(msg); }} hasKey={hasKey} onOpenModels={() => setUI({ activePanel: "models" })} />
        ) : (
          <div className="w-full mx-auto px-4 sm:px-6 pt-6" style={{ maxWidth: 820 }}>
            {conversation.messages.map(msg => (
              <div key={msg.id} className="mb-6">
                <MessageBubble message={msg} />
              </div>
            ))}
            <div ref={bottomRef} style={{ height: 24 }} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-3 sm:px-4 pb-3 sm:pb-4 pt-2">
        <div className="w-full mx-auto" style={{ maxWidth: 820 }}>
          <ChatInput
            value={input}
            onChange={setInput}
            onSend={handleSend}
            onStop={stopStreaming}
            isStreaming={isStreaming}
            disabled={!hasKey}
            placeholder={hasKey ? `Message ${activeModelId}` : "Add an API key to start chatting…"}
          />
          <p className="text-center text-xs mt-2" style={{ color: "var(--text-5)" }}>
            LLM Manager can make mistakes. Verify important information.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Shared sub-components ────────────────────────────────────────────────────

function TopBarButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
      style={{
        background: active ? "var(--bg-elevated)" : "transparent",
        border: "none",
        color: active ? "var(--accent)" : "var(--text-3)",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--bg-elevated)"; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = active ? "var(--bg-elevated)" : "transparent"; }}
    >
      {children}
    </button>
  );
}

function SignOutButton() {
  return (
    <button
      onClick={signOut}
      className="px-2.5 py-1.5 rounded-lg text-xs transition-colors"
      style={{ background: "transparent", border: "1px solid var(--border-2)", color: "var(--text-4)", cursor: "pointer", whiteSpace: "nowrap" }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-elevated)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      Sign out
    </button>
  );
}

function DropdownItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-2.5 text-sm transition-colors"
      style={{ background: "transparent", border: "none", color: "var(--text-1)", cursor: "pointer" }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-elevated)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </button>
  );
}

async function signOut() {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  await supabase.auth.signOut();
  window.location.href = "/auth/login";
}

function EmptyState({ onSend, hasKey, onOpenModels }: { onSend: (s: string) => void; hasKey: boolean; onOpenModels: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-8" style={{ minHeight: "calc(100vh - 140px)", padding: "0 24px" }}>
      <div className="flex flex-col items-center gap-3">
        <div className="relative" style={{ width: 52, height: 52 }}>
          <div className="absolute inset-0" style={{ background: "var(--accent)", borderRadius: "50% 50% 50% 16px" }} />
          <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-xl">L</div>
          <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2" style={{ background: "var(--accent-2)", borderColor: "var(--bg-base)" }} />
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-center" style={{ color: "var(--text-1)", letterSpacing: "-0.02em" }}>LLM Manager</h2>
          <p className="text-sm text-center mt-1.5" style={{ color: "var(--text-3)" }}>
            {hasKey ? "Select a model above and start chatting" : "Add an API key to unlock models"}
          </p>
        </div>
      </div>

      {!hasKey ? (
        <button
          onClick={onOpenModels}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--accent)", border: "none", cursor: "pointer" }}
        >
          🔑 Add API key to get started
        </button>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full" style={{ maxWidth: 520 }}>
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => onSend(s)}
              className="text-left px-4 py-3 rounded-xl text-sm transition-colors"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-2)", lineHeight: 1.5, cursor: "pointer" }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-active)")}
              onMouseLeave={e => (e.currentTarget.style.background = "var(--bg-card)")}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
