/**
 * @paver/supabase — shared Supabase client factories for the Paver fleet.
 *
 * Replaces the hand-rolled `lib/supabase/*` client set copied across Cargo,
 * RACK, Surf, Spairo, and Nighthawk. Traces to @REQ-KIT-003.
 *
 * Note: `./middleware` is exported separately by consumers that need it, since
 * it imports `next/server`. Import it directly (`@paver/supabase/middleware`)
 * once a subpath export is added, or from the package root in a Next app.
 */
export { stripEnvNewline, readEnv, requireEnv } from "./env.ts";
export { createBrowserClient } from "./browser.ts";
export { createServerClient } from "./server.ts";
export { createAdminClient } from "./admin.ts";
export { updateSession } from "./middleware.ts";
