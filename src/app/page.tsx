"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store";
import { createClient } from "@/lib/supabase/client";
import { ConversationSidebar } from "@/components/chat/ConversationSidebar";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { ModelSelector } from "@/components/models/ModelSelector";
import { MCPPanel } from "@/components/mcp/MCPPanel";
import { ComparisonView } from "@/components/comparison/ComparisonView";

export default function HomePage() {
  const { ui, setUI, setActiveConversation, setConnectedProviders, setUserProfile } = useAppStore();
  const router   = useRouter();
  const supabase = createClient();
  const [authChecked, setAuthChecked] = useState(false);

  // Client-side auth guard + load user profile
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace("/auth/login");
      } else {
        const meta = user.user_metadata ?? {};
        setUserProfile({
          username:  meta.username ?? user.email?.split("@")[0] ?? "User",
          email:     user.email ?? "",
          avatarUrl: meta.avatar_url ?? null,
        });

        // On a new browser session (tab/window closed and reopened), always
        // start on a fresh conversation. sessionStorage is cleared on close
        // but survives page refreshes, so we only reset once per session.
        if (!sessionStorage.getItem("session-active")) {
          sessionStorage.setItem("session-active", "1");
          setActiveConversation(null);
        }

        setAuthChecked(true);
      }
    });
  }, [supabase, router, setUserProfile, setActiveConversation]);

  // Load which providers the user has keys for (no key values — server-side only)
  useEffect(() => {
    if (!authChecked) return;
    fetch("/api/keys")
      .then(r => {
        if (r.status === 401) { router.replace("/auth/login"); return null; }
        return r.json();
      })
      .then(data => {
        if (data?.connectedProviders) setConnectedProviders(data.connectedProviders);
      })
      .catch(() => {/* network error — keep existing state */});
  }, [authChecked, setConnectedProviders, router]);

  if (!authChecked) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: "var(--bg-base)" }}>
        <div className="text-sm" style={{ color: "var(--text-3)" }}>Checking session...</div>
      </div>
    );
  }

  const handleNewChat = () => {
    // Clear the active conversation — a new one is created lazily on first send
    setActiveConversation(null);
    setUI({ activePanel: "none", comparisonMode: false });
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-base)" }}>
      {/* Sidebar */}
      {ui.sidebarOpen && (
        <ConversationSidebar onNewChat={handleNewChat} />
      )}

      {/* Main content */}
      <div className="flex flex-1 min-w-0 overflow-hidden">
        {ui.comparisonMode ? (
          <ComparisonView />
        ) : (
          <ChatWindow />
        )}

        {/* Right panels */}
        {ui.activePanel === "models" && <ModelSelector />}
        {ui.activePanel === "mcp"    && <MCPPanel />}
      </div>

    </div>
  );
}
