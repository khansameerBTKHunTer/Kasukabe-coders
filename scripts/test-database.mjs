import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const db = new PGlite();
try {
  // Isolated Postgres with minimal Supabase Auth/Storage shims; never connects remotely.
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
    CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects (id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array($1,'/') $$;
    GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role;
    GRANT INSERT ON storage.objects TO authenticated;
  `);
  const initial = (
    await readFile("supabase/migrations/20241030_initial_schema.sql", "utf8")
  ).replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', "");
  await db.exec(initial);
  await db.exec(await readFile("supabase/seed.sql", "utf8"));
  await db.exec(
    await readFile("supabase/migrations/20261031_roles_and_access.sql", "utf8"),
  );
  await db.exec(await readFile("supabase/tests/access.sql", "utf8"));
  console.log("Initial access policy regressions passed.");
  await db.exec(
    await readFile(
      "supabase/migrations/20261101_portal_integration.sql",
      "utf8",
    ),
  );
  await db.exec(await readFile("supabase/tests/portal.sql", "utf8"));
  console.log(
    "Portal database tests passed: safe registration, all departments, RPC restrictions, transitions, shared incidents, evidence, audit, closure.",
  );
} finally {
  await db.close();
}
