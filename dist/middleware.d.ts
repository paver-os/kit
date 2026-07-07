import { NextRequest, NextResponse } from 'next/server';

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
declare function updateSession(request: NextRequest): Promise<NextResponse>;

export { updateSession };
