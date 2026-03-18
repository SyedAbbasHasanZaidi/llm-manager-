import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PROVIDER_META } from "@/lib/models";
import { toDbProvider } from "@/lib/keys";

// Maps DB enum value → app provider name
const DB_TO_APP: Record<string, string> = { google_ai: "google" };
function fromDbProvider(p: string): string { return DB_TO_APP[p] ?? p; }

function getPassphrase(): string {
  const s = process.env.ENCRYPTION_SECRET;
  if (!s) throw new Error("ENCRYPTION_SECRET env var is not set");
  return s;
}

// ── GET /api/keys ─────────────────────────────────────────────────────────────
// Returns which providers the authenticated user has saved keys for.
// Never returns actual key values to the client.
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("api_keys")
    .select("provider")
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const connectedProviders = (data ?? []).map(row => fromDbProvider(row.provider as string));
  return NextResponse.json({ connectedProviders });
}

// ── POST /api/keys ────────────────────────────────────────────────────────────
// Validates and saves (or updates) an API key for the authenticated user.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { provider, key } = await req.json() as { provider: string; key: string };

  const meta = PROVIDER_META[provider as keyof typeof PROVIDER_META];
  if (!meta) {
    return NextResponse.json({ valid: false, error: "Unknown provider" }, { status: 400 });
  }

  const trimmed = key?.trim() ?? "";
  if (!trimmed) {
    return NextResponse.json({ valid: false, error: "Key cannot be empty" }, { status: 400 });
  }
  if (meta.keyPrefix && !trimmed.startsWith(meta.keyPrefix)) {
    return NextResponse.json({ valid: false, error: `Key must start with "${meta.keyPrefix}"` }, { status: 400 });
  }
  if (trimmed.length < 16) {
    return NextResponse.json({ valid: false, error: "Key appears too short" }, { status: 400 });
  }

  const dbProvider = toDbProvider(provider);
  const passphrase = getPassphrase();

  // Delete any existing key for this provider (upsert via delete + insert)
  await supabase
    .from("api_keys")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", dbProvider);

  // Use the DB's built-in insert_api_key RPC (handles pgcrypto encryption)
  const { error } = await supabase.rpc("insert_api_key", {
    _user_id:    user.id,
    _provider:   dbProvider,
    _key:        trimmed,
    _passphrase: passphrase,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ valid: true, provider });
}

// ── DELETE /api/keys?provider=xxx ────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const provider = req.nextUrl.searchParams.get("provider");
  if (!provider) {
    return NextResponse.json({ error: "provider query param required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("api_keys")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", toDbProvider(provider));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
