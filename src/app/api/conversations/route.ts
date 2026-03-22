import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AVAILABLE_MODELS } from "@/lib/models";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { sanitizeErrorResponse } from "@/lib/security";

// Requires the `public.conversations` table in Supabase.
// See migration SQL in the project memory / db-schema-helper agent.

async function getAuth() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { supabase, user };
}

// GET /api/conversations — list all conversations for the authenticated user
export async function GET(req: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limiting
  const limitResult = await rateLimit(req, "conversations-get", RATE_LIMITS.conversations, auth.user.id);
  if (!limitResult.success) {
    return limitResult.response;
  }

  try {
    const { data, error } = await auth.supabase
      .from("conversations")
      .select("id, title, model_id, created_at, updated_at")
      .eq("user_id", auth.user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      const sanitized = sanitizeErrorResponse(error);
      return NextResponse.json({ error: sanitized.message }, { status: sanitized.statusCode });
    }
    return NextResponse.json({ conversations: data });
  } catch (err) {
    const sanitized = sanitizeErrorResponse(err);
    return NextResponse.json({ error: sanitized.message }, { status: sanitized.statusCode });
  }
}

// POST /api/conversations — create or update a conversation
export async function POST(req: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limiting
  const limitResult = await rateLimit(req, "conversations-post", RATE_LIMITS.conversations, auth.user.id);
  if (!limitResult.success) {
    return limitResult.response;
  }

  const body = await req.json();
  const { id, title = "New conversation", model_id } = body;

  if (!id || !model_id) {
    return NextResponse.json({ error: "id and model_id required" }, { status: 400 });
  }

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid conversation ID format" }, { status: 400 });
  }

  // Validate title length
  if (typeof title !== "string" || title.length > 200) {
    return NextResponse.json({ error: "Title must be a string of max 200 characters" }, { status: 400 });
  }

  // Validate model_id against allowed models
  if (!AVAILABLE_MODELS.some(m => m.id === model_id)) {
    return NextResponse.json({ error: "Invalid model ID" }, { status: 400 });
  }

  try {
    const { error } = await auth.supabase
      .from("conversations")
      .upsert({
        id,
        user_id: auth.user.id,
        title,
        model_id,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      const sanitized = sanitizeErrorResponse(error);
      return NextResponse.json({ error: sanitized.message }, { status: sanitized.statusCode });
    }
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    const sanitized = sanitizeErrorResponse(err);
    return NextResponse.json({ error: sanitized.message }, { status: sanitized.statusCode });
  }
}

// DELETE /api/conversations?id=xxx — delete a conversation
export async function DELETE(req: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limiting
  const limitResult = await rateLimit(req, "conversations-delete", RATE_LIMITS.conversations, auth.user.id);
  if (!limitResult.success) {
    return limitResult.response;
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    const { error } = await auth.supabase
      .from("conversations")
      .delete()
      .eq("id", id)
      .eq("user_id", auth.user.id);

    if (error) {
      const sanitized = sanitizeErrorResponse(error);
      return NextResponse.json({ error: sanitized.message }, { status: sanitized.statusCode });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const sanitized = sanitizeErrorResponse(err);
    return NextResponse.json({ error: sanitized.message }, { status: sanitized.statusCode });
  }
}
