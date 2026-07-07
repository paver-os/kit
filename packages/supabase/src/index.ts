/**
 * @paver/supabase — shared Supabase client factories for the Paver fleet.
 *
 * Replaces the hand-rolled `lib/supabase/*` client set copied across Cargo,
 * RACK, Surf, Spairo, and Nighthawk. Traces to @REQ-KIT-003.
 *
 * The root export is `next`-free so it works in a plain Node script as well as
 * a Next app (AC-KIT-002.4). The SSR middleware helper imports `next/server`,
 * so it lives at the `@paver/supabase/middleware` subpath — import it there.
 */
export { stripEnvNewline, readEnv, requireEnv } from "./env.ts";
export { createBrowserClient } from "./browser.ts";
export { createServerClient } from "./server.ts";
export { createAdminClient } from "./admin.ts";
