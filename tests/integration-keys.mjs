/**
 * Integration tests — API key add / remove flow
 * Requires: npm run dev running + SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * Usage: node tests/integration-keys.mjs
 *
 * Creates a real test user, signs in to get a proper SSR session cookie,
 * then exercises the full add → verify → remove cycle for each provider.
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { stringToBase64URL } from "@supabase/ssr/dist/main/utils/base64url.js";

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
      env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    }
  } catch {
    console.error("Could not read .env.local");
    process.exit(1);
  }
  return env;
}

const env         = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SRK  = env.SUPABASE_SERVICE_ROLE_KEY;
const BASE_URL      = "http://localhost:3000";

if (!SUPABASE_SRK) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is required in .env.local for this test suite.");
  process.exit(1);
}

const TEST_EMAIL    = "keys_integration_test@llm-manager-test.local";
const TEST_PASSWORD = "KeysTest1234!";
const TEST_USERNAME = "keys_tester";

// Fake keys that pass format validation for each provider
// (correct prefix + >= 16 chars — never sent to a real LLM API)
const FAKE_KEYS = {
  anthropic: "sk-ant-api03-fakekeyfakekeyfakekey1234567890abcdef",
  openai:    "sk-proj-fakekeyfakekeyfakekey1234567890abcdef",
  google:    "AIzaSyfakekeyfakekeyfakekey1234567890abcdef",
  mistral:   "fakekeyfakekeyfakekeyfakekey1234567890abcdef",
  cohere:    "fakekeyfakekeyfakekeyfakekey1234567890abcdef",
};

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

function section(title) {
  console.log(`\n── ${title} ──`);
}

// ── Build SSR session cookie ──────────────────────────────────────────────────
// Replicates exactly what @supabase/ssr writes to the browser:
//   sb-{projectRef}-auth-token = base64-{base64url(JSON.stringify(session))}
function buildSessionCookie(session) {
  const projectRef  = new URL(SUPABASE_URL).hostname.split(".")[0];
  const cookieName  = `sb-${projectRef}-auth-token`;
  const cookieValue = "base64-" + stringToBase64URL(JSON.stringify(session));
  return `${cookieName}=${cookieValue}`;
}

// Authenticated fetch — includes the SSR session cookie
function authFetch(path, cookie, init = {}) {
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      "Cookie": cookie,
    },
  });
}

// ── Clients ──────────────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
const admin    = createClient(SUPABASE_URL, SUPABASE_SRK, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ════════════════════════════════════════════════════════════════════════════
// SETUP — create test user + sign in to get SSR cookie
// ════════════════════════════════════════════════════════════════════════════

section("Setup — create test user via admin API");
let cookie = null;
let userId  = null;

{
  // Clean up any leftover from a previous failed run (auth.users + public.users)
  const { data: existing } = await admin.auth.admin.listUsers();
  const leftover = existing?.users?.find(u => u.email === TEST_EMAIL);
  if (leftover) await admin.auth.admin.deleteUser(leftover.id);
  // Also purge any orphaned public.users row (admin deleteUser doesn't cascade)
  await admin.from("users").delete().eq("email", TEST_EMAIL);

  const { data, error } = await admin.auth.admin.createUser({
    email:         TEST_EMAIL,
    password:      TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { username: TEST_USERNAME },
  });

  if (error) {
    console.error("  ✗  Failed to create test user:", error.message);
    process.exit(1);
  }

  userId = data.user.id;
  console.log(`  ✓  Test user created (${TEST_EMAIL})`);
}

section("Setup — sign in to get SSR session cookie");
{
  const { data, error } = await supabase.auth.signInWithPassword({
    email:    TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (error || !data.session) {
    console.error("  ✗  Sign-in failed:", error?.message);
    process.exit(1);
  }

  cookie = buildSessionCookie(data.session);
  console.log("  ✓  Signed in — SSR cookie constructed");
  // Note: do NOT call signOut() here — it revokes the token and breaks all subsequent requests
}

// ════════════════════════════════════════════════════════════════════════════
// BLOCK 1 — Initial state: no keys
// ════════════════════════════════════════════════════════════════════════════

section("1. Initial state — no keys connected");
{
  const res  = await authFetch("/api/keys", cookie);
  const body = await res.json();
  ok("GET /api/keys → 200",                     res.status, 200);
  ok("connectedProviders is empty array",        JSON.stringify(body.connectedProviders), "[]");
}

// ════════════════════════════════════════════════════════════════════════════
// BLOCK 2 — Add keys for each provider
// ════════════════════════════════════════════════════════════════════════════

section("2. Add API key — Anthropic");
{
  const res  = await authFetch("/api/keys", cookie, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ provider: "anthropic", key: FAKE_KEYS.anthropic }),
  });
  const body = await res.json();
  ok("POST /api/keys → 200",      res.status, 200);
  ok("valid: true",               body.valid,    true);
  ok("provider echoed back",      body.provider, "anthropic");
}

section("3. Add API key — OpenAI");
{
  const res  = await authFetch("/api/keys", cookie, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ provider: "openai", key: FAKE_KEYS.openai }),
  });
  const body = await res.json();
  ok("POST /api/keys → 200",      res.status, 200);
  ok("valid: true",               body.valid,    true);
  ok("provider echoed back",      body.provider, "openai");
}

section("4. Add API key — Google");
{
  const res  = await authFetch("/api/keys", cookie, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ provider: "google", key: FAKE_KEYS.google }),
  });
  const body = await res.json();
  ok("POST /api/keys → 200",      res.status, 200);
  ok("valid: true",               body.valid,    true);
  ok("provider echoed back",      body.provider, "google");
}

section("5. Add API key — Mistral");
{
  const res  = await authFetch("/api/keys", cookie, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ provider: "mistral", key: FAKE_KEYS.mistral }),
  });
  const body = await res.json();
  ok("POST /api/keys → 200",      res.status, 200);
  ok("valid: true",               body.valid,    true);
  ok("provider echoed back",      body.provider, "mistral");
}

section("6. Add API key — Cohere");
{
  const res  = await authFetch("/api/keys", cookie, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ provider: "cohere", key: FAKE_KEYS.cohere }),
  });
  const body = await res.json();
  ok("POST /api/keys → 200",      res.status, 200);
  ok("valid: true",               body.valid,    true);
  ok("provider echoed back",      body.provider, "cohere");
}

// ════════════════════════════════════════════════════════════════════════════
// BLOCK 3 — Verify all 5 providers now connected
// ════════════════════════════════════════════════════════════════════════════

section("7. Verify all 5 providers are now connected");
{
  const res  = await authFetch("/api/keys", cookie);
  const body = await res.json();
  ok("GET /api/keys → 200",                    res.status, 200);
  ok("connectedProviders has 5 entries",        body.connectedProviders?.length, 5);
  ok("anthropic is connected",                  body.connectedProviders?.includes("anthropic"));
  ok("openai is connected",                     body.connectedProviders?.includes("openai"));
  ok("google is connected",                     body.connectedProviders?.includes("google"));
  ok("mistral is connected",                    body.connectedProviders?.includes("mistral"));
  ok("cohere is connected",                     body.connectedProviders?.includes("cohere"));
}

// ════════════════════════════════════════════════════════════════════════════
// BLOCK 4 — Overwrite an existing key (upsert behaviour)
// ════════════════════════════════════════════════════════════════════════════

section("8. Overwrite existing Anthropic key (upsert — still only 5 providers)");
{
  const res  = await authFetch("/api/keys", cookie, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ provider: "anthropic", key: FAKE_KEYS.anthropic + "-v2" }),
  });
  const body = await res.json();
  ok("POST /api/keys → 200",  res.status, 200);
  ok("valid: true",           body.valid, true);

  const listRes  = await authFetch("/api/keys", cookie);
  const listBody = await listRes.json();
  ok("Still exactly 5 connected providers", listBody.connectedProviders?.length, 5);
}

// ════════════════════════════════════════════════════════════════════════════
// BLOCK 5 — Validation rejections
// ════════════════════════════════════════════════════════════════════════════

section("9. Reject — unknown provider");
{
  const res  = await authFetch("/api/keys", cookie, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ provider: "fakeprovider", key: "sk-ant-api03-fakekeyfakekeyfakekey" }),
  });
  const body = await res.json();
  ok("Status is 400",    res.status, 400);
  ok("valid: false",     body.valid, false);
}

section("10. Reject — wrong prefix for provider");
{
  const res  = await authFetch("/api/keys", cookie, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ provider: "anthropic", key: "sk-wrongprefix-1234567890abcdef" }),
  });
  const body = await res.json();
  ok("Status is 400",    res.status, 400);
  ok("valid: false",     body.valid, false);
  ok("Error mentions prefix", body.error?.includes("sk-ant-"));
}

section("11. Reject — key too short (< 16 chars)");
{
  const res  = await authFetch("/api/keys", cookie, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ provider: "anthropic", key: "sk-ant-short" }),
  });
  const body = await res.json();
  ok("Status is 400",    res.status, 400);
  ok("valid: false",     body.valid, false);
}

section("12. Reject — empty key");
{
  const res  = await authFetch("/api/keys", cookie, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ provider: "anthropic", key: "" }),
  });
  const body = await res.json();
  ok("Status is 400",    res.status, 400);
  ok("valid: false",     body.valid, false);
}

// ════════════════════════════════════════════════════════════════════════════
// BLOCK 6 — Remove keys one by one
// ════════════════════════════════════════════════════════════════════════════

section("13. Remove Anthropic key");
{
  const res  = await authFetch("/api/keys?provider=anthropic", cookie, { method: "DELETE" });
  const body = await res.json();
  ok("DELETE → 200",    res.status, 200);
  ok("ok: true",        body.ok, true);

  const listRes  = await authFetch("/api/keys", cookie);
  const listBody = await listRes.json();
  ok("Anthropic no longer listed",  !listBody.connectedProviders?.includes("anthropic"));
  ok("Other 4 still connected",      listBody.connectedProviders?.length, 4);
}

section("14. Remove OpenAI key");
{
  const res = await authFetch("/api/keys?provider=openai", cookie, { method: "DELETE" });
  ok("DELETE → 200", res.status, 200);

  const listBody = await (await authFetch("/api/keys", cookie)).json();
  ok("OpenAI no longer listed",  !listBody.connectedProviders?.includes("openai"));
  ok("3 providers remain",        listBody.connectedProviders?.length, 3);
}

section("15. Remove Google key");
{
  const res = await authFetch("/api/keys?provider=google", cookie, { method: "DELETE" });
  ok("DELETE → 200", res.status, 200);

  const listBody = await (await authFetch("/api/keys", cookie)).json();
  ok("Google no longer listed", !listBody.connectedProviders?.includes("google"));
  ok("2 providers remain",       listBody.connectedProviders?.length, 2);
}

section("16. Remove Mistral key");
{
  const res = await authFetch("/api/keys?provider=mistral", cookie, { method: "DELETE" });
  ok("DELETE → 200", res.status, 200);

  const listBody = await (await authFetch("/api/keys", cookie)).json();
  ok("Mistral no longer listed", !listBody.connectedProviders?.includes("mistral"));
  ok("1 provider remains",        listBody.connectedProviders?.length, 1);
}

section("17. Remove Cohere key");
{
  const res = await authFetch("/api/keys?provider=cohere", cookie, { method: "DELETE" });
  ok("DELETE → 200", res.status, 200);

  const listBody = await (await authFetch("/api/keys", cookie)).json();
  ok("Cohere no longer listed",      !listBody.connectedProviders?.includes("cohere"));
  ok("connectedProviders is empty",   listBody.connectedProviders?.length, 0);
}

section("18. Delete non-existent key — still returns 200 (idempotent)");
{
  const res  = await authFetch("/api/keys?provider=anthropic", cookie, { method: "DELETE" });
  const body = await res.json();
  ok("DELETE non-existent key → 200", res.status, 200);
  ok("ok: true",                       body.ok, true);
}

section("19. DELETE without provider param → 400");
{
  const res = await authFetch("/api/keys", cookie, { method: "DELETE" });
  ok("Status is 400", res.status, 400);
}

// ════════════════════════════════════════════════════════════════════════════
// BLOCK 7 — add → use (chat) → remove cycle  per provider
//
// The chat adapters are currently stubs so fake keys are enough:
//   • With key stored  → SSE stream returned (stub response)
//   • With key removed → 401 "No API key saved for provider"
// ════════════════════════════════════════════════════════════════════════════

// Helper: reads an SSE stream to completion and returns all parsed events
async function collectSSE(response) {
  const events = [];
  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep incomplete last line
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") continue;
      try { events.push(JSON.parse(data)); } catch { /* ignore */ }
    }
  }
  return events;
}

// Test matrix: one representative model per provider
const CHAT_CASES = [
  { provider: "anthropic", model: "claude-haiku-4-5-20251001", key: FAKE_KEYS.anthropic },
  { provider: "openai",    model: "gpt-4o-mini",              key: FAKE_KEYS.openai    },
  { provider: "google",    model: "gemini-2.0-flash",         key: FAKE_KEYS.google    },
  { provider: "mistral",   model: "mistral-small-latest",     key: FAKE_KEYS.mistral   },
];

for (const { provider, model, key } of CHAT_CASES) {
  section(`20-${provider}: add key → chat → remove → chat blocked`);

  // ── 1. Add key ──────────────────────────────────────────────────────────
  {
    const res  = await authFetch("/api/keys", cookie, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ provider, key }),
    });
    ok(`[${provider}] key added (200)`, res.status, 200);
  }

  // ── 2. Chat with key present → SSE stream ───────────────────────────────
  {
    const res = await authFetch("/api/chat", cookie, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        model,
        messages: [{ role: "user", content: "say hi" }],
      }),
    });

    ok(`[${provider}] chat with key → 200`,              res.status, 200);
    ok(`[${provider}] content-type is text/event-stream`,
      (res.headers.get("content-type") ?? "").includes("text/event-stream"));

    const events = await collectSSE(res);
    const textEvents = events.filter(e => e.type === "text_delta");
    const doneEvent  = events.find(e  => e.type === "message_done");

    ok(`[${provider}] received text_delta events`,  textEvents.length > 0);
    ok(`[${provider}] received message_done event`, !!doneEvent);
    ok(`[${provider}] message_done has tokenCount`, typeof doneEvent?.payload?.tokenCount === "number");
    ok(`[${provider}] message_done has cost`,       typeof doneEvent?.payload?.cost       === "number");
  }

  // ── 3. Remove key ───────────────────────────────────────────────────────
  {
    const res  = await authFetch(`/api/keys?provider=${provider}`, cookie, { method: "DELETE" });
    ok(`[${provider}] key removed (200)`, res.status, 200);
  }

  // ── 4. Chat with key gone → 401 ─────────────────────────────────────────
  {
    const res = await authFetch("/api/chat", cookie, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        model,
        messages: [{ role: "user", content: "say hi" }],
      }),
    });
    ok(`[${provider}] chat without key → 401`, res.status, 401);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// CLEANUP — delete test user
// ════════════════════════════════════════════════════════════════════════════

section("Cleanup — delete test user");
{
  await supabase.auth.signOut();
  // Delete public.users row first (no cascade FK), then auth.users
  await admin.from("users").delete().eq("id", userId);
  const { error } = await admin.auth.admin.deleteUser(userId);
  ok("Test user deleted", !error);
  if (error) console.log(`   Error: ${error.message}`);
}

// ════════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"─".repeat(56)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log("All tests passed.");
