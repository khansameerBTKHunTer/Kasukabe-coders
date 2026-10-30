# Access migration review and rollout

`migrations/20261031_roles_and_access.sql` is a local proposal. It has not been applied to the connected Supabase project. The application still uses demo profiles and an in-memory repository; it does not yet authenticate requests or persist operational data to Supabase. Do not describe the current demo APIs as secured by these database policies.

## Proposed access rules

| Account | Access |
| --- | --- |
| Signed out (`anon`) | No access to the six application tables |
| Citizen | Own profile and reports; submit an unverified report as themselves |
| Pending/rejected responder | Own profile and previously submitted reports; no department operations |
| Approved Fire, Electricity, Municipal, Medical responder | Own department's assignments and the incidents/reports/logs linked to those assignments; update assignment status and notes |
| Approved admin | Review profiles, grant/revoke access through `set_profile_access`, manage incidents and assignments, review/update reports |
| Trusted backend | Process new reports into incidents, maintain assignment timestamps, write audit events |

`approval_status` belongs to a profile's staff access request. It does not approve an entire department organization. Staff roles must match the referenced department code. Operational access is based on actual assignments, including secondary department assignments, rather than category, role name alone, or a client-provided department filter. Citizens track their own report records; the operational incident table is not exposed to citizens.

Only `display_name` can be updated directly on a profile. An approved admin uses this RPC to grant or revoke another user's staff access:

```ts
await supabase.rpc('set_profile_access', {
  target_id: verifiedAuthUserId,
  new_role: 'municipal', // fire_rescue, electricity, medical, admin, citizen
  new_department_id: municipalDepartmentId, // null for citizen
  new_approval_status: 'approved', // pending or rejected also supported
});
```

The RPC uses the authenticated caller; it ignores signup metadata and refuses self-access changes. There is no public signup path to an admin/staff role. New Auth users receive an approved citizen profile whose ID is their Auth user ID. A trusted backend or approved admin must assign a pending staff role before review. Approval is a database operation; an approval UI is not included here.

Clients cannot set assignment identity, department, incident, assigner, or timestamps through UPDATE. Only status and notes are writable, with department RLS checks. Clients cannot insert audit events. The backend must maintain transition timestamps and audit history transactionally. Admins must delete/recreate assignments for reassignment or implement a separately reviewed administrative RPC.

## Backend owner rollout

1. Back up the database and inspect the migration in a staging project. The migration replaces every policy on the six app tables and resets their client grants. Review any custom policies or integrations first.
2. For a new project, apply all migrations in filename order. The initial migration alone retains the old permissive policies. `seed.sql` is a legacy, fictional fixture for disposable environments, before hardening; it deliberately refuses to run afterward.
3. In an existing project, review legacy profiles before applying the new migration:

   ```sql
   select p.id, p.email, p.role, u.id as matching_auth_id
   from public.profiles p
   left join auth.users u on u.id = p.id;

   select p.id as legacy_id, u.id as auth_id, p.email
   from public.profiles p
   join auth.users u on lower(u.email) = lower(p.email)
   where p.id <> u.id;
   ```

   Verify each identity manually. Email similarity is not authority to grant access. Reconcile confirmed legacy identities and all referencing `reporter_id`, `assigned_by`, and `actor_id` values in a reviewed transaction. Backfill aborts on duplicate emails rather than silently merging profiles. This proposal never deletes/remaps existing records automatically.
4. Apply `20261031_roles_and_access.sql` in staging. Existing staff start **pending**. Existing citizens are approved. Provisioning backfills existing Auth users as citizens. Resolve email conflicts first if the migration rolls back.
5. Bootstrap one verified admin through the SQL Editor or a trusted administrator connection. Replace the placeholder UUID with the real ID from Auth > Users:

   ```sql
   update public.profiles
   set role = 'admin',
       department_id = (select id from public.departments where code = 'CONTROL_ROOM'),
       approval_status = 'approved'
   where id = 'REPLACE_WITH_VERIFIED_AUTH_USER_UUID'
     and exists (select 1 from auth.users where id = public.profiles.id);
   ```

   The placeholder is intentionally not executable. Never grant admin based on user-controlled signup metadata. The backend owner can approve other verified staff using the RPC afterward.
6. Reconcile or archive orphan demo profiles and references. The Auth foreign key is initially `NOT VALID` to preserve legacy data, while enforcing every new profile's ID. After resolving **all** old rows, complete enforcement:

   ```sql
   alter table public.profiles validate constraint profiles_auth_user_fkey;
   ```

   Validation must pass before rollout with real reports. No random profile ID default remains.
7. Run the transaction-based regression fixture against isolated staging, as the database owner:

   ```bash
   psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/access.sql
   ```

   Tests create fictional Auth users and application records and roll everything back. Coverage includes signup metadata, Auth links, anonymous denial, self-promotion/self-approval, report spoofing, department isolation, status updates, pending access, admin approval, and Municipal/Medical access. Local verification used an isolated PostgreSQL engine (PGlite) with a minimal Auth schema and a built-in UUID replacement for `uuid-ossp`; staging verification must cover real Supabase Auth, grants, and existing integrations.
8. Before real deployment, connect the frontend and API routes to verified Supabase sessions and the persistent repository. Derive actor IDs from the verified session, never request bodies. Ordinary user queries must use the session-scoped client so RLS applies. Reserve the service-role key for reviewed trusted operations; it bypasses RLS. Test report processing, photo storage policies, timestamps, and audit writes separately. The current in-memory API and demo role selector remain demonstration features.

## References

- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Auth-linked profiles and signup triggers](https://supabase.com/docs/guides/auth/managing-user-data)
- [Column privileges](https://supabase.com/docs/guides/database/postgres/column-level-security)
