"use client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store";
import { AVAILABLE_MODELS, PROVIDER_META, PROVIDER_ORDER } from "@/lib/models";
import { formatCost, formatTokens } from "@/lib/utils";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function DashboardPage() {
  const { conversations, totalTokensUsed, totalCostUSD, mcpServers, activeModelId, setUI } = useAppStore();
  const router = useRouter();
  const totalMessages = conversations.reduce((a, c) => a + c.messages.length, 0);
  const enabledMCP    = mcpServers.filter(s => s.enabled).length;

  // Derive daily usage from message timestamps (last 7 days)
  const dailyUsage = useMemo(() => {
    const now    = new Date();
    const days: { day: string; tokens: number; cost: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push({ day: DAY_LABELS[d.getDay()], tokens: 0, cost: 0 });
    }
    for (const conv of conversations) {
      for (const msg of conv.messages) {
        const msgDate = new Date(msg.createdAt);
        const diffMs  = now.getTime() - msgDate.getTime();
        const diffDay = Math.floor(diffMs / 86_400_000);
        if (diffDay >= 0 && diffDay < 7) {
          const idx = 6 - diffDay;
          days[idx].tokens += msg.tokenCount ?? 0;
          days[idx].cost   += msg.cost ?? 0;
        }
      }
    }
    return days;
  }, [conversations]);

  // Derive per-model breakdown from all conversations
  const byModel = useMemo(() => {
    const map = new Map<string, { tokens: number; cost: number; count: number }>();
    for (const conv of conversations) {
      for (const msg of conv.messages) {
        if (msg.role !== "assistant" || !msg.model) continue;
        const entry = map.get(msg.model) ?? { tokens: 0, cost: 0, count: 0 };
        entry.tokens += msg.tokenCount ?? 0;
        entry.cost   += msg.cost ?? 0;
        entry.count  += 1;
        map.set(msg.model, entry);
      }
    }
    return Array.from(map.entries())
      .map(([modelId, stats]) => ({ modelId, ...stats }))
      .sort((a, b) => b.tokens - a.tokens);
  }, [conversations]);

  const statCards = [
    { label: "Total Conversations", value: conversations.length.toString(), icon: "💬", sub: "All time" },
    { label: "Total Messages",      value: totalMessages.toString(),         icon: "📨", sub: "Across all convs" },
    { label: "Tokens Used",         value: formatTokens(totalTokensUsed),    icon: "🔢", sub: "All time" },
    { label: "Total Cost",          value: formatCost(totalCostUSD),         icon: "💵", sub: "USD all time" },
    { label: "Active MCP Servers",  value: enabledMCP.toString(),            icon: "🔌", sub: "Currently enabled" },
    { label: "Models Available",    value: AVAILABLE_MODELS.length.toString(),icon: "🤖", sub: "Across all providers" },
  ];

  const maxDailyTokens = Math.max(...dailyUsage.map(d => d.tokens), 1);

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "#212121" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold mb-1" style={{ color: "var(--text-1)", letterSpacing: "-0.02em" }}>Dashboard</h1>
            <p className="text-sm" style={{ color: "var(--text-3)" }}>Usage overview across all models and providers</p>
          </div>
          <button
            onClick={() => { setUI({ activePanel: "models" }); router.push("/"); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            🤖 Change Model
            <span className="text-xs opacity-75">({activeModelId})</span>
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {statCards.map(card => (
            <div key={card.label} className="p-5 rounded-xl" style={{ background: "#1a1a1a", border: "1px solid #2f2f2f" }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium" style={{ color: "#6b7280", letterSpacing: "0.04em" }}>{card.label.toUpperCase()}</span>
                <span className="text-base">{card.icon}</span>
              </div>
              <div className="text-2xl font-bold mb-1" style={{ color: "#ececec", letterSpacing: "-0.02em" }}>{card.value}</div>
              <div className="text-xs" style={{ color: "#4b5563" }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {/* Daily token usage bar chart */}
          <div className="p-5 rounded-xl" style={{ background: "#1a1a1a", border: "1px solid #2f2f2f" }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: "#ececec" }}>Daily Token Usage</h3>
            <div className="flex items-end gap-2" style={{ height: 120 }}>
              {dailyUsage.map(d => {
                const pct = (d.tokens / maxDailyTokens) * 100;
                return (
                  <div key={d.day} className="flex flex-col items-center gap-1 flex-1">
                    <span className="text-[10px]" style={{ color: "#4b5563" }}>{formatTokens(d.tokens)}</span>
                    <div className="w-full rounded-sm transition-all" style={{ height: `${pct}%`, background: "#8b5cf6", opacity: 0.7, minHeight: 4 }} />
                    <span className="text-[10px]" style={{ color: "#6b7280" }}>{d.day}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Daily cost line-ish chart */}
          <div className="p-5 rounded-xl" style={{ background: "#1a1a1a", border: "1px solid #2f2f2f" }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: "#ececec" }}>Daily Cost (USD)</h3>
            <div className="flex items-end gap-2" style={{ height: 120 }}>
              {dailyUsage.map(d => {
                const maxCost = Math.max(...dailyUsage.map(x => x.cost));
                const pct     = (d.cost / maxCost) * 100;
                return (
                  <div key={d.day} className="flex flex-col items-center gap-1 flex-1">
                    <span className="text-[10px]" style={{ color: "#4b5563" }}>${d.cost.toFixed(3)}</span>
                    <div className="w-full rounded-sm" style={{ height: `${pct}%`, background: "#6ee7b7", opacity: 0.6, minHeight: 4 }} />
                    <span className="text-[10px]" style={{ color: "#6b7280" }}>{d.day}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Usage by model */}
        <div className="p-5 rounded-xl mb-8" style={{ background: "#1a1a1a", border: "1px solid #2f2f2f" }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "#ececec" }}>Usage by Model</h3>
          <div className="space-y-3">
            {byModel.map(row => {
              const model  = AVAILABLE_MODELS.find(m => m.id === row.modelId);
              const meta   = model ? PROVIDER_META[model.provider] : null;
              const maxTok = Math.max(...byModel.map(r => r.tokens));
              const pct    = (row.tokens / maxTok) * 100;
              return (
                <div key={row.modelId}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: "#acacac" }}>{model?.name ?? row.modelId}</span>
                      <span className="text-xs" style={{ color: meta?.color ?? "#6b7280" }}>{meta?.label}</span>
                    </div>
                    <div className="flex gap-4 text-xs" style={{ color: "#4b5563" }}>
                      <span>{row.count} msgs</span>
                      <span>{formatTokens(row.tokens)} tokens</span>
                      <span style={{ color: "#6ee7b7" }}>{formatCost(row.cost)}</span>
                    </div>
                  </div>
                  <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: "#2f2f2f" }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: meta?.color ?? "#8b5cf6", opacity: 0.7 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Provider breakdown */}
        <div className="p-5 rounded-xl" style={{ background: "#1a1a1a", border: "1px solid #2f2f2f" }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "#ececec" }}>Provider Breakdown</h3>
          <div className="grid grid-cols-5 gap-3">
            {PROVIDER_ORDER.map(pid => {
              const meta   = PROVIDER_META[pid];
              const models = AVAILABLE_MODELS.filter(m => m.provider === pid);
              return (
                <div key={pid} className="p-3 rounded-lg text-center" style={{ background: "#252525", border: "1px solid #2f2f2f" }}>
                  <div className="text-sm font-semibold mb-1" style={{ color: meta.color }}>{meta.label}</div>
                  <div className="text-xl font-bold mb-0.5" style={{ color: "#ececec" }}>{models.length}</div>
                  <div className="text-xs" style={{ color: "#4b5563" }}>models</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
