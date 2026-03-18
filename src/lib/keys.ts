import { createClient } from "@/lib/supabase/server";

// Maps app provider name → DB enum value
const APP_TO_DB: Record<string, string> = { google: "google_ai" };
export function toDbProvider(p: string): string { return APP_TO_DB[p] ?? p; }

function getPassphrase(): string {
  const s = process.env.ENCRYPTION_SECRET;
  if (!s) throw new Error("ENCRYPTION_SECRET env var is not set");
  return s;
}

// Fetches and decrypts a user's API key for the given provider server-side.
// Uses the DB's built-in decrypt_api_key RPC function.
export async function getDecryptedKey(userId: string, provider: string): Promise<string | null> {
  const supabase   = await createClient();
  const passphrase = getPassphrase();
  const dbProvider = toDbProvider(provider);

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, encrypted_key")
    .eq("user_id", userId)
    .eq("provider", dbProvider)
    .single();

  if (error || !data) return null;

  try {
    const { data: decrypted, error: decryptError } = await supabase.rpc("decrypt_api_key", {
      _encrypted:  data.encrypted_key,
      _passphrase: passphrase,
    });

    if (decryptError || !decrypted) return null;

    // Update last_used timestamp (fire-and-forget)
    supabase
      .from("api_keys")
      .update({ last_used: new Date().toISOString() })
      .eq("id", data.id)
      .then(() => {/* ignore */});

    return decrypted as string;
  } catch {
    return null;
  }
}
