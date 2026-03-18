"use client";
import { useAppStore } from "@/store";
import { DashboardPage } from "@/components/dashboard/DashboardPage";
import Link from "next/link";

export default function Dashboard() {
  const { ui } = useAppStore();
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-base)" }}>
      {/* Minimal sidebar for nav */}
      <div className="flex flex-col flex-shrink-0" style={{ width: 220, background: "var(--bg-sidebar)", borderRight: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2.5 px-4 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="relative w-7 h-7 flex-shrink-0">
            <div className="absolute inset-0" style={{ background: "var(--accent)", borderRadius: "50% 50% 50% 8px" }} />
            <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-xs">L</div>
          </div>
          <span className="font-semibold text-sm" style={{ color: "var(--text-1)" }}>LLM Manager</span>
        </div>
        <nav className="p-2">
          <Link href="/" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors" style={{ color: "var(--text-2)", textDecoration: "none" }}>
            💬 Chat
          </Link>
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--bg-active)", color: "var(--text-1)" }}>
            📊 Dashboard
          </div>
        </nav>
      </div>

      <DashboardPage />
    </div>
  );
}
