# Auth identity and access review

The final application integration is documented in [the integration handoff](../docs/INTEGRATION_HANDOFF.md). The historical `20261031_roles_and_access.sql` migration introduced approval-based access. Apply `20261101_portal_integration.sql` afterward for the current requirements: immediate self-declared citizen/rescue registration, protected server mutations, extended assignment states, and private evidence storage. Public registration never creates admins. These local migrations have not been applied remotely by the agent.

## Existing identities

Before rollout, inspect legacy profiles through a trusted database-owner connection:

```sql
select p.id, p.email, p.role, u.id as matching_auth_id
from public.profiles p
left join auth.users u on u.id = p.id;

select p.id as legacy_id, u.id as auth_id, p.email
from public.profiles p
join auth.users u on lower(u.email) = lower(p.email)
where p.id <> u.id;
```

Verify identities manually; email similarity is not authority to grant access. Reconcile confirmed profiles and all referencing `reporter_id`, `assigned_by`, and `actor_id` values in a reviewed transaction. The original hardening backfill aborts on conflicting emails rather than merging accounts silently. No migration here deletes/remaps old profiles automatically.

The Auth foreign key is initially `NOT VALID` to preserve legacy data while protecting new inserts. After resolving every orphan profile and its references, complete enforcement:

```sql
alter table public.profiles validate constraint profiles_auth_user_fkey;
```

## Bootstrap one authorized administrator

Create/sign in the authorized account through normal Auth first. In a trusted SQL session, replace the placeholder with its verified Auth user ID:

```sql
update public.profiles
set role = 'admin',
    department_id = (select id from public.departments where code = 'CONTROL_ROOM'),
    approval_status = 'approved'
where id = 'REPLACE_WITH_VERIFIED_AUTH_USER_UUID'
  and exists (select 1 from auth.users where id = public.profiles.id);
```

The placeholder is intentionally not executable. Never grant admin from user-controlled signup metadata. Existing staff accounts created before the final integration migration may require their previously reviewed role/department/status to be reconciled by this administrator through `set_profile_access`; new ordinary accounts do not have an approval workflow.

## References

- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Auth-linked profiles](https://supabase.com/docs/guides/auth/managing-user-data)
- [Column privileges](https://supabase.com/docs/guides/database/postgres/column-level-security)
