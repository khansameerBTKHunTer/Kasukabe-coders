# API and integration verification

The app has 21 API route files exposing 26 HTTP methods. `npm run test:api`
discovers these automatically and checks authentication, cross-site mutation
protection, malformed JSON, null/array/empty bodies, authenticated reads, missing
records and safe geocoding failures. The browser API inventory also calls every
method through the running production server and checks unsupported methods and
unknown routes. These are boundary checks; successful workflows have separate tests.

| API path | Methods | Successful workflow coverage |
| --- | --- | --- |
| `/api/health` | GET | HTTP inventory / managed server readiness |
| `/api/departments` | GET | Inventory / role and department dashboards |
| `/api/demo/session` | GET, POST, DELETE | Demo login, persistence, incorrect password, sign-out |
| `/api/auth/profile` | GET | Role portal loading and missing/denied profiles |
| `/api/incidents` | GET, POST | Citizen submission, department delivery, filters and own-report tracking |
| `/api/incidents/[id]` | GET, PATCH | Detail, verification, priority updates, closure restrictions |
| `/api/incidents/[id]/assign` | POST | Multiple department assignments and independent responses |
| `/api/incidents/[id]/routing` | POST | Routing review and specialist exceptions |
| `/api/incidents/duplicate` | POST | Merge/separation decisions, repeated confirmation and backend/database regressions |
| `/api/assignments/[id]` | PATCH | Acknowledge, progress, rejection reason, resolution, verification and rework |
| `/api/assignments/[id]/evidence` | POST | Assigned responder field evidence and ownership |
| `/api/uploads` | POST | Multipart demo / direct private-storage upload negotiation |
| `/api/uploads/complete` | POST | Storage validation, preview, owner/type/size/signature restrictions |
| `/api/uploads/[id]` | GET | Private demo photo previews and access restrictions |
| `/api/ai/analyze` | GET, POST | Configuration, editable suggestions, unavailable provider, Gemini/OpenRouter contracts |
| `/api/geocode` | POST | Reverse address lookup and coordinate validation |
| `/api/geocode/search` | POST | Address matching, invalid provider coordinates, provider failure, cache/rate spacing |
| `/api/reports` | GET | Citizen ownership and status tracking |
| `/api/reports/sitrep` | GET | PDF export, content and ordering |
| `/api/statistics` | GET | Live KPIs and priority changes |
| `/api/seed/reset` | POST | Admin-only reset of isolated fictional demo data |

## Live backend checks and remaining setup

`npm run check:connections` makes read-only requests using `.env.local` without
printing credentials or records. In this verification, Supabase Auth settings
and departments, profiles, incidents, reports and assignments endpoints all
returned HTTP 200. This proves connectivity and table availability, not that
every authenticated user's permissions or every migration is installed.
The configured Gemini credential/model metadata endpoint also returned HTTP 200.

`npm run check:deploy -- --remote` still fails the hosted readiness check: the
current readiness/report-delivery migration state cannot be confirmed. Run only
unapplied migrations, in order, through
`supabase/migrations/20261105_deployment_readiness.sql` in Supabase SQL Editor.
The production application URL and geocoding provider URL also need configuring;
the geocoding user-agent/contact setting is missing. See [DEPLOYMENT.md](DEPLOYMENT.md).

Hosted data was not modified. End-to-end browser workflows use the actual local
API server with fictional demo persistence. Real sign-up/recovery tests stub the
Auth provider; vision and geocoding provider responses are mocked for repeatable
success/failure cases. No paid live AI inference was performed. Database tests
apply the migrations and access policies to an isolated PGlite database, rather
than the hosted project. A final authenticated hosted smoke test is still needed
after the missing configuration/migrations are supplied.

Local verification completed: `npm run check` passed, the production build passed,
all 44 browser tests passed, and the API inventory passed 112 assertions across
all 26 methods. The read-only connection script also checks the configured AI
provider's credential/model metadata without generating an assessment.

## Priority map semantics

Critical uses a large red diamond with `!!`; High uses an orange rounded square
with `!`; Medium uses a yellow circle; Low uses a green double-bordered circle.
Each marker displays the score and a persistent priority label. Selected markers
receive a strong outline. Keyboard Enter/Space opens the incident, and accessible
names announce the priority, title and score. Tests cover all four bands, live
priority updates, selection and invalid-coordinate fallback.
Tile-failure tests use mocked tile responses and check that the warning remains
visible after failed tiles finish, then clears when a later tile batch succeeds.
Live tile availability depends on the browser network and was not certified.

## Repeat the checks

```sh
npm run check
npm run build
PLAYWRIGHT_BROWSERS_PATH=/tmp/damage-mapper-playwright npm run test:browser:local
npm run check:connections
npm run check:deploy -- --remote
```

Use your installed Playwright browser path, or omit `PLAYWRIGHT_BROWSERS_PATH`
when browsers are installed at the default location. The managed browser command
starts and stops its own demo server on port 3099.
