import { cookies } from "next/headers";
import { createServerClientWithCookies } from "./server-cookies.ts";

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
export async function createServerClient() {
  const cookieStore = await cookies();
  return createServerClientWithCookies({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      try {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      } catch {
        // Called from a Server Component — safe to ignore; middleware refreshes.
      }
    },
  });
}
