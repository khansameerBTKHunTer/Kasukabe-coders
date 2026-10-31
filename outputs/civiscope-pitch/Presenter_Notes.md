# CIVISCOPE — presenter notes

16 slides. Approximately 8 minutes of narration, plus the live demo.

Grounding: repository implementation and the supplied RAISE / Foundry Games final-evaluation criteria. Screenshots show fictional local demo data.

## 01. CIVISCOPE

PRESENTATION NOTES
CIVISCOPE connects a citizen’s report to the people responsible for responding. Our prototype combines photo-assisted reporting, a confirmed map location, explainable priority and department-specific workflows. The rescue illustration is an existing website asset; it is decorative, not evidence of a real deployment.

REPOSITORY EVIDENCE
README.md; src/components/citizen/ReportForm.tsx; src/lib/backend.ts; public/images/civiscope-rescue-atlas.webp

EVALUATION ALIGNMENT
Innovation, impact; introduce the implemented prototype. Suggested time: 20 seconds.

## 02. An incident report should lead to action.

PRESENTATION NOTES
The project addresses three workflow problems. Citizens need a clear way to supply usable evidence and location. Coordinators need to distinguish urgency, duplicates and the right team. Responders need scoped assignments and a traceable completion process. These are the needs our design addresses; we are not claiming measured emergency response-time improvements.

REPOSITORY EVIDENCE
ReportForm.tsx; ControlRoomDashboard.tsx; DepartmentDashboard.tsx; docs/INDIA_RELIEF_ROUTING.md

EVALUATION ALIGNMENT
Impact: intended users and credible qualitative benefits, without invented field statistics. 25 seconds.

## 03. One report. A connected response workflow.

PRESENTATION NOTES
This is the implemented end-to-end journey. A citizen uploads a photo and confirms the incident location. AI suggests structured observations; the server computes a priority score and duplicate candidates. Clear hazards reach the relevant professional departments automatically. Responders update their own assignments, while admin handles exceptions and verifies completed work.

REPOSITORY EVIDENCE
src/app/api/incidents/route.ts; src/lib/backend.ts; src/lib/response-routing.ts; src/components/dashboard/DepartmentDashboard.tsx

EVALUATION ALIGNMENT
Innovation and execution: connected functionality, not isolated screens. 30 seconds.

## 04. Report the damage. Confirm the exact place.

PRESENTATION NOTES
This is the existing reporting interface, not a proposed design. The citizen uploads a supported image, reviews editable AI suggestions and adds context such as immediate danger. The compact location panel supports address search, the best matching address, alternative matches, a draggable incident pin and device location. The pin represents the hazard; it can differ from the person’s current location. Screens show fictional demo data.

REPOSITORY EVIDENCE
src/components/citizen/ReportForm.tsx; src/components/map/LocationPickerMap.tsx; src/lib/upload-client.ts; tests/reporting.spec.ts

EVALUATION ALIGNMENT
UI/UX and demo: real screenshots, compact map, explicit location confirmation and error recovery. 35 seconds.

## 05. AI assists the report. The user stays in control.

PRESENTATION NOTES
Our AI component is an integration with a pretrained Gemini vision model, not a custom-trained disaster model. Photo selection starts analysis automatically. The returned structured assessment is validated and becomes editable damage and assistance text. Late AI responses do not overwrite observations the citizen has already typed. AI uncertainty remains explicit. The deterministic priority engine computes the final score. An unavailable model does not invent visual evidence; clear typed hazards still support professional routing.

REPOSITORY EVIDENCE
src/lib/ai-analyzer.ts; src/lib/image-analysis.ts; src/components/citizen/ReportForm.tsx; scripts/test-vision.ts; tests/vision.spec.ts

EVALUATION ALIGNMENT
Innovation, execution and feasibility: concrete AI use with meaningful human control. 40 seconds.

## 06. Priority you can explain—and see on the map.

PRESENTATION NOTES
The priority engine has seven explicit weights summing to 100 percent. Human life has the largest weight, at 30 percent. The software records factor reasons and missing information rather than silently assuming that unknown means safe. Admin can override a score with a reason. The map communicates the stored band with color, shape, size, score and a permanent label. Critical uses a red diamond and High an orange rounded square; accessible names include the priority and incident title.

REPOSITORY EVIDENCE
src/lib/priority-engine.ts; src/lib/map-priority.ts; src/components/map/IncidentMap.tsx; tests/dashboard.spec.ts

EVALUATION ALIGNMENT
Innovation, UI/UX and execution: explainable scoring and semantic map markings. 40 seconds.

## 07. The right department receives the incident.

PRESENTATION NOTES
The earlier bottleneck was reports appearing only in the admin portal. The implemented routing policy now creates relevant department assignments in the report workflow. Building fire reaches Fire and Medical; downed wires reach the DISCOM; blocked roads reach Public Works. Validated AI suggestions supplement mandatory capability rules. Explicit typed hazards provide a conservative fallback if AI fails. Pending evidence review does not stop an available professional team from receiving its report. These are application assignments, not emergency-service calls. Admin still handles restricted specialists, duplicates, public-source reports and other exceptions.

REPOSITORY EVIDENCE
src/lib/response-routing.ts; src/lib/department-router.ts; src/lib/backend.ts; supabase/migrations/20261104_department_report_delivery.sql; tests/routing.spec.ts

EVALUATION ALIGNMENT
Innovation, execution and demo: demonstrate department visibility rather than only admin visibility. 45 seconds.

## 08. Nearby reports are not always the same incident.

PRESENTATION NOTES
Duplicate detection is candidate correlation, not an AI-only merge. We calculate distance with the Haversine formula and examine category and description similarity within 150 metres. Admin can confirm a duplicate or keep it separate. Our fictional seed scenario includes flood reports and a nearby electrical hazard: proximity alone should not erase the second hazard. Confirmed evidence remains associated with its incident; candidate matching is not automatic evidence verification.

REPOSITORY EVIDENCE
src/lib/duplicate-detector.ts; src/lib/data-store.ts; src/app/api/incidents/duplicate/route.ts; scripts/test-engine.ts; scripts/test-regressions.ts

EVALUATION ALIGNMENT
Innovation and execution: category-aware correlation and human confirmation. 30 seconds.

## 09. The control room sees a ranked operational picture.

PRESENTATION NOTES
The control room combines operational totals, filters, priority map markers and a ranked incident queue. Admin can inspect evidence and priority reasons, review duplicates, manage exceptions and verify response completion. Export SitRep PDF creates a fresh situation report containing current priorities, assignments and activity history. The screenshots are from the running local prototype and display simulated incidents. The deck does not claim a live field deployment.

REPOSITORY EVIDENCE
src/components/dashboard/ControlRoomDashboard.tsx; src/components/incident/IncidentDetailPanel.tsx; src/app/api/reports/sitrep/route.ts; src/lib/sitrep.ts; tests/dashboard.spec.ts

EVALUATION ALIGNMENT
UI/UX, demo and execution: operational visibility and a real PDF export. 35 seconds.

## 10. Assigned is not the same as completed.

PRESENTATION NOTES
Responders see incidents assigned to their exact department. Acknowledgement, travel and field progress are recorded per assignment, so Fire resolving its task does not silently resolve another department’s work. Evidence and completion notes support admin review. Admin can verify or send the assignment back for more work. Work and routing checks protect final closure, and actions are recorded in an activity history. Rejection requires a reason and becomes a routing exception.

REPOSITORY EVIDENCE
src/components/dashboard/DepartmentDashboard.tsx; src/app/api/assignments/[id]/route.ts; src/app/api/assignments/[id]/evidence/route.ts; tests/response.spec.ts; tests/routing.spec.ts

EVALUATION ALIGNMENT
Execution, impact and demo: traceable handoff and verified completion. 35 seconds.

## 11. India-focused teams, with clear activation boundaries.

PRESENTATION NOTES
The directory is grounded in Indian disaster-response roles. There are 11 categories including the District Emergency Operations Centre, which coordinates and is not dispatched as a response team. SDRF and NDRF require admin activation. NGOs, Civil Defence and volunteers are relief-support categories; hazardous rescue is reserved for relevant professionals. These are configured application categories, not partnerships or enrollment with the named organisations. The current fictional seed dataset is based in Lakshmipur, Bangladesh, while the department taxonomy is India-focused.

REPOSITORY EVIDENCE
src/lib/departments.ts; docs/INDIA_RELIEF_ROUTING.md; supabase/migrations/20261102_india_relief_routing.sql

EVALUATION ALIGNMENT
Feasibility and impact: relevance, scope boundaries and safe activation. 30 seconds.

## 12. Built as an integrated web application.

PRESENTATION NOTES
The application uses Next.js App Router and React for the interface, with TypeScript and Tailwind. Server API routes validate input with Zod and enforce authenticated profiles. Supabase provides PostgreSQL, Auth, row-level policies and a private evidence bucket. The map uses Leaflet and OpenStreetMap; Nominatim supports address lookup in the small demo. Gemini provides vision suggestions. jsPDF generates SitRep exports. The report, incident, automatic assignments and audit events are written transactionally through server-only database functions. No offline sync, IoT, satellite feed or emergency-service messaging integration is claimed.

REPOSITORY EVIDENCE
package.json; src/lib/backend.ts; src/lib/auth/server.ts; src/lib/geocoding.ts; src/lib/ai-analyzer.ts; supabase/migrations; src/lib/photo-validation.ts

EVALUATION ALIGNMENT
Execution: actual technologies and integration depth. 35 seconds.

## 13. Tested beyond the happy path.

PRESENTATION NOTES
The last verification recorded 44 passing browser tests, 26 API HTTP methods checked and 112 API inventory assertions. These are different measures, not 182 independent test cases. Lint, TypeScript checks, backend and isolated database tests, and the production build also passed. Browser workflows use actual local APIs with fictional demo persistence; provider success and failure responses are mocked where needed. Database tests use isolated PGlite. Read-only live Supabase table/Auth and Gemini model metadata checks returned HTTP 200, which establishes connectivity but does not replace authenticated hosted workflow acceptance or a paid live vision assessment.

REPOSITORY EVIDENCE
docs/API_TEST_REPORT.md; tests/*.spec.ts; scripts/test-api-contracts.ts; scripts/test-database.mjs; package.json

EVALUATION ALIGNMENT
Execution and demo: concrete evidence with test scope explained. 35 seconds.

## 14. Show the handoff—not just the dashboard.

PRESENTATION NOTES
Before presenting: start npm run dev:demo, open /demo-login and prepare citizen, fire, medical and admin sessions in separate browser profiles. All fictional demo accounts use 1234. Use a new address far enough from seeded incidents to avoid a likely-duplicate hold. A building fire is assigned to Fire and Medical, so show independent team work and do not claim that resolving Fire alone closes the incident. For a full closure demonstration, all applicable assignments must be completed and verified and any routing exception reviewed. If the AI service is unavailable, explain the typed-hazard fallback honestly. End with a fresh SitRep download. Allow approximately three minutes for the live interaction.

REPOSITORY EVIDENCE
tests/routing.spec.ts; tests/response.spec.ts; docs/INTEGRATION_HANDOFF.md; README.md

EVALUATION ALIGNMENT
Demo: reproducible interaction proving the claimed cross-role handoff.

## 15. A working prototype, with a clear deployment boundary.

PRESENTATION NOTES
The build and local end-to-end workflows are verified, but we should not call this production-certified or a live agency deployment. The latest read-only checks found working Supabase and Gemini metadata connectivity, while hosted migration/readiness setup still needs completion through 20261105. Production origin and a deployment-appropriate geocoding service or shared-limiter proxy need configuration. The public Nominatim setup is intended for the small single-process demo. A final hosted acceptance test must use real authenticated role profiles after setup. Internet access is required; offline synchronisation is absent. These limitations are stated without inventing a roadmap, partnerships, budget or rollout commitment.

REPOSITORY EVIDENCE
docs/DEPLOYMENT.md; docs/API_TEST_REPORT.md; scripts/check-deployment.mjs; src/lib/geocoding.ts

EVALUATION ALIGNMENT
Feasibility: deployment assumptions, constraints and honest readiness. 35 seconds.

## 16. From a citizen’s report to a verified response.

PRESENTATION NOTES
CIVISCOPE brings the citizen report, the incident map, a transparent priority score and the department workflow into one application. The distinction is the connected handoff: reports are not merely visible to admin, relevant professional teams can receive assignments directly, and completed work remains reviewable. We are ready to demonstrate the implemented prototype and discuss its remaining deployment setup. Invite questions; do not add unsupported claims about lives saved, response-time reduction, agency adoption or model accuracy.

REPOSITORY EVIDENCE
Implemented workflow across src/components, src/lib and supabase/migrations; docs/API_TEST_REPORT.md

EVALUATION ALIGNMENT
Reinforces innovation, impact and execution. 15 seconds.
