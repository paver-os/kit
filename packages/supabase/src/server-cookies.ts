import {
  createServerClient as createSSRServerClient,
  type CookieMethodsServer,
} from "@supabase/ssr";
import { getSupabaseEnv } from "./env.ts";

/**
 * Server Supabase client bound to a caller-supplied cookie adapter
 * (#SupabasePackage). Framework-neutral — no `next` import — so it works from
 * middleware (request-bound cookies) or any SSR context. The higher-level
 * `@paver/supabase/server` self-wraps `next/headers` on top of this.
 *
 * Traces to AC-KIT-003.1.
 */
export function createServerClientWithCookies(cookies: CookieMethodsServer) {
  const { url, anonKey } = getSupabaseEnv();
  return createSSRServerClient(url, anonKey, { cookies });
}
