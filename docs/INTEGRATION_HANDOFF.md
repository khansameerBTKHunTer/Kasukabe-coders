# CIVISCOPE integration and verification

## Implemented locally

Real email/password authentication uses the existing public Supabase configuration. Login, citizen/rescue registration, confirmation-required signup, sign-out, session restoration, recovery callback, and password update are implemented. Protected portal navigation and every operational API load the verified account profile. Missing profiles, permission failures, unknown roles, and recovery sessions have separate states; no demo/citizen fallback is assigned to real users.

The latest request authorized missing local backend work. No migrations, project settings, real registrations, emails, deployments, or remote database changes were performed by the agent.

Two explicit operating modes are available:

- **Real mode (default):** Supabase Auth, profiles, database records, and private Storage. Missing configuration or schema returns an actionable error. There is no in-memory fallback.
- **Isolated demo:** `CIVISCOPE_DEMO_MODE=true`. Signed HttpOnly demo cookies select fictional seeded accounts; these sessions cannot authenticate to Supabase. Only the demo repository and temporary local photo files are used. As requested in the interface update, real vision calls are now enabled after photo selection even in demo mode. They use the configured Google Gemini or OpenRouter key; uploaded images are sent to that provider. No Supabase data is accessed by demo accounts. Data and sessions can reset when the server restarts; this is a single-process local demonstration, not a production database or identity provider.

## Run locally

```bash
npm install
npm run dev:demo
```

Open the actual Local URL printed in the terminal, then `/demo-login`. All fictional accounts use `CiviscopeDemo!2026`:

| Portal | Email |
| --- | --- |
| Citizen | citizen@civiscope.demo |
| Fire | fire@civiscope.demo |
| Electricity | power@civiscope.demo |
| Municipal | municipal@civiscope.demo |
| Medical | medical@civiscope.demo |
| Control Room demo | admin@civiscope.demo |
| SDRF / NDRF | sdrf@civiscope.demo / ndrf@civiscope.demo |
| Police | police@civiscope.demo |
| Civil Defence / Home Guards | civil@civiscope.demo |
| NGO relief | ngo@civiscope.demo |
| Community volunteers | volunteer@civiscope.demo |

For real accounts, stop the server, configure `.env.local`, leave `CIVISCOPE_DEMO_MODE=false`, and run `npm run dev`. Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the server-only `SUPABASE_SERVICE_ROLE_KEY`. Keep the service key out of all `NEXT_PUBLIC_*` variables. Vision configuration is optional: without it reports are saved for human triage and no AI assessment is invented. Google AI Studio uses `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, and `GEMINI_MODEL=gemini-3.5-flash-lite`. OpenRouter remains an alternative with its own provider/key settings.

Production commands are `npm run build` and `npm start`. Demo mode is opt-in even with a production build. Do not expose the fictional demo as a real disaster-reporting service.

## Remote setup still required — backend/project owner

1. Back up and review in staging. Apply the **contents** of unapplied migrations in this order (do not paste filenames into SQL Editor):
   - `supabase/migrations/20241030_initial_schema.sql`
   - `supabase/migrations/20261031_roles_and_access.sql`
   - `supabase/migrations/20261101_portal_integration.sql`
   - `supabase/migrations/20261102_india_relief_routing.sql`
2. Do not rerun already applied migrations. The legacy `seed.sql` is incompatible with real Auth identities and is deliberately blocked after hardening. Demo mode seeds its own isolated memory repository and does not need SQL seed data.
3. Resolve legacy profile IDs/email conflicts using the instructions in `supabase/ACCESS_REVIEW.md`. Confirm that profile IDs match actual Auth user IDs, then validate `profiles_auth_user_fkey` before real deployment. Existing staff created under the older approval-based migration remain unchanged; only new registrations use the immediate citizen/rescue provisioning below.
4. The final migration replaces the signup trigger with validated citizen/rescue provisioning, adds `organization_name`, extends assignment statuses, creates atomic server-only mutation RPCs, and provisions a private `incident-evidence` Storage bucket. It also removes direct client operational writes, including column-level report insert grants. Do not apply only the first migration and treat its original permissive policies as production-ready.
5. Bootstrap a pre-authorized Control Room account through a trusted administrator SQL session, using its verified Auth user ID (see access guide). Public registration never offers or grants admin. New rescue accounts are **self-declared**, not verified organizations. There is no ordinary admin approval gate; an official-looking email is not identity verification.
6. In Supabase Auth redirect configuration, allow the actual application origins and `/auth/callback` (including `?flow=recovery`). For local use, match the port printed by the server. The frontend builds redirects from its current origin, never an arbitrary `next` URL. PKCE links must be opened in the originating browser. Email confirmation follows project settings; the app does not change those settings or claim a session when none exists.
7. Confirm SMTP/email delivery, production origin, private Storage grants, Auth refresh behavior, and the service key configuration. The service role is used only on the server after verified identity and role checks; normal incident/profile reads use the session client and RLS. Do not enable Auth anonymous sign-ins for this flow without reviewing their permissions.
8. Perform the real-account checklist below with authorized test accounts. Automated mocks and the PostgreSQL shims cannot prove the deployed Supabase configuration works.

## Contracts and permissions

Registration calls `supabase.auth.signUp` with email/password and non-administrative metadata: `display_name`, `account_type` (`citizen` or `rescue`), `department_code`, and `organization_name`. The database trigger validates these fields, maps the department code to an existing ID and role, and creates one profile with `id = auth.users.id`. No client profile insert/upsert or privileged browser workaround is used. UI choices are not used for portal authorization; the loaded database profile is authoritative.

| Department code | Profile role | Existing seeded department ID |
| --- | --- | --- |
| FIRE_RESCUE | fire_rescue | 11111111-1111-1111-1111-111111111111 |
| ELECTRICITY | electricity | 22222222-2222-2222-2222-222222222222 |
| MUNICIPAL | municipal | 33333333-3333-3333-3333-333333333333 |
| MEDICAL | medical | 44444444-4444-4444-4444-444444444444 |

The registration selector loads actual IDs from `GET /api/departments`; it does not assume the seed IDs when submitting a choice. Unit name is stored in `organization_name` and `display_name`; the department selection identifies the capability.

- `GET /api/auth/profile` → `{profile,demo}`. Requires a verified session and matching Auth ID. Missing profile → 404 `PROFILE_MISSING`; denied/unsupported access → 403; configuration/database failure → 503. No endpoint creates a profile based on a claimed browser role.
- `POST /api/uploads` accepts multipart `file`, validates MIME, JPEG/PNG/WebP signature, and an 8 MB limit, and returns `{success,imagePath,previewUrl,storage}`. Real objects are private, namespaced by Auth ID, and have short-lived signed preview URLs. The report is not submitted merely because upload succeeds. Uploads may remain unlinked if the report is abandoned; schedule a retention/cleanup policy before production.
- Existing `POST /api/incidents` retains its JSON field names and success shape. Server identity overrides any supplied `reporterId`. Only evidence uploaded by the authenticated account is accepted. Incident/report/audit creation is atomic via `civiscope_submit_report`. AI failure does not erase the report. Duplicate details are withheld from citizens; an empty `duplicateCandidates` response does not claim that no nearby incidents exist. Control Room computes review candidates from actual authorized incidents using the existing detector.
- `GET /api/reports` returns the current account's reports plus linked incident status/update time. Citizens never need to fetch all operational incidents and filter them in the browser.
- `GET /api/incidents` and incident detail return authorized staff records. Responders are restricted by actual department assignments on the server and by database RLS. Arbitrary `departmentId` filters cannot grant access. Control Room can view all incidents.
- Assignment PATCH retains `action: acknowledge` or `action: update_status`. Supported statuses now include `en_route` and `on_site`. Allowed transitions: pending → acknowledged/rejected; acknowledged → en_route/on_site/in_progress/rejected; en_route → on_site/in_progress/rejected; on_site → in_progress/resolved/rejected; in_progress → in_progress/resolved/rejected. Rejection requires at least five characters in `notes`. Completed assignments cannot be changed through responder actions. Server time maintains acknowledgement/completion timestamps.
- `POST /api/assignments/:id/evidence` takes `{imagePath,description}` and stores an actual field report linked to the assigned incident, with an audit event. Existing assignment `notes` support observations. Audit actors come from the session, not the payload.
- Admin assignment supports multiple departments through the existing assignment endpoint; each response must be acknowledged before another is considered saved. Active duplicate department assignments are idempotent. One department resolving never resolves an incident with unfinished assignments.
- Incident PATCH adds `action: close`; an approved admin can close only after response work is verified and any routing review is completed. See [the India relief update](INDIA_RELIEF_ROUTING.md) for the current routing and verification contracts. Verification, priority override with explanation, duplicate review, and PDF export are retained. Priority, severity, verification, department assignment status, and overall incident status remain distinct.
- `civiscope_command` and `civiscope_submit_report` can be executed only by `service_role`; they also check actor role/department and apply writes/audit changes atomically. The server derives that actor from verified Auth. Clients cannot forge an actor parameter to these RPCs.
- Navigation opens Google Maps at the incident coordinates. It does not know disaster road closures.

## Validation and remaining integration limits

Commands:

```bash
npm run typecheck
npm run lint
npm run test:engine
npm run test:api
npm run test:database
npm run test:routing
node --import tsx scripts/verify-workflows-inproc.ts
npm run build
```

Browser tests require a separate local server in isolated demo mode. Against its printed port:

```bash
AI_PROVIDER=gemini GEMINI_API_KEY= OPENROUTER_API_KEY= CIVISCOPE_DEMO_MODE=true npm start -- -p 3099
# Another terminal, after installing the browser if needed:
npx playwright install chromium --only-shell
TEST_BASE_URL=http://localhost:3099 npm run test:browser
```

Browser authentication tests intercept Supabase HTTP responses (including correct/incorrect login, signup with/without confirmation, profiles, and password recovery). They exercise the real SDK and frontend state machine without real accounts or email. Demo browser/API tests exercise actual local uploads, ownership, authorization, and report persistence in the demo repository. Database tests use PGlite with minimal Auth/Storage shims and an equivalent UUID generator. These are not deployment certification. Real Supabase Auth, SMTP, bucket behavior, RLS on your project, device GPS, microphone support, and the selected vision provider require authorized integration checks. The later interface update includes a successful native Gemini image check; details are in `docs/INTERFACE_UPDATE.md`.

Verified on the completed local change: TypeScript, ESLint (no warnings), engine/PDF regressions, API security tests, isolated database tests, all 10 in-process workflow checks, production build, and startup HTTP 200 passed. All **28 browser tests passed**. `npm audit` reported **0 vulnerabilities**. A scan of the browser build confirmed that the configured service-role key was absent. No real Supabase account or email-delivery test was performed. See `docs/INTERFACE_UPDATE.md` for the latest UI/vision changes and the real-provider credential check.

## Main changed files

- `src/context/auth-context.tsx`, `src/lib/auth/*`, `src/components/auth/AuthForm.tsx`, and the login/register/forgot/reset/callback/demo pages: account flows, state, and routing.
- `src/lib/backend.ts`, `src/lib/uploads.ts`, `src/lib/supabase/admin.ts`, and `src/app/api/*`: verified server access, real/demo repositories, ownership, uploads, and operational actions.
- `src/components/citizen/*`, `src/components/map/*`, `src/components/dashboard/*`, and `src/components/incident/*`: reporting, GPS/manual selection, voice input, map behavior, response operations, and Control Room.
- `supabase/migrations/20261101_portal_integration.sql`, `supabase/tests/portal.sql`, and `scripts/test-database.mjs`: local schema/storage/RPC additions and isolated database regressions.
- `tests/{auth,demo-login,dashboard,reporting,response}.spec.ts`, `scripts/test-api.ts`, `scripts/test-sitrep.ts`, and `scripts/verify-workflows-inproc.ts`: browser, security, PDF, and workflow coverage.
- `package.json`, `package-lock.json`, and `eslint.config.mjs`: installed checks, development-only test tools, and working scripts. `.env.example` and README explain the operating modes. The original authentication change left `.env.local` untouched; the later interface update moved the user-supplied Google AI Studio key to `GEMINI_API_KEY` and selected the native Gemini provider/model without changing Supabase credentials.

## Manual account checklist

- **Citizen:** register, follow confirmation if enabled, sign in, refresh, upload a real photo, confirm GPS/manual incident coordinates, submit, track only that account's report and status, sign out. A second citizen must not see the first citizen's reports/photos.
- **Each rescue department:** register with its actual capability, confirm if required, verify the matching portal. Assign an incident from an existing admin account; accept/reject with reason, progress through en-route/on-site/in-progress, add evidence/observations, resolve. Verify other departments' queues/actions remain inaccessible. GPS refusal must retain a usable manual form.
- **Control Room:** use only an already authorized admin. Verify filters, real AI output or manual-review state, duplicate confirmation/keep-separate, multiple departments, activity, independent resolutions, PDF, and closure only after completion. Attempting to register `role=admin` metadata must never grant admin.
- **Recovery:** request a reset for an existing and nonexistent email; acknowledgements should be generic. Test valid, expired, reused, and different-browser links. Refresh the new-password page, update the password, and verify the old password fails.
- **Failure handling:** test missing profile, denied profile, interrupted upload, failed report submission, failed tile requests, and mobile widths. Keep typed values on failure. No dashboard should flash during session restoration.
