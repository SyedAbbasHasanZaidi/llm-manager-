"use client";
import { useState } from "react";
import { useMCP } from "@/hooks/useMCP";
import { useAppStore } from "@/store";
import { Panel, PanelHeader, PanelBody } from "@/components/ui/Panel";
import { Toggle } from "@/components/ui/Toggle";
import { MCP_CATEGORY_LABELS } from "@/lib/mcp-servers";
import type { MCPServer } from "@/types";

const EyeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOffIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

export function MCPPanel() {
  const { servers, toggleServer, addCustomServer, saveServerKey, deleteServerKey, deleteServer } = useMCP();
  const { setUI }                   = useAppStore();
  const [activeCategory, setCategory] = useState<string>("all");
  const [expandedId, setExpanded]   = useState<string | null>(null);
  const [showAddCustom, setShowAdd] = useState(false);
  const [customForm, setCustomForm] = useState({ name: "", url: "", icon: "🔧", description: "" });

  const categories  = ["all", ...Array.from(new Set(servers.map(s => s.category)))];
  const visible     = activeCategory === "all" ? servers : servers.filter(s => s.category === activeCategory);
  const enabledCount = servers.filter(s => s.enabled).length;

  return (
    <Panel width={280}>
      <PanelHeader>
        <div>
          <p className="text-sm font-semibold" style={{ color: "#ececec" }}>MCP Servers</p>
          <p className="text-xs mt-0.5" style={{ color: "#6b7280" }}>
            {enabledCount > 0 ? `${enabledCount} active` : "Tools & actions for your LLM"}
          </p>
        </div>
        <button onClick={() => setUI({ activePanel: "none" })}
          style={{ background: "none", border: "none", color: "#6b7280", fontSize: 14, cursor: "pointer" }}>✕</button>
      </PanelHeader>

      {/* Explainer */}
      <div className="mx-3 mt-2.5 p-3 rounded-lg text-xs leading-relaxed" style={{ background: "#1e1e1e", border: "1px solid #2f2f2f", color: "#6b7280" }}>
        🔌 MCP servers give your LLM tools — search the web, query databases, read files, and more — live during your conversation.
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 px-3 py-2 overflow-x-auto" style={{ borderBottom: "1px solid #2f2f2f" }}>
        {categories.map(cat => (
          <button key={cat} onClick={() => setCategory(cat)}
            className="capitalize text-xs px-2.5 py-1 rounded-md whitespace-nowrap transition-all"
            style={{ background: activeCategory === cat ? "#2f2f2f" : "transparent", border: `1px solid ${activeCategory === cat ? "#3f3f3f" : "transparent"}`, color: activeCategory === cat ? "#ececec" : "#6b7280", cursor: "pointer", fontWeight: activeCategory === cat ? 500 : 400 }}>
            {cat === "all" ? "All" : MCP_CATEGORY_LABELS[cat] ?? cat}
          </button>
        ))}
      </div>

      <PanelBody className="p-2">
        {visible.map(srv => (
          <MCPServerCard
            key={srv.id}
            server={srv}
            isExpanded={expandedId === srv.id}
            onToggle={() => toggleServer(srv.id)}
            onExpand={() => setExpanded(expandedId === srv.id ? null : srv.id)}
            onSaveKey={(key) => saveServerKey(srv.id, srv.keyLabel ?? "default", key)}
            onDeleteKey={() => deleteServerKey(srv.id)}
            onDelete={!srv.isDefault ? () => deleteServer(srv.id) : undefined}
          />
        ))}

        {/* Add custom */}
        {!showAddCustom ? (
          <button onClick={() => setShowAdd(true)}
            className="w-full mt-1 py-2.5 rounded-xl text-xs"
            style={{ background: "transparent", border: "1px dashed #3f3f3f", color: "#4b5563", cursor: "pointer" }}>
            + Add custom MCP server
          </button>
        ) : (
          <div className="mt-2 p-3 rounded-xl" style={{ background: "#1e1e1e", border: "1px solid #2f2f2f" }}>
            <p className="text-xs font-semibold mb-2" style={{ color: "#ececec" }}>Custom Server</p>
            {(["name","url","icon","description"] as const).map(field => (
              <div key={field} className="mb-2">
                <label className="block text-xs mb-1 capitalize" style={{ color: "#4b5563" }}>{field}</label>
                <input value={customForm[field]} onChange={e => setCustomForm(p => ({ ...p, [field]: e.target.value }))}
                  placeholder={field === "url" ? "https://..." : field === "icon" ? "🔧" : ""}
                  autoComplete="off"
                  style={{ width: "100%", padding: "6px 10px", borderRadius: 6, background: "#2f2f2f", border: "1px solid #3f3f3f", color: "#ececec", fontSize: 12, outline: "none" }} />
              </div>
            ))}
            <div className="flex gap-2 mt-3">
              <button onClick={() => setShowAdd(false)}
                style={{ flex: 1, padding: "7px", borderRadius: 7, background: "transparent", border: "1px solid #3f3f3f", color: "#6b7280", fontSize: 12, cursor: "pointer" }}>
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!customForm.name.trim()) return;
                  addCustomServer({
                    name:        customForm.name.trim(),
                    description: customForm.description.trim() || customForm.name.trim(),
                    icon:        customForm.icon || "🔧",
                    category:    "custom",
                    transport:   customForm.url ? "http" : "stdio",
                    url:         customForm.url.trim() || undefined,
                    enabled:     false,
                    requiresKey: false,
                  });
                  setCustomForm({ name: "", url: "", icon: "🔧", description: "" });
                  setShowAdd(false);
                }}
                style={{ flex: 1, padding: "7px", borderRadius: 7, background: "#8b5cf6", border: "none", color: "white", fontSize: 12, cursor: "pointer" }}>
                Add
              </button>
            </div>
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}

function MCPServerCard({
  server, isExpanded, onToggle, onExpand, onSaveKey, onDeleteKey, onDelete,
}: {
  server: MCPServer;
  isExpanded: boolean;
  onToggle: () => void;
  onExpand: () => void;
  onSaveKey: (key: string) => Promise<boolean>;
  onDeleteKey: () => Promise<boolean>;
  onDelete?: () => void;
}) {
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving]     = useState(false);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [showKey, setShowKey]   = useState(false);

  const handleSaveKey = async () => {
    if (!keyInput.trim()) return;
    setSaving(true);
    const ok = await onSaveKey(keyInput.trim());
    setSaving(false);
    if (ok) {
      setKeyInput("");
      setShowKeyInput(false);
    }
  };

  return (
    <div className="rounded-xl mb-1.5 overflow-hidden" style={{ background: server.enabled ? "#1e1e1e" : "transparent", border: `1px solid ${server.enabled ? "#3f3f3f" : "transparent"}`, transition: "all 0.15s" }}>
      <div className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-[#1e1e1e] transition-colors" onClick={onExpand}>
        <span className="text-base flex-shrink-0">{server.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium" style={{ color: server.enabled ? "#ececec" : "#acacac" }}>{server.name}</p>
            {server.enabled && <span className="w-1.5 h-1.5 rounded-full bg-[#6ee7b7] flex-shrink-0" />}
            {server.hasKey && <span className="text-[10px]" style={{ color: "#6ee7b7" }} title="Key saved">🔑</span>}
          </div>
          <p className="text-xs mt-0.5 truncate" style={{ color: "#4b5563" }}>{server.description}</p>
        </div>
        <Toggle checked={server.enabled} onChange={onToggle} size="sm" />
      </div>

      {/* Expanded: show tools + key management */}
      {isExpanded && (
        <div className="px-3 pb-3" style={{ borderTop: "1px solid #2a2a2a" }}>
          {server.tools.length > 0 && (
            <>
              <p className="text-xs font-medium mt-2 mb-1.5" style={{ color: "#4b5563", letterSpacing: "0.04em" }}>TOOLS</p>
              {server.tools.map(tool => (
                <div key={tool.name} className="flex items-start gap-2 mb-1.5">
                  <span className="text-[10px] mt-0.5" style={{ color: "#8b5cf6" }}>◆</span>
                  <div>
                    <p className="text-xs font-medium" style={{ color: "#acacac" }}>{tool.name}</p>
                    <p className="text-xs" style={{ color: "#4b5563" }}>{tool.description}</p>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Key management */}
          {server.requiresKey && (
            <div className="mt-2">
              {server.hasKey ? (
                <div className="flex items-center justify-between p-2 rounded-lg text-xs" style={{ background: "rgba(110,231,183,0.08)", border: "1px solid rgba(110,231,183,0.2)" }}>
                  <span style={{ color: "#6ee7b7" }}>🔑 Key saved</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteKey(); }}
                    className="text-xs hover:underline"
                    style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}
                  >
                    Remove
                  </button>
                </div>
              ) : showKeyInput ? (
                <div className="p-2 rounded-lg" style={{ background: "#1a1a1a", border: "1px solid #3f3f3f" }}>
                  <label className="block text-xs mb-1.5" style={{ color: "#6b7280" }}>
                    {server.keyLabel ?? "API Key"}
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showKey ? "text" : "password"}
                      value={keyInput}
                      onChange={e => setKeyInput(e.target.value)}
                      placeholder="Paste your key..."
                      autoComplete="off"
                      onClick={e => e.stopPropagation()}
                      style={{ width: "100%", padding: "6px 30px 6px 10px", borderRadius: 6, background: "#2f2f2f", border: "1px solid #3f3f3f", color: "#ececec", fontSize: 12, outline: "none", boxSizing: "border-box" }}
                    />
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setShowKey(v => !v); }}
                      style={{ position: "absolute", right: 6, top: 5, background: "none", border: "none", color: "#6b7280", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
                      tabIndex={-1}
                      title={showKey ? "Hide key" : "Show key"}
                    >
                      {showKey ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowKeyInput(false); setKeyInput(""); }}
                      style={{ flex: 1, padding: "5px", borderRadius: 6, background: "transparent", border: "1px solid #3f3f3f", color: "#6b7280", fontSize: 11, cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSaveKey(); }}
                      disabled={saving || !keyInput.trim()}
                      style={{ flex: 1, padding: "5px", borderRadius: 6, background: "#8b5cf6", border: "none", color: "white", fontSize: 11, cursor: "pointer", opacity: saving ? 0.6 : 1 }}
                    >
                      {saving ? "Saving..." : "Save key"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowKeyInput(true); }}
                  className="w-full p-2 rounded-lg text-xs"
                  style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", color: "#fcd34d", cursor: "pointer" }}
                >
                  ⚠ Add {server.keyLabel ?? "API Key"} to enable
                </button>
              )}
            </div>
          )}

          {/* Delete custom server */}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="w-full mt-2 p-2 rounded-lg text-xs hover:bg-[#2a2a2a] transition-colors"
              style={{ background: "transparent", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", cursor: "pointer" }}
            >
              Delete server
            </button>
          )}
        </div>
      )}
    </div>
  );
}
