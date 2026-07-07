import { createBrowserClient as createSSRBrowserClient } from "@supabase/ssr";
import { requireEnv } from "./env.ts";

/**
 * Browser Supabase client (#SupabasePackage). Reads the public URL + anon key
 * through the env-newline guard. Use in Client Components.
 *
 * Traces to AC-KIT-003.1.
 */
export function createBrowserClient() {
  return createSSRBrowserClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
}
