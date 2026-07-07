import { NextRequest, NextResponse } from 'next/server';

/**
 * Generic SSR session-refresh middleware helper (#SupabasePackage). A consumer's
 * `middleware.ts` calls this to keep the Supabase auth session fresh, bridging
 * cookies between the incoming NextRequest and the outgoing NextResponse. `next`
 * is an optional peer dependency. Apps that also need auth-gate/redirect policy
 * build their own middleware on top of `createServerClientWithCookies`.
 *
 * Traces to AC-KIT-003.3.
 */
declare function updateSession(request: NextRequest): Promise<NextResponse>;

export { updateSession };
