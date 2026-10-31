import nextEnv from '@next/env';

// Read-only network probes. Never log URLs with API keys or response records.
nextEnv.loadEnvConfig(process.cwd());
const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !publicKey || !serviceKey) {
  console.error('FAIL: Supabase URL, public key and server key must be configured.');
  process.exitCode = 1;
} else {
  const probes = [
    ['Supabase Auth settings (public client)', '/auth/v1/settings', publicKey],
    ['Supabase department directory (server client)', '/rest/v1/departments?select=id&limit=1', serviceKey],
    ['Supabase profiles schema (server client)', '/rest/v1/profiles?select=id&limit=0', serviceKey],
    ['Supabase incidents schema (server client)', '/rest/v1/incidents?select=id&limit=0', serviceKey],
    ['Supabase reports schema (server client)', '/rest/v1/reports?select=id&limit=0', serviceKey],
    ['Supabase assignments schema (server client)', '/rest/v1/assignments?select=id&limit=0', serviceKey],
  ];
  for (const [name, path, key] of probes) {
    try {
      const response = await fetch(new URL(path, base), {
        headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(12000),
      });
      console.log(`${response.ok ? 'PASS' : 'FAIL'}: ${name}: HTTP ${response.status}`);
      if (!response.ok) process.exitCode = 1;
      await response.body?.cancel();
    } catch {
      console.error(`FAIL: ${name}: network/URL error (credentials and records omitted).`);
      process.exitCode = 1;
    }
  }
}

const provider = process.env.AI_PROVIDER || (process.env.GEMINI_API_KEY ? 'gemini' : 'openrouter');
const aiKey = provider === 'gemini' ? process.env.GEMINI_API_KEY : process.env.OPENROUTER_API_KEY;
if (aiKey) {
  try {
    const model = (process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').replace(/^models\//, '');
    const response = await fetch(provider === 'gemini'
      ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`
      : 'https://openrouter.ai/api/v1/auth/key', {
      headers: provider === 'gemini' ? { 'x-goog-api-key': aiKey } : { Authorization: `Bearer ${aiKey}` },
      signal: AbortSignal.timeout(12000),
    });
    console.log(`${response.ok ? 'PASS' : 'FAIL'}: ${provider} credential/model metadata check: HTTP ${response.status} (no inference performed)`);
    if (!response.ok) process.exitCode = 1;
    await response.body?.cancel();
  } catch {
    console.error(`FAIL: ${provider} metadata network check (credentials omitted).`);
    process.exitCode = 1;
  }
} else console.log('SKIP: AI provider key is not configured.');
