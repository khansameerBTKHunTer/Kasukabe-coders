# Current Vercel deployment

Production: https://civiscope-damage-mapper.vercel.app

Vercel project: `kasukabe-coder/civiscope-damage-mapper`

The application was deployed from this workspace using the authenticated Vercel
CLI. This does not configure GitHub automatic deployments. `.vercelignore`
excludes local environment files, Git metadata, dependencies, local build output,
test screenshots and generated presentation files. The required Supabase and
active AI-provider credentials were transferred with the owner's explicit
approval; no credentials are committed here. Production uses real-account mode,
with fictional demo login disabled.

## Verified after deployment

- Vercel cloud build and deployment reached `READY`.
- 31 public/anonymous HTTP smoke checks passed. These cover all 26 API methods,
  public pages/assets and an unsupported HTTP method; protected APIs return JSON
  authentication errors rather than exposing records.
- `/api/health` returns JSON `{ "status": "ok" }`.
- `/api/departments` returns all 11 directory entries from hosted Supabase.
- Actual hosted login page tested at 1440px and 390px: form visible, image loaded,
  no horizontal overflow, no browser runtime errors.
- No hosted accounts or incident reports were created by these checks.

The local output files `outputs/vercel-smoke-results.json` and
`outputs/deployment/browser-smoke.json` contain the detailed smoke-check results.

## Remaining before real reporting

1. **Supabase migrations:** the read-only `civiscope_deployment_status` call
   returns `PGRST202` (function unavailable). Apply only unapplied migration
   contents in filename order through
   `supabase/migrations/20261105_deployment_readiness.sql`. Confirm
   `20261104_department_report_delivery.sql` has also been applied. The report
   backend deliberately refuses submission while readiness cannot be confirmed.
2. **Supabase Auth redirects:** set Site URL to
   `https://civiscope-damage-mapper.vercel.app`. Allow
   `https://civiscope-damage-mapper.vercel.app/auth/callback` and the recovery
   variant ending `/auth/callback?flow=recovery` in Auth URL Configuration.
3. **Production geocoding:** supply a Nominatim-compatible production endpoint
   or shared-rate-limit proxy as `GEOCODING_BASE_URL`, and an identifying
   `GEOCODING_USER_AGENT`. Redeploy after changing settings. Until then, address
   lookup reports that it is unconfigured; GPS/manual pin selection remains
   available. Public Nominatim is not silently used on Vercel.
4. Run the authenticated hosted acceptance workflow in
   [DEPLOYMENT.md](DEPLOYMENT.md): citizen report, correct department receipt,
   unrelated-department isolation, field evidence, completion and admin review.

No production-readiness claim is made by the successful public smoke checks.
