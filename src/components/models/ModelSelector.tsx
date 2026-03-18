"use client";
import { useState, useMemo } from "react";
import { useAppStore, useConnectedProviders } from "@/store";
import { AVAILABLE_MODELS, PROVIDER_META, PROVIDER_ORDER, groupModelsByProvider } from "@/lib/models";
import { Panel, PanelHeader, PanelBody } from "@/components/ui/Panel";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import type { Model, Provider } from "@/types";

type FilterTab = "all" | "connected" | "fast" | "vision" | "tools";

export function ModelSelector() {
  const { activeModelId, setActiveModelId, setUI, ui, pinnedModels, togglePin, setApiKey, removeApiKey, apiKeys } = useAppStore();
  const [saving, setSaving] = useState(false);
  const connectedProviders = useConnectedProviders();
  const [search,    setSearch]    = useState("");
  const [filter,    setFilter]    = useState<FilterTab>("all");
  const [detail,    setDetail]    = useState<Model | null>(null);
  const [autoRoute, setAutoRoute] = useState(false);

  // Auto-route: when toggled on, pick the best connected model immediately.
  // Strategy: cheapest fast model for general use; cheapest medium model if no fast available.
  const handleAutoRoute = (on: boolean) => {
    setAutoRoute(on);
    if (!on) return;
    const connected = AVAILABLE_MODELS.filter(m => connectedProviders.has(m.provider));
    if (!connected.length) return;
    const fast   = connected.filter(m => m.speed === "fast").sort((a, b) => a.costPer1kInput - b.costPer1kInput);
    const medium = connected.filter(m => m.speed === "medium").sort((a, b) => a.costPer1kInput - b.costPer1kInput);
    const best   = fast[0] ?? medium[0] ?? connected[0];
    setActiveModelId(best.id);
  };

  // Add key sub-panel
  const [addKeyFor,   setAddKeyFor]   = useState<Provider | null>(null);
  const [keyInput,    setKeyInput]    = useState("");
  const [keyError,    setKeyError]    = useState("");

  const filtered = useMemo(() => {
    let models = AVAILABLE_MODELS;
    if (filter === "connected") models = models.filter(m => connectedProviders.has(m.provider));
    if (filter === "fast")      models = models.filter(m => m.speed === "fast");
    if (filter === "vision")    models = models.filter(m => m.supportsVision);
    if (filter === "tools")     models = models.filter(m => m.supportsTools);
    if (search.trim()) {
      const q = search.toLowerCase();
      models = models.filter(m => m.name.toLowerCase().includes(q) || m.provider.includes(q));
    }
    return models;
  }, [filter, search, connectedProviders]);

  const pinned   = filtered.filter(m => pinnedModels.includes(m.id));
  const unpinned = filtered.filter(m => !pinnedModels.includes(m.id));

  const selectModel = (model: Model) => {
    if (!connectedProviders.has(model.provider)) return;
    setActiveModelId(model.id);
    setUI({ activePanel: "none" });
  };

  const openAddKey = (provider: Provider) => {
    setAddKeyFor(provider);
    setKeyInput("");  // never pre-fill — keys live in Supabase, not client
    setKeyError("");
  };

  const saveKey = async () => {
    if (!addKeyFor || saving) return;
    const meta = PROVIDER_META[addKeyFor];
    const val  = keyInput.trim();
    if (!val) { setKeyError("API key cannot be empty"); return; }
    if (meta.keyPrefix && !val.startsWith(meta.keyPrefix)) {
      setKeyError(`Key should start with "${meta.keyPrefix}"`); return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/keys", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ provider: addKeyFor, key: val }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setKeyError(data.error ?? "Failed to save key");
        return;
      }
      setApiKey(addKeyFor);   // mark as connected in local state (no actual key stored)
      setAddKeyFor(null);
    } catch {
      setKeyError("Network error, please try again");
    } finally {
      setSaving(false);
    }
  };

  const deleteKey = async (provider: Provider) => {
    setSaving(true);
    try {
      await fetch(`/api/keys?provider=${provider}`, { method: "DELETE" });
      removeApiKey(provider);
      setAddKeyFor(null);
    } finally {
      setSaving(false);
    }
  };

  // Add-key subpanel
  if (addKeyFor) {
    const meta   = PROVIDER_META[addKeyFor];
    const models = AVAILABLE_MODELS.filter(m => m.provider === addKeyFor);
    return (
      <Panel width={300}>
        <PanelHeader>
          <div className="flex items-center gap-2">
            <button onClick={() => setAddKeyFor(null)} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 16, cursor: "pointer" }}>←</button>
            <div>
              <p className="text-sm font-semibold" style={{ color: "#ececec" }}>Add {meta.label} key</p>
              <p className="text-xs mt-0.5" style={{ color: "#6b7280" }}>Unlocks {models.length} models</p>
            </div>
          </div>
        </PanelHeader>
        <PanelBody className="p-4">
          <div className="p-3 rounded-lg mb-4 text-xs leading-relaxed" style={{ background: "#252525", border: "1px solid #3f3f3f", color: "#8e8ea0" }}>
            🔒 Your key is encrypted and stored securely in your account.
          </div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "#8e8ea0" }}>API Key</label>
          <input
            type="password" value={keyInput} onChange={e => setKeyInput(e.target.value)}
            placeholder={meta.keyPlaceholder} autoFocus
            onKeyDown={e => e.key === "Enter" && saveKey()}
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: "#2f2f2f", border: `1px solid ${keyError ? "#ef4444" : "#3f3f3f"}`, color: "#ececec", fontSize: 13, outline: "none", marginBottom: keyError ? 4 : 16 }}
          />
          {keyError && <p className="text-xs mb-3" style={{ color: "#f87171" }}>⚠ {keyError}</p>}
          <div className="mb-4">
            <p className="text-xs font-medium mb-2" style={{ color: "#4b5563", letterSpacing: "0.04em" }}>UNLOCKS</p>
            {models.map(m => (
              <div key={m.id} className="flex items-center justify-between py-1.5" style={{ borderBottom: "1px solid #252525" }}>
                <span className="text-sm" style={{ color: "#acacac" }}>{m.name}</span>
                <span className="text-xs" style={{ color: "#4b5563" }}>{(m.contextWindow/1000).toFixed(0)}k ctx</span>
              </div>
            ))}
          </div>
          <a href={meta.docsUrl} target="_blank" rel="noreferrer" className="block text-center text-xs mb-4" style={{ color: "#8b5cf6" }}>
            Get your {meta.label} API key →
          </a>
          {apiKeys[addKeyFor] && (
            <button onClick={() => deleteKey(addKeyFor)} disabled={saving}
              className="w-full py-2 rounded-lg text-sm mb-2" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", cursor: saving ? "not-allowed" : "pointer" }}>
              Remove key
            </button>
          )}
          <button onClick={saveKey} disabled={saving || !keyInput.trim()}
            style={{ width: "100%", padding: "10px", borderRadius: 10, background: keyInput.trim() && !saving ? "#8b5cf6" : "#2f2f2f", border: "none", color: keyInput.trim() && !saving ? "white" : "#4b5563", fontSize: 14, fontWeight: 600, cursor: keyInput.trim() && !saving ? "pointer" : "not-allowed" }}>
            {saving ? "Saving…" : apiKeys[addKeyFor] ? "Update key" : "Save & unlock models"}
          </button>
        </PanelBody>
      </Panel>
    );
  }

  return (
    <Panel width={300}>
      {/* Header */}
      <PanelHeader>
        <div>
          <p className="text-sm font-semibold" style={{ color: "#ececec" }}>Models</p>
          <p className="text-xs mt-0.5" style={{ color: "#6b7280" }}>
            {connectedProviders.size} provider{connectedProviders.size !== 1 ? "s" : ""} · {AVAILABLE_MODELS.filter(m => connectedProviders.has(m.provider)).length} accessible
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "#6b7280" }}>Auto</span>
          <Toggle checked={autoRoute} onChange={handleAutoRoute} size="sm" />
          <button onClick={() => setUI({ activePanel: "none" })} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 14, cursor: "pointer" }}>✕</button>
        </div>
      </PanelHeader>

      {/* Search */}
      <div className="px-3 py-2.5" style={{ borderBottom: "1px solid #2f2f2f" }}>
        <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "#2f2f2f", border: "1px solid #3f3f3f" }}>
          <span style={{ color: "#4b5563", fontSize: 13 }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search models…" autoFocus
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#ececec", fontSize: 13 }} />
          {search && <button onClick={() => setSearch("")} style={{ color: "#4b5563", background: "none", border: "none", cursor: "pointer" }}>✕</button>}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-3 py-2" style={{ borderBottom: "1px solid #2f2f2f" }}>
        {(["all","connected","fast","vision","tools"] as FilterTab[]).map(tab => (
          <button key={tab} onClick={() => setFilter(tab)}
            className="capitalize text-xs px-2.5 py-1 rounded-md transition-all font-medium"
            style={{ background: filter === tab ? "#2f2f2f" : "transparent", border: `1px solid ${filter === tab ? "#3f3f3f" : "transparent"}`, color: filter === tab ? "#ececec" : "#6b7280", cursor: "pointer" }}>
            {tab}
          </button>
        ))}
      </div>

      {autoRoute && (
        <div className="mx-3 mt-2.5 p-3 rounded-lg text-xs leading-relaxed" style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", color: "#a78bfa" }}>
          ✦ Auto mode picks the best connected model for each message based on task type and cost.
        </div>
      )}

      <PanelBody className="py-2">
        {filtered.length === 0 ? (
          <p className="text-center py-10 text-sm" style={{ color: "#4b5563" }}>No models match</p>
        ) : (
          <>
            {pinned.length > 0 && (
              <section className="mb-1">
                <GroupLabel label="Pinned" />
                {pinned.map(m => <ModelRow key={m.id} model={m} isActive={activeModelId === m.id} isConnected={connectedProviders.has(m.provider)} isPinned onSelect={() => selectModel(m)} onDetail={() => setDetail(detail?.id === m.id ? null : m)} onTogglePin={() => togglePin(m.id)} isDetail={detail?.id === m.id} />)}
                <Divider />
              </section>
            )}
            {PROVIDER_ORDER.map(pid => {
              const models = (groupModelsByProvider()[pid] ?? []).filter(m => unpinned.some(u => u.id === m.id));
              if (!models.length) return null;
              const meta    = PROVIDER_META[pid];
              const hasKey  = connectedProviders.has(pid);
              return (
                <section key={pid} className="mb-1">
                  <div className="flex items-center justify-between px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold" style={{ color: hasKey ? meta.color : "#4b5563", letterSpacing: "0.04em" }}>{meta.label.toUpperCase()}</span>
                      {hasKey && <Badge variant="purple" size="xs">connected</Badge>}
                    </div>
                    <button onClick={() => openAddKey(pid)}
                      className="text-xs px-2 py-0.5 rounded"
                      style={{ background: "transparent", border: `1px solid ${hasKey ? "#3f3f3f" : "rgba(139,92,246,0.2)"}`, color: hasKey ? "#4b5563" : "#8b5cf6", cursor: "pointer" }}>
                      {hasKey ? "Edit key" : "+ Key"}
                    </button>
                  </div>
                  {models.map(m => <ModelRow key={m.id} model={m} isActive={activeModelId === m.id} isConnected={hasKey} isPinned={false} onSelect={() => selectModel(m)} onDetail={() => setDetail(detail?.id === m.id ? null : m)} onTogglePin={() => togglePin(m.id)} isDetail={detail?.id === m.id} />)}
                </section>
              );
            })}
          </>
        )}
      </PanelBody>

      {/* Detail drawer */}
      {detail && (
        <ModelDetail model={detail} isConnected={connectedProviders.has(detail.provider)} isActive={activeModelId === detail.id}
          onSelect={() => selectModel(detail)} onClose={() => setDetail(null)} onAddKey={() => openAddKey(detail.provider)} />
      )}
    </Panel>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function ModelRow({ model, isActive, isConnected, isPinned, isDetail, onSelect, onDetail, onTogglePin }: { model: Model; isActive: boolean; isConnected: boolean; isPinned: boolean; isDetail: boolean; onSelect: () => void; onDetail: () => void; onTogglePin: () => void }) {
  return (
    <div className="group flex items-center gap-1 mx-1 px-2 py-2 rounded-lg hover:bg-[#252525] transition-colors"
      style={{ background: isActive || isDetail ? "#2f2f2f" : "transparent", opacity: isConnected ? 1 : 0.4, cursor: isConnected ? "pointer" : "default" }}>
      <div className="w-4 flex justify-center flex-shrink-0">
        {isActive && <span style={{ color: "#8b5cf6", fontSize: 8 }}>●</span>}
      </div>
      <div className="flex-1 min-w-0" onClick={onSelect}>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium" style={{ color: isActive ? "#ececec" : "#acacac" }}>{model.name}</span>
          {model.speed === "fast"    && <span className="text-[10px]" style={{ color: "#4b5563" }}>⚡</span>}
          {model.supportsVision      && <span className="text-[10px]" style={{ color: "#4b5563" }}>👁</span>}
        </div>
        <p className="text-xs mt-0.5" style={{ color: "#4b5563" }}>
          {(model.contextWindow/1000).toFixed(0)}k ctx · ${model.costPer1kInput.toFixed(4)}/1k
        </p>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={e => { e.stopPropagation(); onTogglePin(); }}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#3f3f3f]"
          style={{ background: "transparent", border: "none", color: isPinned ? "#8b5cf6" : "#4b5563", fontSize: 12, cursor: "pointer" }}>
          {isPinned ? "★" : "☆"}
        </button>
        <button onClick={e => { e.stopPropagation(); onDetail(); }}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#3f3f3f]"
          style={{ background: "transparent", border: "none", color: isDetail ? "#8b5cf6" : "#4b5563", fontSize: 14, cursor: "pointer" }}>
          ⋯
        </button>
      </div>
      {!isConnected && <Badge variant="muted" size="xs">No key</Badge>}
    </div>
  );
}

function ModelDetail({ model, isConnected, isActive, onSelect, onClose, onAddKey }: { model: Model; isConnected: boolean; isActive: boolean; onSelect: () => void; onClose: () => void; onAddKey: () => void }) {
  const meta  = PROVIDER_META[model.provider];
  const stats = [
    ["Context",     `${(model.contextWindow/1000).toFixed(0)}k tokens`],
    ["Input cost",  `$${model.costPer1kInput.toFixed(4)}/1k`],
    ["Output cost", `$${model.costPer1kOutput.toFixed(4)}/1k`],
    ["Speed",        model.speed.charAt(0).toUpperCase() + model.speed.slice(1)],
    ["Vision",       model.supportsVision ? "✓ Supported" : "✗ None"],
    ["Tool use",     model.supportsTools  ? "✓ Supported" : "✗ None"],
  ];
  return (
    <div style={{ borderTop: "1px solid #2f2f2f", background: "#1a1a1a" }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #2a2a2a" }}>
        <div className="flex items-center gap-2">
          <Badge variant="purple">{meta.label}</Badge>
          <span className="font-semibold text-sm" style={{ color: "#ececec" }}>{model.name}</span>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#4b5563", fontSize: 13, cursor: "pointer" }}>✕</button>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 mb-4">
          {stats.map(([label, val]) => (
            <div key={label}>
              <p className="text-xs mb-0.5" style={{ color: "#4b5563" }}>{label}</p>
              <p className="text-xs font-medium" style={{ color: val.startsWith("✓") ? "#6ee7b7" : val.startsWith("✗") ? "#374151" : "#acacac" }}>{val}</p>
            </div>
          ))}
        </div>
        {isActive ? (
          <div className="py-2 rounded-lg text-center text-xs font-medium" style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", color: "#8b5cf6" }}>● Currently active</div>
        ) : isConnected ? (
          <button onClick={onSelect} style={{ width: "100%", padding: "9px", borderRadius: 8, background: "#8b5cf6", border: "none", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Use this model</button>
        ) : (
          <button onClick={onAddKey} style={{ width: "100%", padding: "9px", borderRadius: 8, background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", color: "#8b5cf6", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>+ Add API key to unlock</button>
        )}
      </div>
    </div>
  );
}

function GroupLabel({ label }: { label: string }) {
  return <p className="px-3 py-1 text-xs font-semibold" style={{ color: "#4b5563", letterSpacing: "0.04em" }}>{label.toUpperCase()}</p>;
}
function Divider() {
  return <div className="mx-3 my-1" style={{ height: 1, background: "#2a2a2a" }} />;
}
