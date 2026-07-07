import { createBrowserClient as createSSRBrowserClient } from "@supabase/ssr";
import { stripEnvNewline } from "./env.ts";

/**
 * Browser Supabase client (#SupabasePackage). Use in Client Components.
 *
 * CRITICAL: the env vars are referenced as the STATIC literals
 * `process.env.NEXT_PUBLIC_SUPABASE_URL` / `...ANON_KEY`, NOT via a dynamic
 * `process.env[key]` helper. Next (and Turbopack/webpack DefinePlugin) only
 * inlines `NEXT_PUBLIC_*` into the client bundle where it sees the exact static
 * member expression. A dynamic read resolves to `undefined` in the browser and
 * OAuth fails silently on click. (Spairo lesson, RACK commit 78a477c — do not
 * "DRY" these into getSupabaseEnv.) The newline guard still runs at runtime on
 * the inlined value.
 *
 * Traces to AC-KIT-003.1.
 */
export function createBrowserClient() {
  const url = stripEnvNewline(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const anonKey = stripEnvNewline(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "");
  return createSSRBrowserClient(url, anonKey);
}
