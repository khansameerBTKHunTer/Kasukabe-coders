# Deploying CIVISCOPE

The application uses real Supabase Auth, PostgreSQL with department-scoped RLS, private Storage and server-only mutations. The fictional demo is a separate, process-local mode; production must use `CIVISCOPE_DEMO_MODE=false`.

## Prepare Supabase

Apply the **contents** of unapplied files under `supabase/migrations` in filename order, through `20261105_deployment_readiness.sql`. Do not rerun the original schema or seed on an existing project. The `20261104` migration recovers previously unassigned fire reports; `20261105` adds a private readiness probe. Back up an existing database before applying migrations. See [integration handoff](INTEGRATION_HANDOFF.md) for Auth profile identity reconciliation and provisioning the first administrator.

In Supabase Auth URL Configuration, set Site URL to the final HTTPS website origin, and add `https://YOUR_DOMAIN/auth/callback` and `https://YOUR_DOMAIN/auth/callback?flow=recovery` to allowed redirects. Confirm email delivery with a real sign-up and recovery email. Demo emails/passwords are not hosted Supabase accounts.

The `incident-evidence` bucket must stay private, allow only JPEG/PNG/WebP, and have an 8 MB limit. Real browser uploads now request an owner-scoped signed upload URL, send bytes directly to Storage, then call the app to validate the actual stored image. This preserves the 8 MB feature without crossing Vercel's 4.5 MB function request limit. The upload token cannot overwrite existing objects. Only photo paths belonging to the current account can be used to submit or analyze evidence.

## Environment and hosting

Use Node.js 22 or a newer supported LTS release. On Vercel import the repository as Next.js, install with `npm ci`, build with `npm run build`, and let the Next.js integration manage the output directory. On a Node host run `npm ci`, `npm run build` and `PORT=3000 npm start` behind an HTTPS reverse proxy. Configure persistent logs and health checks against `/api/health`; this endpoint proves the application is running, not that a hosted migration has been applied.

Vercel builds use the standard `.next` directory. Local production builds continue
to use `.next-production` to remain separate from the local development server.
On Vercel, address lookups require an explicit `GEOCODING_BASE_URL`; when it is
unset, the UI keeps GPS/manual pin selection available and explains that address
lookup is unconfigured instead of falling back to the public demo provider.

Set these variables in the hosting project's environment **before building**:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public project HTTPS URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-safe anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Private server key, never a `NEXT_PUBLIC_*` variable |
| `NEXT_PUBLIC_APP_URL` | Final HTTPS origin with no path or query |
| `CIVISCOPE_DEMO_MODE` | `false` |
| `AI_PROVIDER` | `gemini` or `openrouter` |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Native Google AI Studio key and available vision model, if using Gemini |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | Optional alternative provider configuration |
| `GEOCODING_BASE_URL` | Nominatim-compatible production provider or a proxy with a shared rate limit/cache |
| `GEOCODING_USER_AGENT` | App identification and contact URL |

The public Nominatim default is for the accepted small demo. Its application-wide one-request-per-second rule cannot be enforced by a process-local queue across serverless instances. Configure a suitable provider/proxy for production. The existing map continues to use standard OpenStreetMap tiles with attribution. See [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) and your map/provider usage limits.

Changing `NEXT_PUBLIC_*` values requires a new build. Keep `.env.local` out of Git. Do not paste credentials into issue descriptions, screenshots or logs.

Run from the configured environment:

```bash
npm run check:deploy -- --remote
npm run check
npm run build
npm run test:browser:local
npm audit --omit=dev
```

`check:deploy -- --remote` performs read-only checks against the configured Supabase database; it applies no SQL and creates no users. It checks the installed schema, the department directory and private evidence storage, and prints only configuration names/errors. It does not claim email delivery, external AI availability or browser permissions have been verified. The backend also checks the installed schema before writing a report, so an older database cannot silently drop department assignments while the UI reports success.

## Final acceptance on the hosted URL

Register and confirm a citizen account, register a Fire unit and provision the intended administrator. Submit a photograph and a clearly described building fire from the citizen account. Confirm that Fire can view the original report and acknowledge its task, the unrelated Electricity account cannot view that incident, and Admin can review the evidence and completed work. Test a photograph over 4.5 MB, GPS permission refusal with manual pin/address fallback, password recovery, and a completed response awaiting verification.

The browser suite runs against an isolated local demo with mocked providers; database tests run in isolated PostgreSQL. These local results do not replace this hosted acceptance check or apply migrations remotely.

## Dependency audit status

The online audit during this iteration reports zero production vulnerabilities. The full audit reports 14 moderate entries caused by one `minimatch` advisory in the ESLint development dependency tree: [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). The installed lint plugins depend on the older callable API; forcing `minimatch` 11 globally breaks that API, and npm's proposed ESLint/Next-config downgrades are unsuitable. Keep the toolchain development-only, do not process untrusted glob configurations, and revisit compatible upstream releases. This remaining advisory is not represented as fixed.
