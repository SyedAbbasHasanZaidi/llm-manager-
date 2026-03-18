import pg from "pg";
const { Client } = pg;

const client = new Client({
  connectionString: "postgresql://postgres:YRRR7A8hY10iIfrs@db.mjbbxzvywgjsazryhmje.supabase.co:5432/postgres",
  ssl: { rejectUnauthorized: false },
});

const SQL = `
-- 1. Trigger: auto-create a public.users row when someone signs up via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, username, password_hash, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    'supabase_auth_managed',
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Row Level Security on api_keys
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own API keys" ON public.api_keys;
CREATE POLICY "Users manage own API keys" ON public.api_keys
  FOR ALL USING (user_id = auth.uid());

-- 3. Unique constraint for upsert (user_id + provider)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'api_keys_user_provider_unique'
  ) THEN
    ALTER TABLE public.api_keys
      ADD CONSTRAINT api_keys_user_provider_unique UNIQUE (user_id, provider);
  END IF;
END $$;
`;

try {
  await client.connect();
  console.log("Connected to Supabase DB");
  await client.query(SQL);
  console.log("✓ Trigger created: on_auth_user_created");
  console.log("✓ RLS enabled on api_keys");
  console.log("✓ Unique constraint added (user_id, provider)");
  await client.end();
  console.log("\nMigration complete.");
} catch (err) {
  console.error("Migration failed:", err.message);
  await client.end().catch(() => {});
  process.exit(1);
}
