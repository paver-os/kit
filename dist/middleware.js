import {
  createServerClientWithCookies
} from "./chunk-C6DGRKWO.js";

// src/middleware.ts
import { NextResponse } from "next/server";
async function updateSession(request) {
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
    }
  });
  await supabase.auth.getUser();
  return response;
}
export {
  updateSession
};
