/**
 * @paver/supabase — shared Supabase client factories for the Paver fleet.
 *
 * Replaces the hand-rolled `lib/supabase/*` client set copied across Cargo,
 * RACK, Surf, Spairo, and Nighthawk. Traces to @REQ-KIT-003.
 *
 * The root export is `next`-free (works in a Node script AND a Next app,
 * AC-KIT-002.4). The two `next`-dependent helpers live at subpaths:
 *   - `@paver/supabase/server`     — ergonomic server client (self-wraps next/headers)
 *   - `@paver/supabase/middleware` — session-refresh helper (next/server)
 * For middleware/edge contexts that manage their own cookies, use
 * `createServerClientWithCookies` from the root.
 */
export { stripEnvNewline, readEnv, requireEnv, getSupabaseEnv } from "./env.ts";
export { createBrowserClient } from "./browser.ts";
export { createServerClientWithCookies } from "./server-cookies.ts";
export { createAdminClient } from "./admin.ts";
