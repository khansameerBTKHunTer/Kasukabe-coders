import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';

nextEnv.loadEnvConfig(process.cwd());
const errors = [];
const warnings = [];
const remote = process.argv.includes('--remote');
const env = process.env;
const validUrl = (name, https = true) => {
  try {
    const url = new URL(env[name]);
    if ((https && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash)
      throw new Error();
    return url;
  } catch {
    errors.push(`${name} must be a valid ${https ? 'HTTPS ' : ''}URL without credentials, query or fragment.`);
    return null;
  }
};
if (env.CIVISCOPE_DEMO_MODE === 'true') errors.push('Set CIVISCOPE_DEMO_MODE=false for a real deployment. Demo data and sessions are temporary and process-local.');
const app = validUrl('NEXT_PUBLIC_APP_URL');
if (app && (['localhost','127.0.0.1','[::1]'].includes(app.hostname) || app.pathname !== '/'))
  errors.push('NEXT_PUBLIC_APP_URL must be the public deployment origin, with no path.');
const database = validUrl('NEXT_PUBLIC_SUPABASE_URL');
for (const name of ['NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'])
  if (!env[name]?.trim()) errors.push(`${name} is required.`);
if (env.NEXT_PUBLIC_SUPABASE_ANON_KEY === env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_SERVICE_ROLE_KEY)
  errors.push('The public Supabase key and service role key must be different.');
for (const name of Object.keys(env))
  if (name.startsWith('NEXT_PUBLIC_') && /(?:SERVICE_ROLE|GEMINI_API_KEY|OPENROUTER_API_KEY|DB_PASSWORD)/.test(name))
    errors.push(`${name} would expose a server credential to browsers. Remove the public prefix.`);
if (env.AI_PROVIDER && !['gemini','openrouter'].includes(env.AI_PROVIDER)) errors.push('AI_PROVIDER must be gemini or openrouter.');
const provider = env.AI_PROVIDER || (env.GEMINI_API_KEY ? 'gemini' : 'openrouter');
if (!(provider === 'gemini' ? env.GEMINI_API_KEY : env.OPENROUTER_API_KEY)?.trim())
  warnings.push('Vision is not configured. Clear typed hazards can still route; no visual assessment will be generated.');
const geocoding = validUrl('GEOCODING_BASE_URL');
if (geocoding?.hostname === 'nominatim.openstreetmap.org')
  errors.push('Public Nominatim uses a process-local limiter here. For a serverless/multi-instance production deployment set GEOCODING_BASE_URL to a compatible provider or a proxy with a shared application-wide limiter/cache.');
if (!env.GEOCODING_USER_AGENT?.trim()) warnings.push('Set GEOCODING_USER_AGENT to identify the app and a contact URL.');
if (remote && database && env.SUPABASE_SERVICE_ROLE_KEY) {
  const client = createClient(database.href, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15000) }) },
  });
  try {
    const { data, error } = await client.rpc('civiscope_deployment_status');
    if (error && !['PGRST202','42883'].includes(error.code))
      errors.push('Hosted Supabase readiness could not be read. Check the service key, project availability and database permissions.');
    else if (error || data?.schema_version !== '20261105' || !data?.report_delivery_installed)
      errors.push('Hosted database is missing the current deployment/report-delivery migrations. Apply unapplied SQL files through 20261105 in order.');
    else {
      if (data.department_count !== 11) errors.push('Hosted department directory is incomplete.');
      if (!data.private_evidence_bucket) errors.push('Evidence bucket must be private with the 8 MB size limit.');
    }
  } catch {
    errors.push('Unable to contact hosted Supabase. Check the project URL, service key and network.');
  }
}
for (const warning of warnings) console.warn(`WARNING: ${warning}`);
for (const error of errors) console.error(`ERROR: ${error}`);
if (errors.length) process.exitCode = 1;
else console.log(`Deployment preflight passed${remote ? ', including hosted schema and private evidence storage' : ' (environment only; add --remote to check hosted schema)'}.`);
