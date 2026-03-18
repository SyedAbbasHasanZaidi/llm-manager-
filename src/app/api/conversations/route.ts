import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Requires the `public.conversations` table in Supabase.
// See migration SQL in the project memory / db-schema-helper agent.

async function getAuth() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { supabase, user };
}

// GET /api/conversations — list all conversations for the authenticated user
export async function GET() {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await auth.supabase
    .from("conversations")
    .select("id, title, model_id, created_at, updated_at")
    .eq("user_id", auth.user.id)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ conversations: data });
}

// POST /api/conversations — create or update a conversation
export async function POST(req: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, title = "New conversation", model_id } = body;

  if (!id || !model_id) {
    return NextResponse.json({ error: "id and model_id required" }, { status: 400 });
  }

  const { error } = await auth.supabase
    .from("conversations")
    .upsert({
      id,
      user_id: auth.user.id,
      title,
      model_id,
      updated_at: new Date().toISOString(),
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id });
}

// DELETE /api/conversations?id=xxx — delete a conversation
export async function DELETE(req: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await auth.supabase
    .from("conversations")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
