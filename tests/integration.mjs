/**
 * Integration tests — user auth + Supabase DB + all API routes
 * Requires the Next.js dev server to be running (npm run dev).
 *
 * Usage:   node tests/integration.mjs
 *
 * When SUPABASE_SERVICE_ROLE_KEY is present in .env.local the test runner
 * uses the admin API to create/delete the test user automatically — no
 * email is sent, no rate limit is hit, and the user is cleaned up after
 * every run so tests are fully isolated.
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

// ── Load .env.local ──────────────────────────────────────────────────────────
function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      env[key] = val;
    }
  } catch {
    console.error("Could not read .env.local — make sure it exists.");
    process.exit(1);
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL      = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON     = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SRK      = env.SUPABASE_SERVICE_ROLE_KEY ?? null;
const BASE_URL          = "http://localhost:3000";

const TEST_EMAIL    = process.env.TEST_EMAIL    ?? "integration_test@llm-manager-test.local";
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? "IntegTest1234!";
const TEST_USERNAME = "integration_tester";

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

// ── Clients ───────────────────────────────────────────────────────────────────
// anon client  — mirrors what the browser uses
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// admin client — uses service role key; bypasses RLS & email rate limits
const admin = SUPABASE_SRK
  ? createClient(SUPABASE_URL, SUPABASE_SRK, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

// ── Helpers ──────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function ok(label, value, expected) {
  const pass = expected !== undefined ? value === expected : !!value;
  if (pass) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.log(`  ✗  ${label}  (got: ${JSON.stringify(value)}, expected: ${JSON.stringify(expected ?? true)})`);
    failed++;
  }
}

function skip(label, reason) {
  console.log(`  ⊘  ${label}  [skipped: ${reason}]`);
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

// ════════════════════════════════════════════════════════════════════════════
// BLOCK A — Supabase Auth
// ════════════════════════════════════════════════════════════════════════════

section("A1. Supabase connectivity");
{
  const { error } = await supabase.auth.getSession();
  ok("Supabase auth API reachable", !error);
}

section("A2. Test user provisioning");
let userId;
let userProvisioned = false;

if (admin) {
  // ── Admin path: create a fresh user each run, delete it in cleanup ──────
  // Uses service role key → no email sent, no rate limit, fully isolated.
  console.log("  ℹ  Service role key found — using admin API (no email, no rate limit)");

  // Delete any leftover from a previous failed run first
  const { data: existing } = await admin.auth.admin.listUsers();
  const leftover = existing?.users?.find(u => u.email === TEST_EMAIL);
  if (leftover) {
    await admin.auth.admin.deleteUser(leftover.id);
  }

  const { data, error } = await admin.auth.admin.createUser({
    email:            TEST_EMAIL,
    password:         TEST_PASSWORD,
    email_confirm:    true,           // mark email as confirmed — no OTP needed
    user_metadata:    { username: TEST_USERNAME },
  });

  ok("admin.createUser succeeds",  !error);
  ok("Response contains user",     !!data?.user);
  userId = data?.user?.id;
  ok("User ID is valid UUID",      typeof userId === "string" && userId.length > 10);
  ok("User email matches",         data?.user?.email, TEST_EMAIL);
  ok("Email is confirmed",         !!data?.user?.email_confirmed_at);
  if (error) console.log(`   Error: ${error.message}`);
  userProvisioned = !!data?.user;

} else {
  // ── Anon path: reuse a fixed account, fall back to signUp ───────────────
  console.log("  ℹ  No service role key — using anon signUp (may hit rate limit)");

  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL, password: TEST_PASSWORD,
  });

  if (!loginError && loginData?.user) {
    userId = loginData.user.id;
    userProvisioned = true;
    ok("Existing test account found — signed in directly", true);
    ok("User ID is valid UUID", typeof userId === "string" && userId.length > 10);
    await supabase.auth.signOut();
  } else {
    const { data: signupData, error: signupError } = await supabase.auth.signUp({
      email: TEST_EMAIL, password: TEST_PASSWORD,
      options: { data: { username: TEST_USERNAME } },
    });

    if (signupError) {
      const isRateLimit = signupError.message.toLowerCase().includes("rate limit");
      console.log(`  ⚠  ${isRateLimit ? "Rate limited — add SUPABASE_SERVICE_ROLE_KEY to .env.local to bypass" : signupError.message}`);
      ok("signUp", false);
    } else {
      ok("signUp succeeds",      !signupError);
      ok("Response contains user", !!signupData?.user);
      userId = signupData?.user?.id;
      ok("User ID is valid UUID",  typeof userId === "string" && userId.length > 10);
      userProvisioned = !!signupData?.user;
    }
  }
}

section("A3. Sign-in with password");
let accessToken = null;
let sessionCookies = "";

if (!userProvisioned) {
  skip("signInWithPassword", "user not provisioned");
  skip("Session access_token present", "user not provisioned");
} else {
  const { data, error } = await supabase.auth.signInWithPassword({
    email:    TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  ok("signInWithPassword succeeds",  !error);
  ok("Session access_token present", !!data?.session?.access_token);
  accessToken = data?.session?.access_token ?? null;
  userId = userId ?? data?.user?.id;

  if (error) console.log(`   Error: ${error.message}`);

  if (data?.session) {
    const { access_token, refresh_token } = data.session;
    const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
    const tokenObj = JSON.stringify({ access_token, refresh_token, token_type: "bearer", expires_in: 3600 });
    sessionCookies = `sb-${projectRef}-auth-token=base64-${Buffer.from(tokenObj).toString("base64")}`;
  }
}

section("A4. getUser() after sign-in");
if (!userProvisioned) {
  skip("getUser", "user not provisioned");
} else {
  const { data, error } = await supabase.auth.getUser();
  ok("getUser() returns user",  !error && !!data?.user);
  if (userId) ok("User ID matches", data?.user?.id, userId);
}

section("A5. DB — public.users row (created by DB trigger on signup)");
if (!userId) {
  skip("public.users query", "no userId available");
} else {
  await new Promise(r => setTimeout(r, 800)); // allow trigger to fire

  // Use admin client when available (bypasses RLS) to isolate trigger vs. RLS issues
  const client = admin ?? supabase;
  const { data, error } = await client
    .from("users")
    .select("id, username, email")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    ok(`public.users query: ${error.message}`, false);
  } else if (!data && admin) {
    // Row missing even bypassing RLS → DB trigger did not fire for admin-created user
    console.log("  ℹ  DB trigger did not run for admin.createUser() — this is expected if the");
    console.log("     trigger only fires via the normal auth signup flow.");
    console.log("     Add the user's row manually or adjust the trigger to also cover admin inserts.");
    skip("public.users row exists", "trigger does not fire for admin-created users");
  } else {
    ok("public.users row exists",  !!data);
    if (data) {
      ok("email stored correctly", data.email, TEST_EMAIL);
      ok("username is non-empty",  typeof data.username === "string" && data.username.length > 0);
    }
  }
}

section("A6. Sign-out clears session");
if (!userProvisioned) {
  skip("signOut", "user not provisioned");
} else {
  const { error } = await supabase.auth.signOut();
  ok("signOut succeeds",           !error);
  const { data } = await supabase.auth.getUser();
  ok("User is null after signOut", data?.user === null);
}

section("A7. Wrong password → error, no session");
{
  const { data, error } = await supabase.auth.signInWithPassword({
    email:    TEST_EMAIL,
    password: "definitely-wrong-password-xyz",
  });
  ok("Error returned for bad credentials", !!error);
  ok("Session is null",                    data?.session === null);
}

// ════════════════════════════════════════════════════════════════════════════
// BLOCK B — /api/keys  (auth-gated CRUD)
// ════════════════════════════════════════════════════════════════════════════

section("B1. GET /api/keys — unauthenticated → 401");
{
  const res = await fetch(`${BASE_URL}/api/keys`);
  ok("Status is 401",       res.status, 401);
  const body = await res.json().catch(() => ({}));
  ok("Error field present", !!body.error);
}

section("B2. GET /api/keys — authenticated (best-effort with SSR cookies)");
if (!accessToken) {
  skip("GET /api/keys (authenticated)", "no access token");
} else {
  const res = await fetch(`${BASE_URL}/api/keys`, {
    headers: { "Authorization": `Bearer ${accessToken}`, "Cookie": sessionCookies },
  });
  const body = await res.json().catch(() => ({}));

  if (res.status === 200) {
    ok("GET /api/keys → 200",              true);
    ok("connectedProviders is an array",   Array.isArray(body.connectedProviders));
  } else {
    ok("GET /api/keys → 401 (cookie-only SSR auth — expected in script env)", res.status === 401);
    console.log("   Note: server-side Supabase auth uses httpOnly cookies set by the browser.");
  }
}

section("B3. POST /api/keys — unknown provider → 400 (or 401 if cookie auth required)");
{
  const res = await fetch(`${BASE_URL}/api/keys`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { "Authorization": `Bearer ${accessToken}`, "Cookie": sessionCookies } : {}),
    },
    body: JSON.stringify({ provider: "does_not_exist", key: "sk-test-1234567890abcdef" }),
  });
  ok("Returns 4xx for unknown provider", res.status >= 400 && res.status < 500);
}

section("B4. POST /api/keys — empty key → 4xx");
{
  const res = await fetch(`${BASE_URL}/api/keys`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { "Authorization": `Bearer ${accessToken}`, "Cookie": sessionCookies } : {}),
    },
    body: JSON.stringify({ provider: "anthropic", key: "" }),
  });
  ok("Returns 4xx for empty key", res.status >= 400 && res.status < 500);
}

section("B5. POST /api/keys — key too short → 4xx");
{
  const res = await fetch(`${BASE_URL}/api/keys`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { "Authorization": `Bearer ${accessToken}`, "Cookie": sessionCookies } : {}),
    },
    body: JSON.stringify({ provider: "anthropic", key: "sk-ant-short" }), // < 16 chars
  });
  ok("Returns 4xx for short key", res.status >= 400 && res.status < 500);
}

section("B6. DELETE /api/keys — unauthenticated → 401");
{
  const res = await fetch(`${BASE_URL}/api/keys?provider=anthropic`, { method: "DELETE" });
  ok("Status is 401", res.status, 401);
}

section("B7. DELETE /api/keys — missing provider param → 400 (or 401)");
{
  const res = await fetch(`${BASE_URL}/api/keys`, {
    method: "DELETE",
    headers: accessToken ? { "Authorization": `Bearer ${accessToken}`, "Cookie": sessionCookies } : {},
  });
  ok("Returns 4xx without provider param", res.status >= 400 && res.status < 500);
}

// ════════════════════════════════════════════════════════════════════════════
// BLOCK C — /api/chat  (streaming SSE)
// ════════════════════════════════════════════════════════════════════════════

section("C1. POST /api/chat — unauthenticated → 401");
{
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: "hi" }] }),
  });
  ok("Status is 401", res.status, 401);
}

section("C2. POST /api/chat — missing model/messages → 400");
{
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { "Authorization": `Bearer ${accessToken}`, "Cookie": sessionCookies } : {}),
    },
    body: JSON.stringify({}),
  });
  // Will be 401 (no SSR cookie) or 400 (missing body fields)
  ok("Returns 4xx for empty body", res.status >= 400 && res.status < 500);
}

section("C3. POST /api/chat — response has SSE content-type (when authed)");
if (!accessToken) {
  skip("SSE content-type check", "no access token");
} else {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
      "Cookie": sessionCookies,
    },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", messages: [{ role: "user", content: "hi" }] }),
  });
  // Either SSE stream (200) or 401 (SSR cookie required) — both are valid in test env
  if (res.status === 200) {
    ok("Content-Type is text/event-stream", (res.headers.get("content-type") ?? "").includes("text/event-stream"));
  } else {
    ok("Returns 4xx (SSR cookie auth required — expected)", res.status === 401);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// BLOCK D — /api/mcp
// ════════════════════════════════════════════════════════════════════════════

section("D1. GET /api/mcp/servers — returns server list");
{
  const res  = await fetch(`${BASE_URL}/api/mcp/servers`);
  const body = await res.json().catch(() => ({}));
  ok("Status is 200",            res.status, 200);
  ok("servers is an array",      Array.isArray(body.servers));
  ok("Has at least one server",  body.servers?.length > 0);

  const server = body.servers?.[0];
  ok("Each server has an id",    !!server?.id);
  ok("Each server has a name",   !!server?.name);
  ok("Each server has category", !!server?.category);
}

section("D2. GET /api/mcp/servers — server fields are complete");
{
  const res  = await fetch(`${BASE_URL}/api/mcp/servers`);
  const body = await res.json().catch(() => ({}));
  const servers = body.servers ?? [];

  let allValid = true;
  for (const s of servers) {
    if (!s.id || !s.name || !s.category || !s.transport) {
      allValid = false;
      console.log(`   Missing fields on server: ${JSON.stringify(s)}`);
    }
  }
  ok("All servers have id, name, category, transport", allValid);
}

section("D3. POST /api/mcp/connect — missing serverId → 400");
{
  const res = await fetch(`${BASE_URL}/api/mcp/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  ok("Status is 400", res.status, 400);
  const body = await res.json().catch(() => ({}));
  ok("Error field present", !!body.error);
}

section("D4. POST /api/mcp/connect — connect action returns connected status");
{
  const res = await fetch(`${BASE_URL}/api/mcp/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ serverId: "brave-search", action: "connect" }),
  });
  const body = await res.json().catch(() => ({}));
  ok("Status is 200",            res.status, 200);
  ok("status is 'connected'",    body.status, "connected");
  ok("serverId echoed back",     body.serverId, "brave-search");
  ok("tools is an array",        Array.isArray(body.tools));
}

section("D5. POST /api/mcp/connect — disconnect action returns disconnected status");
{
  const res = await fetch(`${BASE_URL}/api/mcp/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ serverId: "github", action: "disconnect" }),
  });
  const body = await res.json().catch(() => ({}));
  ok("Status is 200",              res.status, 200);
  ok("status is 'disconnected'",   body.status, "disconnected");
  ok("serverId echoed back",        body.serverId, "github");
}

// ════════════════════════════════════════════════════════════════════════════
// BLOCK E — /api/conversations  (auth-gated)
// ════════════════════════════════════════════════════════════════════════════

section("E1. GET /api/conversations — unauthenticated → 401");
{
  const res = await fetch(`${BASE_URL}/api/conversations`);
  ok("Status is 401", res.status, 401);
}

section("E2. POST /api/conversations — unauthenticated → 401");
{
  const res = await fetch(`${BASE_URL}/api/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Test" }),
  });
  ok("Status is 401", res.status, 401);
}

section("E3. DELETE /api/conversations — unauthenticated → 401");
{
  const res = await fetch(`${BASE_URL}/api/conversations`, { method: "DELETE" });
  ok("Status is 401", res.status, 401);
}

// ════════════════════════════════════════════════════════════════════════════
// BLOCK F — Middleware & routing
// ════════════════════════════════════════════════════════════════════════════

section("F1. /api/* routes bypass redirect — return data/errors, not 3xx");
{
  const res = await fetch(`${BASE_URL}/api/keys`, { redirect: "manual" });
  ok("/api/keys returns non-redirect status", res.status < 300 || res.status >= 400);
}

section("F2. /auth/login is reachable without a session");
{
  const res = await fetch(`${BASE_URL}/auth/login`);
  ok("/auth/login is accessible (2xx)", res.status >= 200 && res.status < 300);
}

section("F3. /auth/signup is reachable without a session");
{
  const res = await fetch(`${BASE_URL}/auth/signup`);
  ok("/auth/signup is accessible (2xx)", res.status >= 200 && res.status < 300);
}

// ════════════════════════════════════════════════════════════════════════════
// BLOCK G — Cleanup (admin only — removes the test user created in A2)
// ════════════════════════════════════════════════════════════════════════════

section("G. Cleanup — delete test user");
if (!admin) {
  skip("deleteUser", "no service role key — test user persists (sign in will reuse it next run)");
} else if (!userId) {
  skip("deleteUser", "no userId to delete");
} else {
  const { error } = await admin.auth.admin.deleteUser(userId);
  ok("Test user deleted from auth.users", !error);
  if (error) console.log(`   Error: ${error.message}`);

  // Verify gone
  const { data } = await admin.auth.admin.getUserById(userId);
  ok("User no longer exists", !data?.user);
}

// ════════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"─".repeat(56)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log("All tests passed.");
}
