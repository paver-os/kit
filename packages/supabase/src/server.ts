import {
  createServerClient as createSSRServerClient,
  type CookieMethodsServer,
} from "@supabase/ssr";
import { requireEnv } from "./env.ts";

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
export function createServerClient(cookies: CookieMethodsServer) {
  return createSSRServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { cookies },
  );
}
