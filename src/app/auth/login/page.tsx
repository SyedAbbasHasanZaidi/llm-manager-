"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router   = useRouter();
  const supabase = createClient();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#212121" }}>
      <div style={{ width: 360, padding: 32, borderRadius: 16, background: "#2a2a2a", border: "1px solid #3f3f3f" }}>
        <h1 style={{ color: "#ececec", fontSize: 22, fontWeight: 700, marginBottom: 4, textAlign: "center" }}>LLM Manager</h1>
        <p style={{ color: "#6b7280", fontSize: 13, textAlign: "center", marginBottom: 28 }}>Sign in to your account</p>

        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ display: "block", color: "#8e8ea0", fontSize: 12, marginBottom: 6, fontWeight: 500 }}>Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              required autoFocus placeholder="you@example.com"
              autoComplete="email"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: "#333", border: "1px solid #3f3f3f", color: "#ececec", fontSize: 14, outline: "none", boxSizing: "border-box" }}
            />
          </div>

          <div>
            <label style={{ display: "block", color: "#8e8ea0", fontSize: 12, marginBottom: 6, fontWeight: 500 }}>Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              required placeholder="••••••••"
              autoComplete="current-password"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: "#333", border: "1px solid #3f3f3f", color: "#ececec", fontSize: 14, outline: "none", boxSizing: "border-box" }}
            />
          </div>

          {error && (
            <p style={{ color: "#f87171", fontSize: 13, padding: "8px 12px", background: "rgba(239,68,68,0.08)", borderRadius: 8, margin: 0 }}>
              {error}
            </p>
          )}

          <button
            type="submit" disabled={loading}
            style={{ marginTop: 4, padding: "11px", borderRadius: 10, background: loading ? "#3f3f3f" : "#8b5cf6", border: "none", color: loading ? "#6b7280" : "white", fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p style={{ color: "#4b5563", fontSize: 13, textAlign: "center", marginTop: 20 }}>
          No account?{" "}
          <Link href="/auth/signup" style={{ color: "#8b5cf6", textDecoration: "none" }}>Create one</Link>
        </p>
      </div>
    </div>
  );
}
