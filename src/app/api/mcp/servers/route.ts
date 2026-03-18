import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_MCP_SERVERS } from "@/lib/mcp-servers";

export const dynamic = "force-dynamic";

// ── GET /api/mcp/servers ─────────────────────────────────────────────────────
// Returns user's MCP server configs. Seeds defaults on first call.
// Also indicates which servers have keys stored (without returning key values).

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch existing servers
  let { data: servers, error } = await supabase
    .from("mcp_servers")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Seed defaults if user has no servers yet
  if (!servers || servers.length === 0) {
    const defaults = DEFAULT_MCP_SERVERS.map(srv => ({
      id:          srv.id,
      user_id:     user.id,
      name:        srv.name,
      description: srv.description,
      icon:        srv.icon,
      category:    srv.category,
      transport:   srv.transport,
      url:         srv.url ?? null,
      enabled:     false,
      is_default:  true,
    }));

    const { error: seedError } = await supabase.from("mcp_servers").insert(defaults);
    if (seedError) {
      return NextResponse.json({ error: seedError.message }, { status: 500 });
    }

    const { data: seeded } = await supabase
      .from("mcp_servers")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at");
    servers = seeded ?? [];
  }

  // Check which servers have keys (without returning key values)
  const { data: keyRows } = await supabase
    .from("mcp_server_keys")
    .select("server_id")
    .eq("user_id", user.id);

  const serversWithKeys = new Set((keyRows ?? []).map(r => r.server_id));

  // Map to client format, merging in tool definitions from defaults
  const defaultToolMap = new Map(DEFAULT_MCP_SERVERS.map(s => [s.id, s]));

  const result = servers.map(srv => {
    const defaultDef = defaultToolMap.get(srv.id);
    return {
      id:          srv.id,
      name:        srv.name,
      description: srv.description,
      icon:        srv.icon,
      category:    srv.category,
      transport:   srv.transport,
      url:         srv.url,
      enabled:     srv.enabled,
      isDefault:   srv.is_default,
      requiresKey: defaultDef?.requiresKey ?? false,
      keyLabel:    defaultDef?.keyLabel ?? undefined,
      hasKey:      serversWithKeys.has(srv.id),
      tools:       defaultDef?.tools ?? [],
    };
  });

  return NextResponse.json({ servers: result });
}

// ── POST /api/mcp/servers ────────────────────────────────────────────────────
// Create a custom MCP server.

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, description, icon, category, transport, url } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("mcp_servers")
    .insert({
      user_id:     user.id,
      name:        name.trim(),
      description: description?.trim() || name.trim(),
      icon:        icon || "🔧",
      category:    category || "custom",
      transport:   transport || (url ? "http" : "stdio"),
      url:         url?.trim() || null,
      enabled:     false,
      is_default:  false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    server: {
      id:          data.id,
      name:        data.name,
      description: data.description,
      icon:        data.icon,
      category:    data.category,
      transport:   data.transport,
      url:         data.url,
      enabled:     data.enabled,
      isDefault:   false,
      requiresKey: false,
      hasKey:      false,
      tools:       [],
    },
  });
}

// ── PATCH /api/mcp/servers ───────────────────────────────────────────────────
// Toggle enabled/disabled or update server fields.

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, enabled, name, url } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (enabled !== undefined) patch.enabled = enabled;
  if (name !== undefined)    patch.name = name;
  if (url !== undefined)     patch.url = url;

  const { error } = await supabase
    .from("mcp_servers")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// ── DELETE /api/mcp/servers?id=xxx ───────────────────────────────────────────
// Delete a custom MCP server (and its keys via cascade).

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id query param required" }, { status: 400 });

  const { error } = await supabase
    .from("mcp_servers")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("is_default", false); // prevent deleting defaults

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
