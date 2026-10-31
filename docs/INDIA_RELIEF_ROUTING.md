# India relief routing and work verification

The application now creates pending department assignments automatically for clear routine reports. It combines the configured Gemini/OpenRouter vision assessment with mandatory capability rules and a fixed department directory. AI output never grants account access or marks evidence verified.

## Apply the database update

The project owner chose to run the SQL in Supabase. No hosted schema changes have been applied by the agent.

1. In Supabase, open the correct project and **SQL Editor → New query**.
2. Apply any missing earlier migrations, in order: `20241030_initial_schema.sql`, `20261031_roles_and_access.sql`, then `20261101_portal_integration.sql`. Do not rerun migrations already applied.
3. Open `supabase/migrations/20261102_india_relief_routing.sql` locally. Copy the **entire SQL contents**, including `BEGIN;` and `COMMIT;`, into the editor and run them. Then run the contents of `supabase/migrations/20261103_urgent_professional_auto_routing.sql`. Pasting either filename is not valid SQL. The updates are transactional: errors roll back the update.
4. Run this read-only check:

```sql
select code, name, responder_role, activation_mode, self_registration
from public.departments
order by code;
```

The supplied directory contains 11 departments. Existing department IDs and their linked profiles, reports and assignments are retained. Existing closed incidents stay closed. Completed work on incidents still open moves into the work-verification queue. Existing unassigned reports are not automatically dispatched retroactively.

Restart the local server after updating the database. The backend checks for the new schema before operational writes; it will give a setup error if the migration is missing. Demo mode uses the same directory and workflow in its temporary repository without connecting to Supabase.

## Department directory

| Code | Display name | Routing |
| --- | --- | --- |
| FIRE_RESCUE | Fire & Emergency Services | Routine professional response |
| ELECTRICITY | Electricity Distribution Utility (DISCOM) | Routine professional response |
| MUNICIPAL | Municipal / Panchayat & Public Works | Drainage, debris, roads and civil repairs |
| MEDICAL | Health Department & Emergency Medical Services | Medical response |
| CONTROL_ROOM | District Emergency Operations Centre (DEOC) | Coordination; never assigned as a response team |
| SDRF | State Disaster Response Force (SDRF) | Admin activation |
| NDRF | National Disaster Response Force (NDRF) | Admin activation |
| POLICE | Police & Traffic Control | Traffic, perimeter and evacuation coordination |
| CIVIL_DEFENCE | Civil Defence & Home Guards | Safe staging and relief support |
| NGO_RELIEF | NGO / Humanitarian Relief Partners | Safe shelter, food, hygiene and supplies |
| COMMUNITY_VOLUNTEERS | Community Volunteers / Aapda Mitra | Safe-zone community relief |

These are application categories. Adding a row does not enroll an actual agency, verify affiliation, contact emergency services or obtain an operational deployment. Government specialist accounts are provisioned by an existing administrator with `set_profile_access`; NDRF, SDRF, police and DEOC cannot be selected in public registration. Other self-registration options retain the existing self-declared-account behavior. Every responder, including the shared `relief_responder` role, can access only incidents assigned to its exact department.

The category names follow the Indian disaster-response context: [NDRF](https://ndrf.gov.in/en/about-us.html), [MHA disaster-management programmes and Aapda Mitra](https://www.ndmindia.mha.gov.in/ndmi/programs), and [the official Home Guards role](https://www.dgfscdhg.gov.in/node/327125). NGO and volunteer categories represent relief partners configured by the project owner.

## Automatic routing and exceptions

Clear incidents with a confident AI assessment are assigned automatically. If vision fails or confidence is low, explicit citizen observations provide a conservative routing fallback: building fire → Fire & Emergency Services and Medical; electrical hazards → DISCOM; road blockage → Municipal / Public Works; medical emergencies → Medical. These professional teams receive pending assignments even while `routing_decision.mode='needs_review'`. Admin review and dispatch are independent: AI uncertainty, unknown optional team names, specialist activation or a missing secondary department must not prevent an available mandatory professional team from receiving its incident. Evidence is never marked verified by routing. Public/news reports and likely duplicates still await routing review; volunteers and restricted specialist forces are not dispatched through this fallback.

Category rules always include the relevant professional team and required secondary teams. Recognized AI suggestions supplement those rules; unknown names cause review. Legacy names such as “Fire & Rescue” remain supported as aliases. Volunteers, NGOs and Civil Defence support are excluded from automatic hazardous rescue, electrical isolation, fire suppression and unsafe water operations. Unsafe support suggestions enter the admin queue so the coordinator can establish a safe staging area.

The report, incident, all automatic assignments and audit events are written in one server-only database transaction. Automatic assignments have `assignment_source='automatic'`, `assigned_by=NULL`, and start as `pending`; they are not acknowledgements. Manual assignments retain the authenticated administrator's ID. The stored `routing_decision` records the policy version, selected/suggested codes and reasons. Reporters cannot supply their own AI assessment, assignment list or trusted actor ID to the API.

For a Supabase project that already ran the original routing migration, run `20261103_urgent_professional_auto_routing.sql` once in the SQL Editor. New projects should run both `20261102_india_relief_routing.sql` and then `20261103_urgent_professional_auto_routing.sql` in filename order.

Then run `20261104_department_report_delivery.sql`. It enables professional assignments while evidence/routing review remains pending and recovers older unassigned first-hand fire reports. The recovery leaves closed, flagged/rejected, manually assigned, declined and likely duplicate incidents unchanged. Run the SQL **contents**, not the filename. This migration is tested locally; it has not been applied to your hosted project by Codex.

In **Review queue → Needs admin routing**, choose the required teams, enter routing notes, then click **Complete routing review**. Rejection by any team creates another routing exception. Existing manual dispatch and priority controls remain available.

## Work verification

1. Assigned responders acknowledge, travel, record observations/photos and update their own assignment.
2. **Resolve assignment** requires completion notes of at least 10 characters. It submits work for verification; it does not authorize closure.
3. In **Review queue → Work awaiting verification**, an admin reviews the observations, available field photos and completion notes. **Verify work** or **Request further work** both require review notes.
4. Further work returns the assignment to `in_progress`. A later completion needs a fresh review; previous reviews remain in the audit log.
5. The incident becomes `pending_verification` when active teams report completion, then `resolved` after their work is verified. Closure also requires any routing exception to have been resolved. Rejected tasks remain visible as history; a coordinator must confirm the replacement/remaining team selection.

## Demo accounts and verification

Start with `npm run dev:demo`, open `/demo-login`, and use the shared four-digit password `1234`. Existing citizen/admin/fire/power/municipal/medical demo emails still work. Added accounts are `sdrf@civiscope.demo`, `ndrf@civiscope.demo`, `police@civiscope.demo`, `civil@civiscope.demo`, `ngo@civiscope.demo` and `volunteer@civiscope.demo`. These accounts do not exist in Supabase Auth unless separately created there.

Run `npm run test:routing` for policy and repository tests, `npm run test:database` for actual isolated Postgres/RLS/RPC tests, and the browser suite against a demo server. Browser tests disable both vision keys; mocked vision tests cover the provider contract without paid requests. Hosted Supabase behavior must be checked after the owner applies the migration.
