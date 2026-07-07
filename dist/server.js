import {
  createServerClientWithCookies
} from "./chunk-C6DGRKWO.js";

// src/server.ts
import { cookies } from "next/headers";
async function createServerClient() {
  const cookieStore = await cookies();
  return createServerClientWithCookies({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      try {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      } catch {
      }
    }
  });
}
export {
  createServerClient
};
