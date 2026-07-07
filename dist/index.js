import {
  createServerClientWithCookies,
  getSupabaseEnv,
  readEnv,
  requireEnv,
  stripEnvNewline
} from "./chunk-C6DGRKWO.js";

// src/browser.ts
import { createBrowserClient as createSSRBrowserClient } from "@supabase/ssr";
function createBrowserClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createSSRBrowserClient(url, anonKey);
}

// src/admin.ts
import { createClient } from "@supabase/supabase-js";
function createAdminClient() {
  const url = readEnv("SUPABASE_URL") ?? requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  return createClient(url, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
export {
  createAdminClient,
  createBrowserClient,
  createServerClientWithCookies,
  getSupabaseEnv,
  readEnv,
  requireEnv,
  stripEnvNewline
};
