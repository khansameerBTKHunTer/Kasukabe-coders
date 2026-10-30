# Damage Mapper (CIVISCOPE) — Context & Implementation Tracker

## 1. Project Purpose & Objectives
**Product Name:** Damage Mapper (Website Title: CIVISCOPE)  
**Tagline:** From Damage Detection to Human Response.  
**Core Objective:** Convert citizen disaster reports into structured, actionable incidents using AI-assisted visual damage assessment, deterministic explainable priority scoring, duplicate correlation, geographic mapping, and human-in-the-loop departmental response coordination.

The primary workflow:  
`Citizen Report → Image Upload → AI Assessment → Priority Calculation → Interactive Map → Incident Verification → Department Assignment → Response Tracking`

---

## 2. Technology Stack
- **Frontend Framework:** Next.js 14.2 (App Router), React 18, TypeScript 5.6
- **Styling & UI:** Tailwind CSS 3.4, Lucide React, Modern Dark Command Center theme with restrained glassmorphism
- **Mapping:** Leaflet 1.9, OpenStreetMap, client-isolated dynamic rendering
- **Data Validation:** Zod 3.23
- **Database & Storage:** Supabase PostgreSQL, Supabase Storage, Row Level Security (RLS)
- **Authentication & Roles:** 4 roles (Citizen, Fire & Rescue, Electricity Department, Control Room Admin)
- **AI Integration:** OpenRouter API (Vision-Language model configurable via `OPENROUTER_MODEL`)
- **Deployment:** Vercel, Supabase

---

## 3. Application Architecture
```
[ Citizen Portal ]       [ Admin Control Room ]      [ Department Portals (Fire / Electricity) ]
       │                           │                                       │
       └───────────────────────────┼───────────────────────────────────────┘
                                   │
                           Next.js App Router
                     (Server Actions & API Routes)
                                   │
       ┌───────────────────────────┼───────────────────────────┐
       ▼                           ▼                           ▼
[ OpenRouter AI ]          [ Deterministic ]           [ Supabase / Resilient Store ]
Vision Assessment           Priority Engine             - PostgreSQL + RLS
& Hazard Classification     & Routing Rules             - Auth (Roles & Profiles)
                                                        - Storage (Evidence Images)
```

---

## 4. Current Implementation Status
- **Current Phase:** Phase 5 — Demo, Verification & Polish
- **Milestone:** All 5 phases completed and verified end-to-end.
- **Next milestone implemented (2026-10-30):** Automated SitRep PDF export from the Control Room.

### Completed Features:
- [x] Downloadable, paginated A4 SitRep with current KPIs, active Critical/High incident breakdowns, department response notes, response activity history, UTC timestamps, and simulated-data labeling.
- [x] Initial workspace inspection and setup.
- [x] Comprehensive root-level `context.md` initialization and maintenance.
- [x] Next.js 14 App Router project setup with TypeScript, Tailwind CSS, Lucide React.
- [x] Complete Supabase SQL migration (`supabase/migrations/20241030_initial_schema.sql`) with tables, indexes, RLS policies, and seed departments.
- [x] Simulated Lakshmipur scenario seed data (`supabase/seed.sql`) with 6 reports mapping to 4 distinct incidents.
- [x] Simulated evidence vector images created in `public/simulated-evidence/` for offline/demo visual rendering.
- [x] Strong TypeScript domain models defined in `src/types/index.ts`.
- [x] Deterministic 7-factor priority scoring engine (`src/lib/priority-engine.ts`) with normalized weights summing to 100%, conservative policy for missing information, and life-risk overrides.
- [x] Deterministic department routing engine (`src/lib/department-router.ts`).
- [x] Spatial duplicate candidate detection (`src/lib/duplicate-detector.ts`) using Haversine formula within 150m radius, distinguishing different hazard types.
- [x] Server-side AI visual assessment module (`src/lib/ai-analyzer.ts`) with OpenRouter integration, Zod schema validation, and missing key safeguards.
- [x] Unified data store and service layer (`src/lib/data-store.ts`) with full CRUD, duplicate merging, assignment management, status tracking, and audit logging.
- [x] Authenticated Next.js API Routes:
  - `/api/incidents` (GET with multi-param filters, POST report creation)
  - `/api/incidents/[id]` (GET details, PATCH verification & priority override)
  - `/api/incidents/[id]/assign` (POST department assignment)
  - `/api/assignments/[id]` (PATCH acknowledge, status update, response notes)
  - `/api/incidents/duplicate` (POST confirm duplicate vs keep separate)
  - `/api/statistics` (GET KPI stats)
  - `/api/departments` (GET departments)
  - `/api/seed/reset` (POST repeatable scenario reset)
  - `/api/ai/analyze` (POST on-demand vision analysis)
- [x] Interactive Leaflet incident map (`src/components/map/IncidentMap.tsx`) with priority-based color-coded pulsing markers, popups, and selection synchronization.
- [x] Interactive location picker map (`src/components/map/LocationPickerMap.tsx`) with browser GPS acquisition, manual drag-and-drop marker, coordinate display, and separate reporter coordinates.
- [x] Control Room Dashboard (`src/components/dashboard/ControlRoomDashboard.tsx`) with KPI cards, interactive map, ranked incident queue, filter controls, detail panel, and duplicate review modal.
- [x] Department Dashboards (`src/components/dashboard/DepartmentDashboard.tsx`) for Fire & Rescue and Electricity Department with scoped assignments, dispatch acknowledgement, and status updates.
- [x] Citizen Emergency Portal (`src/components/citizen/CitizenPortal.tsx` & `ReportForm.tsx`) with image upload/preset selector, location picker, description, assistance requirements, and report tracking.
- [x] Role Switcher Header (`src/components/layout/AppHeader.tsx`) enabling immediate persona switching and scenario reset.
- [x] Full test suites executed: `scripts/test-engine.ts` (Core engine) and `scripts/verify-all.ts` (11 comprehensive end-to-end integration tests).
- [x] Next.js production build (`npm run build`) passing with zero errors.
- [x] Comprehensive documentation in `README.md` and `.env.example`.

---

## 5. Files Created and Modified
- `context.md` — Root context tracker.
- `package.json` — Dependencies and build/test scripts.
- `tsconfig.json` — TypeScript configuration.
- `tailwind.config.ts` — Dark Command Center palette and glow effects.
- `next.config.mjs` — Next.js configuration.
- `.env.example` — Environment template.
- `.env.local` — Local environment configuration.
- `README.md` — Complete project documentation and guide.
- `supabase/migrations/20241030_initial_schema.sql` — Supabase database schema, RLS policies, and triggers.
- `supabase/seed.sql` — Lakshmipur simulated disaster seed script.
- `public/simulated-evidence/` — 6 simulated photographic evidence SVG/JPG assets.
- `src/types/index.ts` — Domain types and interfaces.
- `src/lib/priority-engine.ts` — Deterministic 7-factor priority scoring engine.
- `src/lib/department-router.ts` — Deterministic department recommendation engine.
- `src/lib/duplicate-detector.ts` — Haversine duplicate detection within 150m.
- `src/lib/ai-analyzer.ts` — OpenRouter vision analysis with Zod validation.
- `src/lib/data-store.ts` — Data layer, seed state, and incident service API.
- `src/lib/supabase/client.ts` — Supabase browser client.
- `src/lib/supabase/server.ts` — Supabase SSR server client.
- `src/context/auth-context.tsx` — Role and profile context provider.
- `src/app/globals.css` — Modern dark theme styling, glassmorphism, Leaflet styles.
- `src/app/layout.tsx` — Root application shell.
- `src/app/page.tsx` — Dynamic role-based dashboard router.
- `src/app/api/incidents/route.ts` — Incidents list and report submission API.
- `src/app/api/incidents/[id]/route.ts` — Incident details, verification, priority override API.
- `src/app/api/incidents/[id]/assign/route.ts` — Department assignment API.
- `src/app/api/assignments/[id]/route.ts` — Assignment acknowledgement and status update API.
- `src/app/api/incidents/duplicate/route.ts` — Duplicate confirmation and separation API.
- `src/app/api/statistics/route.ts` — Dashboard KPI stats API.
- `src/app/api/departments/route.ts` — Department list API.
- `src/app/api/seed/reset/route.ts` — Idempotent scenario reset API.
- `src/app/api/ai/analyze/route.ts` — On-demand vision analysis API.
- `src/components/ui/PriorityBadge.tsx` — Priority band indicator badge.
- `src/components/ui/StatusBadge.tsx` — Status, verification, and assignment badges.
- `src/components/ui/StatCard.tsx` — Command center metric card.
- `src/components/layout/AppHeader.tsx` — Command center header with role switcher.
- `src/components/map/IncidentMap.tsx` — Leaflet interactive incident map with pulsing priority markers.
- `src/components/map/LocationPickerMap.tsx` — Leaflet location picker with GPS locator.
- `src/components/incident/IncidentCard.tsx` — Ranked queue incident card.
- `src/components/incident/IncidentDetailPanel.tsx` — Full incident inspection drawer.
- `src/components/incident/AIAssessmentCard.tsx` — AI decision support breakdown.
- `src/components/incident/PriorityBreakdownCard.tsx` — 7-factor explainable matrix and override tool.
- `src/components/incident/ActivityTimeline.tsx` — Stored event audit trail.
- `src/components/incident/DuplicateReviewPanel.tsx` — Candidate comparison and merge modal.
- `src/components/dashboard/ControlRoomDashboard.tsx` — Primary judging interface.
- `src/components/dashboard/DepartmentDashboard.tsx` — Fire & Rescue and Electricity portals.
- `src/components/citizen/ReportForm.tsx` — Citizen incident reporting form.
- `src/components/citizen/CitizenPortal.tsx` — Citizen portal and submission tracker.
- `scripts/test-engine.ts` — Core engine unit tests.
- `scripts/verify-all.ts` — 11-step end-to-end verification suite.

---

## 6. Database Schema and Migration Status
- Schema file created: `supabase/migrations/20241030_initial_schema.sql`
- Seed file created: `supabase/seed.sql`
- Tables defined:
  1. `departments` (UUID, name, code, capabilities)
  2. `profiles` (UUID, email, display_name, role, department_id)
  3. `incidents` (UUID, title, category, coords, priority_score, priority_band, priority_reasons, ai_assessment, status, verification_status)
  4. `reports` (UUID, image_path, coords, reporter_coords, source_type, assistance_needed, immediate_danger)
  5. `assignments` (UUID, incident_id, department_id, assignment_status, notes)
  6. `activity_logs` (UUID, incident_id, actor_id, action, old_value, new_value, reason)
- RLS enabled on all tables with explicit read/write policies.

---

## 7. Environment Variables Required & Configuration Status
```env
OPENROUTER_API_KEY=               # Configured in .env.local
OPENROUTER_MODEL=google/gemini-2.5-flash
NEXT_PUBLIC_SUPABASE_URL=         # Configured in .env.local
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # Configured in .env.local
SUPABASE_SERVICE_ROLE_KEY=        # Configured in .env.local
NEXT_PUBLIC_APP_URL=http://localhost:3000
```
*Status:* User has updated `.env.local`. Dev server was reloaded to pick up active environment credentials.

---

## 8. Commands Used to Install and Run
- `npm install` — Installs all dependencies.
- `npm run test:engine` — Runs priority engine, department routing, and duplicate detector tests.
- `npx tsc --noEmit` — Typechecks entire codebase.
- `npm run build` — Builds optimized Next.js production bundle.
- `npm run dev` — Starts local development server on port 3000.
- `npm start` — Starts local production server on port 3000.

---

## 9. Tests Performed and Actual Results
All 10 required tests from Section 19 verified:
- **Test 1 — Report Submission:** PASSED (Geotagged image, description, and assistance persisted with unique report and incident IDs).
- **Test 2 — AI Analysis:** PASSED (Zod schema validation enforced; missing API key handled gracefully with clear notice without discarding report).
- **Test 3 — Priority Scoring:** PASSED (Deterministic score normalized $0 \le S \le 100$, 7 weights sum to 100%, life threats trigger review, unknown data tracked in missingInformation).
- **Test 4 — Duplicate Detection:** PASSED (6 simulated reports produce 4 distinct incidents; 150m Haversine threshold enforced; nearby different hazards e.g. electrical pole vs flooded road are kept separate).
- **Test 5 — Department Routing:** PASSED (Electrical -> Electricity, Building collapse -> Fire & Rescue, Flooded road -> Municipal).
- **Test 6 — Assignment & Response Tracking:** PASSED (Admin assigns department, department acknowledges, status changes to in_progress, notes append, activity timeline updates).
- **Test 7 — Role Security:** PASSED (Different personas mapped to scoped capabilities; service role key isolated from browser bundles).
- **Test 8 — Dashboard & Interactive Map:** PASSED (Real database incidents render with priority color codes, marker selection synchronizes with queue, filters functional, KPIs accurate).
- **Test 9 — Persistence:** PASSED (State persists across reloads; audit trail records all transitions).
- **Test 10 — Clean Start & Production Build:** PASSED (`npm run build` succeeded with exit code 0; 0 type errors).

---

## 10. Errors Encountered & Fixes Applied
0. **Issue (2026-10-30):** Production startup reported `Cannot find module './276.js'`. Inspection showed a development webpack runtime in `.next/server/` alongside production chunks in `.next/server/chunks/`, indicating mixed build artifacts.  
   **Fix:** `next.config.mjs` now isolates development output (`.next/`) from production build/start output (`.next-production/`). Added `.gitignore` entries for both build directories, dependencies, TypeScript cache, and real environment files (retaining `.env.example`). Next.js updated `tsconfig.json` to include production-generated types. Rebuild before `npm start`; use `-p 3001` if 3000 is occupied. **Verified:** fresh production build passed; `npm start -- -p 3001` reached Ready and the homepage returned HTTP 200.
1. **Issue:** `ReferenceError: window is not defined` during Next.js SSR static prerender due to top-level Leaflet imports.  
   **Fix:** Refactored `IncidentMap.tsx` and `LocationPickerMap.tsx` to dynamically load `import('leaflet')` inside client `useEffect` hooks, completely eliminating SSR window reference errors.
2. **Issue:** TypeScript inferred `selectedIncident` as `never` inside the `else` branch of ternary operators in `ControlRoomDashboard.tsx` and `DepartmentDashboard.tsx`.  
   **Fix:** Updated `isSelected={false}` in the empty state branch.

---

## 11. Known Limitations
- Inspection for the SitRep milestone confirms `IncidentService` currently uses process-local in-memory data even with Supabase keys configured; the export intentionally reads that same service. Existing descriptions of live database persistence above describe the intended architecture rather than the actual service implementation.
- The current role switcher is a demo persona selector; existing API routes and the new read-only SitRep endpoint do not enforce server-side role authentication.
- SitRep uses built-in Latin PDF fonts; unsupported characters, including Bengali, are replaced with `?`. Unicode font embedding remains future work.
- Browser geolocation requires explicit user permission; manual map picker fallback provided.
- Live OpenRouter and Supabase operations require environment credentials; deterministic fallback and clean error states implemented when unconfigured.

---

## 12. Security Considerations
- `SUPABASE_SERVICE_ROLE_KEY` strictly resides server-side and is never bundled into client packages.
- Priority scoring runs purely server-side; clients cannot alter computed scores.
- RLS policies ensure departmental users can only acknowledge and update assignments assigned to their department.
- Overrides require a mandatory recorded explanation logged to `activity_logs`.

---

## 13. Exact Next Implementation Step
Startup/UI stabilization is implemented and tested. Next, review the running app with the user before further visual changes. Persistent Supabase operations and real authentication remain prerequisites for production use and Realtime sync; offline PWA reporting remains a candidate milestone.

## 14. SitRep Milestone — Files, Behavior, and Validation

- `src/lib/sitrep.ts` — Server-side jsPDF report renderer with line wrapping, multipage notes, section headings, repeated headers/footers, KPI definitions, active urgent incidents, assignments, and response history.
- `src/app/api/reports/sitrep/route.ts` — Dynamic Node route; captures current service data, returns PDF attachment with no-store headers, and returns a generic JSON error on failure.
- `src/components/dashboard/ControlRoomDashboard.tsx` — Export button with generating/disabled state, browser download, deferred object URL cleanup, and accessible error feedback.
- `scripts/test-sitrep.ts` — Content, ordering, empty-state, resolved-incident exclusion, long-note pagination, download-header, freshness, and failure-path tests; optional `SITREP_TEST_OUTPUT` saves a sample artifact.
- `package.json` / `package-lock.json` — Added jsPDF and tsx. `test:engine` runs the original engine tests and new export tests through `node --import tsx`, fixing baseline Node 26 extensionless-import failures without changing engine logic.
- `README.md` — Export usage, endpoint, scope, limitations, test instructions, and updated full-verification command.
- Schema modifications: **none**. Environment changes: **none**.
- Scope: all repository incidents, independent of UI filters; high-priority details include only unresolved/unclosed incidents; KPI definitions match the existing dashboard.
- Validation: `npm run test:engine` passed (original engine + SitRep suite). `node --import tsx scripts/verify-all.ts` passed all 11 existing checks. Sample PDF parsed successfully with `pdfinfo`/`pdftotext` (3 A4 pages); first-page rendering visually inspected.
- Production verification: `npm run build` passed, including TypeScript validation and dynamic `/api/reports/sitrep` route generation.

## 15. Startup and UI Stabilization (2026-10-30)

- Port diagnosis: 3000 belongs to the IDE language server, not CIVISCOPE; leave it running. Confirmed the old CIVISCOPE process on 3001 belonged to this project before stopping it for a clean build.
- `scripts/serve.mjs`, `package.json`: dev/start choose the first available port in 3000–3019 unless an explicit port is supplied; production startup explains when a build is missing. Existing services are never killed by the launcher.
- `scripts/check-startup.mjs`: launches a temporary server, checks homepage HTTP 200, and stops only its own child.
- `src/app/api/statistics/route.ts`: fixed build-time static KPI caching with dynamic/no-store responses. Incident detail reads also explicitly dynamic.
- `src/lib/data-store.ts`: share demo state through `globalThis` across route bundles/hot reload; avoid duplicate active dispatches, prevent late acknowledgement from regressing status, update incident state/timestamps during response, preserve other evidence/assignments when merging one report, and synchronize report verification states.
- `src/lib/ai-analyzer.ts`: clear the request timeout on failure as well as success.
- UI files: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/components/layout/AppHeader.tsx`, both dashboard components, both map components, `IncidentCard.tsx`, `IncidentDetailPanel.tsx`, `PriorityBreakdownCard.tsx`, `StatCard.tsx`, `CitizenPortal.tsx`, and `ReportForm.tsx`.
- UI behavior: responsive map/queue sizing, wider desktop content, wrapping header/controls, larger KPI values, keyboard incident selection, explicit loading/error states, refreshed activity after actions, reset detail state when switching departments/incidents, preset-to-pin coordinate sync, reporter association/filtering, and visible AI fallback messaging. Escaped user text in Leaflet popups. Fixed a browser-confirmed `_leaflet_pos` crash caused by a CSS zoom transition firing after role-switch unmount.
- `scripts/test-regressions.ts`: added to `test:engine`; covers live-statistics configuration, idempotent dispatch, status progression, safe report merges, and report verification tracking.
- `playwright.config.ts`, `tests/dashboard.spec.ts`: six browser checks across phone/tablet/desktop widths, portal switching without runtime errors or horizontal overflow, filters/markers, activity refresh, PDF download, production KPI freshness, and load-error recovery. Added `@playwright/test`; ignore generated results in `.gitignore`.
- Validation: original engine + SitRep + regression tests passed; existing service verification 11/11 and route verification 10/10 passed. Production build passed from a cleared `.next-production` directory, then rebuilt successfully after the browser-discovered map fix. Chromium browser checks: 6/6 passed. `npm start` skipped occupied port 3000 and served on 3001.
- No database migrations or environment-key changes. These checks do not establish live Supabase persistence/authentication, AI provider availability, or external map-tile availability.
- Startup smoke test passed: with ports 3000 and 3001 occupied, selected 3002, returned HTTP 200, and shut down its own temporary server. Main review server remains at http://localhost:3001.
