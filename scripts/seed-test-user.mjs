#!/usr/bin/env node
/**
 * Creates a test user via Supabase Admin API (bypasses rate limits and email confirmation).
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local.
 *
 * Usage:  node scripts/seed-test-user.mjs
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// ── Load .env.local ──────────────────────────────────────────────────────────
const envPath = resolve(process.cwd(), ".env.local");
const envFile = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envFile.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const [key, ...rest] = trimmed.split("=");
  env[key.trim()] = rest.join("=").trim();
}

const SUPABASE_URL       = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY   = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const TEST_EMAIL    = "test@llm-manager.local";
const TEST_PASSWORD = "TestPass123!";
const TEST_USERNAME = "testuser";

const headers = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
  "apikey": SERVICE_ROLE_KEY,
};

// ── Step 1: Delete existing test user if present ─────────────────────────────
console.log("Checking for existing test user...");

const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50`, { headers });
const { users } = await listRes.json();
const existing = users?.find(u => u.email === TEST_EMAIL);

if (existing) {
  console.log(`Found existing user ${existing.id}, deleting...`);
  const delRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${existing.id}`, {
    method: "DELETE",
    headers,
  });
  if (!delRes.ok) {
    console.error("Failed to delete:", await delRes.text());
    process.exit(1);
  }
  // Also clean up public.users if the cascade didn't fire
  // (uses the anon key + service role to hit the DB)
  console.log("Cleaned up auth user.");
}

// ── Step 2: Create fresh test user via Admin API ─────────────────────────────
console.log("Creating test user...");

const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    email:            TEST_EMAIL,
    password:         TEST_PASSWORD,
    email_confirm:    true,
    user_metadata:    { username: TEST_USERNAME },
  }),
});

if (!createRes.ok) {
  const err = await createRes.text();
  console.error("Failed to create user:", err);
  process.exit(1);
}

const newUser = await createRes.json();
console.log(`\nTest user created successfully!`);
console.log(`  ID:       ${newUser.id}`);
console.log(`  Email:    ${TEST_EMAIL}`);
console.log(`  Password: ${TEST_PASSWORD}`);
console.log(`  Username: ${TEST_USERNAME}`);
console.log(`\nYou can now log in at http://localhost:3000/auth/login`);
