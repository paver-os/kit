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
 * Tolerant read of the public Supabase env (guarded). Never throws: `configured`
 * is false until both values are present. Lets an app stay honest about whether
 * a live connection exists (e.g. before provisioning) instead of crashing or
 * fabricating one.
 */
declare function getSupabaseEnv(): {
    url: string;
    anonKey: string;
    configured: boolean;
};

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
declare function createBrowserClient(): _supabase_supabase_js.SupabaseClient<any, "public", any, any, any>;

/**
 * Server Supabase client bound to a caller-supplied cookie adapter
 * (#SupabasePackage). Framework-neutral — no `next` import — so it works from
 * middleware (request-bound cookies) or any SSR context. The higher-level
 * `@paver/supabase/server` self-wraps `next/headers` on top of this.
 *
 * Traces to AC-KIT-003.1.
 */
declare function createServerClientWithCookies(cookies: CookieMethodsServer): _supabase_supabase_js.SupabaseClient<any, "public", any, any, any>;

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

export { createAdminClient, createBrowserClient, createServerClientWithCookies, getSupabaseEnv, readEnv, requireEnv, stripEnvNewline };
