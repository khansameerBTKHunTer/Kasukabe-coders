# CIVISCOPE — Damage Mapper
### AI-Powered Disaster Damage Assessment & Multi-Agency Response Coordination

> **Tagline:** *From Damage Detection to Human Response.*

Damage Mapper (CIVISCOPE) is an AI-assisted disaster management platform that converts citizen field reports into structured incidents, calculates deterministic explainable priority scores, detects and correlates duplicate reports, and orchestrates response operations across emergency departments (Fire & Rescue, Electricity Department, Municipal/Road Services, and Medical Response).

---

## 1. System Architecture & Core Workflow

```
[ Citizen Report ] ──► [ Geotagged Image Upload ] ──► [ OpenRouter Vision Assessment ]
                                                               │
                                                               ▼
[ Activity Audit Log ] ◄── [ Control Room Verification ] ◄── [ 7-Factor Priority Engine ]
         │                              │
         ▼                              ▼
[ Status Tracking ]    [ Multi-Agency Assignment ] ──► [ Field Responder Ack & Updates ]
```

### Core Innovations:
1. **Explainable Deterministic Priority Scoring:** AI vision provides provisional observations; priority is strictly computed via a deterministic 7-factor mathematical formula (totaling 100% normalized weight).
2. **Duplicate Incident Correlation:** Automatic candidate matching within a 150m spatial radius using the Haversine formula, comparing hazard categories and textual keywords, with human confirmation (Confirm Duplicate vs Keep Separate).
3. **Multi-Agency Department Routing:** Deterministic capability matching ensuring specialized hazards (e.g. fallen 11kV conductors in water) route to appropriate agencies (Electricity Department + Municipal Dewatering).
4. **Command Center Dark UI:** Restrained glassmorphic interface built with Next.js 15 App Router, Tailwind CSS, Lucide icons, and interactive Leaflet map integration.

---

## 2. Technology Stack

- **Frontend:** Next.js 15 (App Router), TypeScript, Tailwind CSS, Lucide React
- **Mapping:** Leaflet, OpenStreetMap, Client-isolated dynamic rendering
- **Backend:** Next.js Server Actions & API Routes, Zod schema validation
- **Database & Storage:** Supabase PostgreSQL, Supabase Auth, Row Level Security (RLS)
- **AI Integration:** OpenRouter API (configurable vision model via `OPENROUTER_MODEL`)
- **Deployment:** Vercel, Supabase

---

## 3. User Roles & Demo Profiles

The demo supports six operational roles. Switch between them instantly via the role selector pill in the header:

| Role | Demo User Profile | Responsibilities |
|---|---|---|
| **Control Room Admin** | `admin@civiscope.demo` (Command Chief Rahman) | Full command map, ranked queue, duplicate review, department assignment, priority overrides, incident verification. |
| **Fire & Rescue** | `fire@civiscope.demo` (Captain Hossain) | Structural collapses, fire suppression, water rescue, assignment acknowledgment, response notes, incident resolution. |
| **Electricity Dept** | `power@civiscope.demo` (Engr. Tariq) | High voltage line isolation, substation safety, transformer hazards, assignment acknowledgement, field status updates. |
| **Municipal / Road Services** | `municipal@civiscope.demo` | Department incident queue and response updates. |
| **Medical Response** | `medical@civiscope.demo` | Department incident queue and response updates. |
| **Citizen** | `citizen@civiscope.demo` (Resident) | Submit geotagged field reports, upload disaster photos, track submission verification status. |

---

## 4. Environment Configuration

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

### Required Variables:
```env
# OpenRouter AI Configuration (Image-capable vision model)
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_MODEL=google/gemini-2.5-flash

# Supabase Database & Auth (Optional for demo mode; required for live cloud DB)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# App Base URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> **Note on Offline / Resilient Operation:** If `OPENROUTER_API_KEY` is not provided, reports are safely saved for manual control room triage with an explicit missing configuration notice. If Supabase is not configured, the platform runs on a persistent in-memory repository pre-seeded with the Lakshmipur disaster scenario.

---

## 5. Supabase Database Setup & Migrations

Supabase configuration currently enables connection checks; the app still runs on demo profiles and an in-memory repository. Real login and persistence require backend integration.

For the proposed role, approval, Auth-linking, and RLS changes, follow [the backend access review and rollout guide](supabase/ACCESS_REVIEW.md). Apply migrations in filename order in staging and review legacy profile IDs before rollout. The new migration has not been applied to the connected project. `seed.sql` is only a disposable demo fixture before access hardening.

---

## 6. Simulated Lakshmipur Scenario (Seed Data)

The platform includes a repeatable fictional disaster scenario based in **Lakshmipur**:
- **6 Simulated Reports** representing **4 Distinct Incidents**:
  1. *Flooded Main Road (College Road)* — Report #1 & duplicate Report #2.
  2. *Fallen 11kV Electrical Pole & Conductor* — Report #3 & duplicate Report #4 (30m away from flood, but distinct hazard!).
  3. *Partial Commercial Building Collapse (Lakshmipur Bazar)* — Report #5 (Critical life risk, USAR dispatch).
  4. *Waterlogged Residential Lane (Station Road North)* — Report #6 (1.4km away, isolated shallow flooding).
- Reset the scenario at any time via the **"Reset Scenario"** button in the header or `POST /api/seed/reset`.

---

## 7. Priority Scoring Formula

The priority score ($0 \le S \le 100$) is computed strictly deterministically:

$$\text{Priority Score} = \sum_{i=1}^{7} \left( \frac{\text{Weight}_i \times \text{Factor Score}_i}{100} \right)$$

| Factor | Weight | Evaluation Criteria |
|---|---:|---|
| **Risk to Human Life** | 30% | Active life threat (95/100), AI life risk indicators, category lethal risks. |
| **Visible Damage Severity** | 20% | Direct structural destruction, collapse, deep inundation. |
| **Secondary Hazards** | 15% | Electrocution in water, gas leaks, road cutoff. |
| **People Affected** | 10% | Scaled civilian count (50+ people = 100/100). |
| **Critical Infrastructure** | 10% | Power feeders, arterial transit corridors, hospitals. |
| **Time Sensitivity** | 10% | Immediate golden-hour intervention requirements. |
| **Vulnerable Populations** | 5% | Children, elderly, mobility impaired in zone. |

### Priority Bands:
- **Critical:** $80.0 - 100.0$
- **High:** $60.0 - 79.99$
- **Medium:** $35.0 - 59.99$
- **Low:** $0.0 - 34.99$

---

## 8. Installation & Running

### Prerequisites:
- Node.js 18+ (tested on Node v26)
- npm 9+

### Install Dependencies:
```bash
npm install
npm audit
```

The project uses patched Next.js 15 and Zod 4 releases. The PostCSS override keeps Next.js's nested dependency on the same patched version as the app. npm 12 script approvals are recorded in `package.json`: esbuild's binary setup is allowed for the reviewed version, and core-js's optional donation banner is denied. After updating esbuild, review its setup script and run `npm install-scripts approve esbuild` followed by `npm rebuild esbuild` to refresh the version approval. Avoid `npm audit fix --force` without reviewing the proposed major upgrades.

### Run Full Test Suite:
```bash
npm run test:engine
# Or run complete verification
node --import tsx scripts/verify-all.ts
```

### Start Development Server:
```bash
npm run dev
```

### Build for Production:
```bash
npm run build
npm start
```

Development output lives in `.next/`; production builds and `npm start` use `.next-production/` so a running development server cannot overwrite production chunks. Run `npm run build` after pulling this configuration change before starting production. If port 3000 is occupied, use `npm start -- -p 3001` and open http://localhost:3001.

`npm start` and `npm run dev` now automatically select the first available port between 3000 and 3019 and print the actual URL. They leave existing processes running. Explicit `-p` / `--port` arguments and shell `PORT` values are respected. In this workspace, the IDE language server uses port 3000, so use the URL printed by Next.js (usually http://localhost:3001).

Open [http://localhost:3000](http://localhost:3000) to access CIVISCOPE.

## 9. Situation Report (SitRep) PDF Export

In the Control Room, click **Export SitRep PDF** beside Refresh. The button downloads a fresh A4 PDF with:

- Current dashboard KPI totals, active incident count, and KPI definitions.
- Active Critical/High incidents ranked by priority score, including location, verification, review flags, priority rationale, hazards, and assigned departments.
- All departmental assignments with dispatch/acknowledgement/completion timestamps and response notes, plus chronological response activity history.
- UTC issue time, report reference, repeated headers, page numbers, and an exercise notice when simulated incidents are present.

The report covers all repository incidents regardless of dashboard filters. Critical/High KPI totals include resolved incidents, matching the dashboard; the detailed urgent incident section excludes resolved/closed incidents. Active responses count acknowledged/in-progress assignments, not unique incidents.

`GET /api/reports/sitrep` returns `application/pdf` as an attachment with `Cache-Control: no-store`. Generation runs on the server using jsPDF; no database migration or external PDF service is needed. Download errors appear beside the export controls and can be retried.

The current `IncidentService` uses process-local in-memory state, including when Supabase credentials are configured. Export follows that same source; this milestone does not add database persistence. The app currently uses demo persona switching, and this endpoint follows the existing read API access model without server-enforced role authentication. Built-in PDF fonts support Latin text; unsupported characters (including Bengali) appear as `?`. Unicode font embedding is a future enhancement.

`npm run test:engine` now runs the original engine suite and `scripts/test-sitrep.ts` using the tsx loader, which resolves the existing extensionless TypeScript imports on modern Node. Export checks cover PDF content, priority order, empty states, resolved incidents, long-note pagination, HTTP download headers, fresh updates, and generation failures. To save a sample PDF while testing:

```bash
SITREP_TEST_OUTPUT=/tmp/civiscope-sitrep.pdf npm run test:engine
```

## 10. Startup, UI, and Regression Checks

The Control Room and department portals use responsive map/queue panels, a wider desktop workspace, wrapping phone controls, larger KPI values, keyboard-accessible incident cards, and visible data-load errors with Refresh recovery. Role switching resets department selections, map resizing follows panel resizing, and map animations are cleaned up to prevent errors during rapid role changes. Report presets keep the location pin in sync; submitted reports include the current demo reporter ID and tracking shows that reporter's submissions.

The statistics endpoint is dynamic so production KPI totals update after operations. Response and verification updates refresh the activity timeline and report tracking. Repeated active dispatches are idempotent, duplicate review preserves incidents with remaining evidence/assignments, and in-process state is shared across route bundles. This remains a demo repository: data is lost when the server restarts, and the demo role selector does not provide authenticated authorization. Supabase persistence and real authentication remain separate work.

Run the checks:

```bash
npm run test:engine
node --import tsx scripts/verify-all.ts
node --import tsx scripts/verify-workflows-inproc.ts
npm run build
npm run test:startup

# With the app running in another terminal:
npx playwright install chromium
TEST_BASE_URL=http://localhost:3001 npm run test:browser
```

Browser tests reset the simulated scenario; use a local demo instance. They check all portals at 375, 768, and 1440 pixels, runtime errors during role changes, map markers, filters, activity updates, PDF downloads, current production KPIs, and retry behavior. Screenshots and failure traces are saved in `test-results/`. External OpenStreetMap tile availability and live OpenRouter/Supabase operations are not covered by these automated checks.
