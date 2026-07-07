import {
  requireEnv
} from "./chunk-37JYYATY.js";

// src/middleware.ts
import {
  createServerClient as createSSRServerClient
} from "@supabase/ssr";
import { NextResponse } from "next/server";
async function updateSession(request) {
  let response = NextResponse.next({ request });
  const cookies = {
    getAll: () => request.cookies.getAll(),
    setAll: (cookiesToSet) => {
      for (const { name, value } of cookiesToSet) {
        request.cookies.set(name, value);
      }
      response = NextResponse.next({ request });
      for (const { name, value, options } of cookiesToSet) {
        response.cookies.set(name, value, options);
      }
    }
  };
  const supabase = createSSRServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { cookies }
  );
  await supabase.auth.getUser();
  return response;
}
export {
  updateSession
};
