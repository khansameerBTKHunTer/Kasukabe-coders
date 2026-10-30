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
  await db.exec(`INSERT INTO public.incidents (id,title,category,latitude,longitude,severity,priority_band,status)
    VALUES ('95000000-0000-4000-8000-000000000001','Legacy completed','fire',0,0,'low','Low','resolved'),
    ('95000000-0000-4000-8000-000000000002','Legacy closed','fire',0,0,'low','Low','closed');
    INSERT INTO public.assignments (incident_id,department_id,assignment_status) SELECT id,'11111111-1111-1111-1111-111111111111','resolved'
    FROM public.incidents WHERE id::text LIKE '95000000%';`);
  await db.exec(await readFile("supabase/migrations/20261102_india_relief_routing.sql", "utf8"));
  await db.exec(`DO $$ BEGIN
    ASSERT (SELECT status='pending_verification' FROM public.incidents WHERE id='95000000-0000-4000-8000-000000000001'), 'Legacy completed work enters verification';
    ASSERT (SELECT completion_verification='pending_review' FROM public.assignments WHERE incident_id='95000000-0000-4000-8000-000000000001'), 'Legacy completion needs review';
    ASSERT (SELECT status='closed' AND routing_decision IS NULL FROM public.incidents WHERE id='95000000-0000-4000-8000-000000000002'), 'Closed history is preserved';
    END $$;
    DELETE FROM public.assignments WHERE incident_id::text LIKE '95000000%';
    DELETE FROM public.incidents WHERE id::text LIKE '95000000%';`);
  await db.exec(await readFile("supabase/tests/relief-routing.sql", "utf8"));
  console.log("India relief routing database tests passed: automatic assignments, restricted activation, scoped access, admin verification and rework.");
} catch (error) {
  console.error("Database regression failed:", error.message, "\nContext:", error.where ?? "");
  process.exitCode = 1;
} finally {
  await db.close();
}
