import {
  readEnv,
  requireEnv,
  stripEnvNewline
} from "./chunk-37JYYATY.js";

// src/browser.ts
import { createBrowserClient as createSSRBrowserClient } from "@supabase/ssr";
function createBrowserClient() {
  return createSSRBrowserClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  );
}

// src/server.ts
import {
  createServerClient as createSSRServerClient
} from "@supabase/ssr";
function createServerClient(cookies) {
  return createSSRServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { cookies }
  );
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
  createServerClient,
  readEnv,
  requireEnv,
  stripEnvNewline
};
