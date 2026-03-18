"use client";
import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store";
import { createClient } from "@/lib/supabase/client";
import { groupBy, relativeDate } from "@/lib/utils";

interface Props {
  onNewChat: () => void;
}

export function ConversationSidebar({ onNewChat }: Props) {
  const { conversations, activeConversationId, setActiveConversation, deleteConversation, userProfile } = useAppStore();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(c => c.title.toLowerCase().includes(q));
  }, [conversations, search]);

  const grouped = groupBy(filtered, c => relativeDate(c.updatedAt));
  const dateOrder = ["Today", "Yesterday"];
  const sortedKeys = [
    ...dateOrder.filter(k => grouped[k]),
    ...Object.keys(grouped).filter(k => !dateOrder.includes(k)),
  ];

  return (
    <div className="flex flex-col h-full" style={{ width: 260, background: "var(--bg-sidebar)", borderRight: "1px solid var(--border)" }}>
      {/* Logo + new chat */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center justify-between px-2 py-1.5">
          <div className="flex items-center gap-2.5">
            <div className="relative w-7 h-7 flex-shrink-0">
              <div className="absolute inset-0 rounded-tl-full rounded-tr-full rounded-br-full rounded-bl-[6px]" style={{ background: "var(--accent)" }} />
              <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-xs">L</div>
              <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2" style={{ background: "var(--accent-2)", borderColor: "var(--bg-sidebar)" }} />
            </div>
            <span className="font-semibold text-sm" style={{ color: "var(--text-1)" }}>LLM Manager</span>
          </div>
          <button
            onClick={onNewChat}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-base transition-colors"
            style={{ background: "transparent", border: "none", color: "var(--text-3)", cursor: "pointer" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-elevated)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            title="New chat"
          >
            ✏
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
          <span style={{ color: "var(--text-4)", fontSize: 13 }}>🔍</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search chats"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--text-1)", fontSize: 13 }}
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2">
        {conversations.length === 0 ? (
          <div className="py-10 text-center">
            <div className="text-xs mb-2" style={{ color: "var(--text-4)" }}>No conversations yet</div>
            <button
              onClick={onNewChat}
              className="text-xs underline"
              style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer" }}
            >
              Start one →
            </button>
          </div>
        ) : (
          sortedKeys.map(dateLabel => (
            <div key={dateLabel} className="mb-1">
              <div className="px-2 py-1 text-xs font-medium" style={{ color: "var(--text-4)", letterSpacing: "0.03em" }}>
                {dateLabel.toUpperCase()}
              </div>
              {grouped[dateLabel].map(conv => (
                <ConvItem
                  key={conv.id}
                  title={conv.title}
                  isActive={conv.id === activeConversationId}
                  onSelect={() => setActiveConversation(conv.id)}
                  onDelete={() => deleteConversation(conv.id)}
                />
              ))}
            </div>
          ))
        )}
      </div>

      {/* User footer with menu */}
      <UserMenu profile={userProfile} />
    </div>
  );
}

// ── UserMenu ─────────────────────────────────────────────────────────────────
// Replaces the old avatar-upload button with a proper dropdown menu.

type Theme = "dark" | "light" | "mono";

const THEME_OPTIONS: { value: Theme; label: string; swatch: string }[] = [
  { value: "dark",  label: "Dark",          swatch: "#212121" },
  { value: "light", label: "Light",         swatch: "#f5f5f5" },
  { value: "mono",  label: "Monochromatic", swatch: "#1c1c1c" },
];

function UserMenu({ profile }: { profile: { username: string; email: string; avatarUrl: string | null } }) {
  const { theme, setTheme } = useAppStore();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router  = useRouter();

  const initial = (profile.username?.[0] ?? profile.email?.[0] ?? "U").toUpperCase();

  // Close on outside click
  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!menuRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
  };

  const navigate = (path: string) => {
    setOpen(false);
    router.push(path);
  };

  const handleSignOut = async () => {
    setOpen(false);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  };

  return (
    <div
      ref={menuRef}
      className="relative px-3 py-2"
      style={{ borderTop: "1px solid var(--border)" }}
      onBlur={handleBlur}
      tabIndex={-1}
    >
      {/* Dropdown — rendered above the footer */}
      {open && (
        <div
          className="absolute left-3 right-3 bottom-full mb-2 rounded-xl py-1.5 shadow-xl animate-fade-up z-50"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-2)" }}
        >
          {/* Theme picker */}
          <div className="px-3 pt-1 pb-2">
            <p className="text-xs font-medium mb-2" style={{ color: "var(--text-4)" }}>THEME</p>
            <div className="flex gap-1.5">
              {THEME_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  title={opt.label}
                  style={{
                    flex: 1,
                    padding: "6px 4px",
                    borderRadius: 8,
                    border: theme === opt.value ? `1.5px solid var(--accent)` : "1.5px solid var(--border-2)",
                    background: theme === opt.value ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "transparent",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {/* Mini swatch */}
                  <span
                    style={{
                      display: "block",
                      width: 18,
                      height: 18,
                      borderRadius: 5,
                      background: opt.swatch,
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                  />
                  <span style={{ fontSize: 10, color: theme === opt.value ? "var(--accent)" : "var(--text-3)", whiteSpace: "nowrap" }}>
                    {opt.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ height: 1, background: "var(--border)", margin: "2px 0" }} />

          {/* Navigation */}
          <MenuItem icon="👤" label="Profile"  onClick={() => navigate("/profile")}  />
          <MenuItem icon="⚙️" label="Settings" onClick={() => navigate("/settings")} />

          <div style={{ height: 1, background: "var(--border)", margin: "2px 0" }} />

          {/* Sign out */}
          <MenuItem icon="→" label="Sign out" onClick={handleSignOut} danger />
        </div>
      )}

      {/* Trigger row */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg transition-colors text-left"
        style={{
          background: open ? "var(--bg-active)" : "transparent",
          border: "none",
          cursor: "pointer",
          color: "inherit",
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = "var(--bg-elevated)"; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = "transparent"; }}
      >
        {/* Avatar */}
        <div
          className="w-7 h-7 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center"
          style={{ background: profile.avatarUrl ? "transparent" : "var(--accent)" }}
        >
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs font-bold text-white">{initial}</span>
          )}
        </div>

        {/* Name + email */}
        <div className="flex-1 min-w-0">
          <span className="text-sm block truncate" style={{ color: "var(--text-1)" }}>{profile.username}</span>
          <span className="text-xs block truncate" style={{ color: "var(--text-4)" }}>{profile.email}</span>
        </div>

        {/* Chevron */}
        <span style={{ color: "var(--text-4)", fontSize: 11, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
          ▾
        </span>
      </button>
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors"
      style={{
        background: "transparent",
        border: "none",
        color: danger ? "var(--danger)" : "var(--text-2)",
        cursor: "pointer",
        textAlign: "left",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-active)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ fontSize: 14, width: 18, textAlign: "center" }}>{icon}</span>
      {label}
    </button>
  );
}

// ── ConvItem ──────────────────────────────────────────────────────────────────

function ConvItem({ title, isActive, onSelect, onDelete }: { title: string; isActive: boolean; onSelect: () => void; onDelete: () => void }) {
  return (
    <div
      className="group flex items-center gap-1 px-2 py-2 rounded-lg mb-0.5 cursor-pointer transition-colors"
      style={{ background: isActive ? "var(--bg-active)" : "transparent" }}
      onClick={onSelect}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--bg-elevated)"; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
    >
      <span className="flex-1 text-sm truncate" style={{ color: isActive ? "var(--text-1)" : "var(--text-2)" }}>
        {title}
      </span>
      <button
        className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-xs transition-opacity"
        style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", flexShrink: 0 }}
        onClick={e => { e.stopPropagation(); onDelete(); }}
        title="Delete"
      >
        ✕
      </button>
    </div>
  );
}
