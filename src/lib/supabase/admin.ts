import { createClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/auth/server";
// This module is imported by server routes only. Never use the service key in a client component.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new ApiError(
      503,
      "Server database configuration is incomplete. Ask the project administrator to configure Supabase.",
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
