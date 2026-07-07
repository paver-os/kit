import * as _supabase_supabase_js from '@supabase/supabase-js';

/**
 * Ergonomic server (SSR) Supabase client (#SupabasePackage). Self-wraps Next's
 * `next/headers` cookie store, so a Server Component or Server Action just does
 * `const supabase = await createServerClient()` — no cookie plumbing per call
 * site. Lives at the `@paver/supabase/server` subpath because it imports `next`.
 *
 * The `setAll` try/catch tolerates being called from a Server Component (where
 * cookies are read-only); the middleware refreshes the session in that case.
 *
 * Traces to AC-KIT-003.1.
 */
declare function createServerClient(): Promise<_supabase_supabase_js.SupabaseClient<any, "public", any, any, any>>;

export { createServerClient };
