import { NextResponse, type NextRequest } from "next/server";
import { createServerClientWithCookies } from "./server-cookies.ts";

/**
 * Generic SSR session-refresh middleware helper (#SupabasePackage). A consumer's
 * `middleware.ts` calls this to keep the Supabase auth session fresh, bridging
 * cookies between the incoming NextRequest and the outgoing NextResponse. `next`
 * is an optional peer dependency. Apps that also need auth-gate/redirect policy
 * build their own middleware on top of `createServerClientWithCookies`.
 *
 * Traces to AC-KIT-003.3.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClientWithCookies({
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
  });

  await supabase.auth.getUser();
  return response;
}
