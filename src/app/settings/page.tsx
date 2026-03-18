"use client";
import Link from "next/link";

/**
 * Settings page — stub.
 * Planned features: default model, system prompt, keyboard shortcuts,
 * data export, account deletion.
 */
export default function SettingsPage() {
  return (
    <div className="flex h-screen items-center justify-center" style={{ background: "var(--bg-base)" }}>
      <div className="flex flex-col items-center gap-4 text-center" style={{ maxWidth: 360 }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl" style={{ background: "var(--bg-elevated)" }}>
          ⚙️
        </div>
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-1)" }}>Settings</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-3)" }}>
            Coming soon — default model, system prompts, data export, and more.
          </p>
        </div>
        <Link
          href="/"
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: "var(--accent)", color: "#fff", textDecoration: "none" }}
        >
          ← Back to chat
        </Link>
      </div>
    </div>
  );
}
