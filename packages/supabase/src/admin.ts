import { createClient } from "@supabase/supabase-js";
import { readEnv, requireEnv } from "./env.ts";

/**
 * Service-role admin client (#SupabasePackage). Bypasses RLS — server-only,
 * never ship to the browser. Session persistence and auto-refresh are off
 * because a service-role client carries no user session.
 *
 * Prefers a server-only SUPABASE_URL, falling back to the public URL. Reads
 * every value through the env-newline guard.
 *
 * Traces to AC-KIT-003.1.
 */
export function createAdminClient() {
  const url = readEnv("SUPABASE_URL") ?? requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  return createClient(url, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
