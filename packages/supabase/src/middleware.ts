import {
  createServerClient as createSSRServerClient,
  type CookieMethodsServer,
} from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { requireEnv } from "./env.ts";

/**
 * SSR session-refresh middleware helper (#SupabasePackage). A consumer's
 * `middleware.ts` calls this to keep the Supabase auth session fresh on every
 * request, bridging cookies between the incoming NextRequest and the outgoing
 * NextResponse. `next` is an optional peer dependency.
 *
 * Traces to AC-KIT-003.3.
 *
 * @example
 *   // middleware.ts
 *   export async function middleware(request: NextRequest) {
 *     return updateSession(request);
 *   }
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const cookies: CookieMethodsServer = {
    getAll: () => request.cookies.getAll(),
    setAll: (cookiesToSet) => {
      for (const { name, value } of cookiesToSet) {
        request.cookies.set(name, value);
      }
      response = NextResponse.next({ request });
      for (const { name, value, options } of cookiesToSet) {
        response.cookies.set(name, value, options);
      }
    },
  };

  const supabase = createSSRServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { cookies },
  );

  // Touch the user to trigger a refresh if the access token is stale.
  await supabase.auth.getUser();

  return response;
}
