import * as _supabase_supabase_js from '@supabase/supabase-js';
import { CookieMethodsServer } from '@supabase/ssr';

/**
 * Env-newline guard (#EnvNewlineGuard).
 *
 * `vercel env pull` appends a trailing newline to pulled secret values. The
 * pulled value can carry either a real trailing "\n" or the two-character
 * literal sequence backslash-n; both corrupt a Supabase URL or key at client
 * construction. This guard is applied to every Supabase env read so the fleet
 * stops hand-rolling the strip in each repo.
 *
 * Traces to AC-KIT-003.2 (guard applied before use) and AC-KIT-003.5 (unit
 * test asserts a value ending in "\n" is returned without the trailing
 * newline). See fleet memory: vercel-env-pull-trailing-newlines.
 */
declare function stripEnvNewline(value: string): string;
/** Read an env var and apply the newline guard. Returns undefined if unset. */
declare function readEnv(key: string): string | undefined;
/** Read a required env var (guarded). Throws a named error if missing/empty. */
declare function requireEnv(key: string): string;

/**
 * Browser Supabase client (#SupabasePackage). Reads the public URL + anon key
 * through the env-newline guard. Use in Client Components.
 *
 * Traces to AC-KIT-003.1.
 */
declare function createBrowserClient(): _supabase_supabase_js.SupabaseClient<any, "public", any, any, any>;

/**
 * Server (SSR) Supabase client (#SupabasePackage). The consumer supplies the
 * cookie adapter (from `next/headers` `cookies()`), keeping this package free
 * of a hard framework import. Reads URL + anon key through the guard.
 *
 * Traces to AC-KIT-003.1.
 *
 * @example
 *   import { cookies } from "next/headers";
 *   const store = await cookies();
 *   const supabase = createServerClient({
 *     getAll: () => store.getAll(),
 *     setAll: (list) => list.forEach(({ name, value, options }) =>
 *       store.set(name, value, options)),
 *   });
 */
declare function createServerClient(cookies: CookieMethodsServer): _supabase_supabase_js.SupabaseClient<any, "public", any, any, any>;

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
declare function createAdminClient(): _supabase_supabase_js.SupabaseClient<any, "public", "public", any, any>;

export { createAdminClient, createBrowserClient, createServerClient, readEnv, requireEnv, stripEnvNewline };
