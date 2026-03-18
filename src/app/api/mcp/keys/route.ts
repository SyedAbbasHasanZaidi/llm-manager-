import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { saveMCPKey, deleteMCPKey } from "@/lib/mcp-keys";

export const dynamic = "force-dynamic";

// ── POST /api/mcp/keys ──────────────────────────────────────────────────────
// Save an encrypted credential for an MCP server.
// Body: { serverId, keyLabel, key }

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { serverId, keyLabel, key } = await req.json();

  if (!serverId || !key?.trim()) {
    return NextResponse.json({ error: "serverId and key are required" }, { status: 400 });
  }

  // Verify server belongs to user
  const { data: srv } = await supabase
    .from("mcp_servers")
    .select("id")
    .eq("id", serverId)
    .eq("user_id", user.id)
    .single();

  if (!srv) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }

  const ok = await saveMCPKey(serverId, user.id, keyLabel || "default", key.trim());
  if (!ok) {
    return NextResponse.json({ error: "Failed to save key" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// ── DELETE /api/mcp/keys?serverId=xxx ────────────────────────────────────────
// Remove all credentials for an MCP server.

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const serverId = req.nextUrl.searchParams.get("serverId");
  if (!serverId) {
    return NextResponse.json({ error: "serverId query param required" }, { status: 400 });
  }

  const ok = await deleteMCPKey(serverId, user.id);
  if (!ok) {
    return NextResponse.json({ error: "Failed to delete key" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
