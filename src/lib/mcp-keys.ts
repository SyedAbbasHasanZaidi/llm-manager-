import { createClient } from "@/lib/supabase/server";

function getPassphrase(): string {
  const s = process.env.ENCRYPTION_SECRET;
  if (!s) throw new Error("ENCRYPTION_SECRET env var is not set");
  return s;
}

/** Decrypt an MCP server credential server-side */
export async function getDecryptedMCPKey(
  serverId: string,
  userId: string,
  keyLabel: string = "default",
): Promise<string | null> {
  const supabase   = await createClient();
  const passphrase = getPassphrase();

  const { data, error } = await supabase
    .from("mcp_server_keys")
    .select("encrypted_key")
    .eq("server_id", serverId)
    .eq("user_id", userId)
    .eq("key_label", keyLabel)
    .single();

  if (error || !data) return null;

  try {
    const { data: decrypted, error: decryptError } = await supabase.rpc("decrypt_mcp_key", {
      _encrypted:  data.encrypted_key,
      _passphrase: passphrase,
    });
    if (decryptError || !decrypted) return null;
    return decrypted as string;
  } catch {
    return null;
  }
}

/** Store an encrypted MCP server credential */
export async function saveMCPKey(
  serverId: string,
  userId: string,
  keyLabel: string,
  keyValue: string,
): Promise<boolean> {
  const supabase   = await createClient();
  const passphrase = getPassphrase();

  const { error } = await supabase.rpc("insert_mcp_key", {
    _server_id:  serverId,
    _user_id:    userId,
    _label:      keyLabel,
    _key:        keyValue,
    _passphrase: passphrase,
  });

  return !error;
}

/** Delete an MCP server credential */
export async function deleteMCPKey(
  serverId: string,
  userId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("mcp_server_keys")
    .delete()
    .eq("server_id", serverId)
    .eq("user_id", userId);

  return !error;
}
