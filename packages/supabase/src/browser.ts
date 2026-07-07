import { createBrowserClient as createSSRBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env.ts";

/**
 * Browser Supabase client (#SupabasePackage). Reads the public URL + anon key
 * through the tolerant env guard. Use in Client Components.
 *
 * Traces to AC-KIT-003.1.
 */
export function createBrowserClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createSSRBrowserClient(url, anonKey);
}
