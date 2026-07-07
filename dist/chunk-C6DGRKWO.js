// src/env.ts
function stripEnvNewline(value) {
  return value.replace(/\\n$/, "").replace(/[\r\n]+$/, "").trim();
}
function readEnv(key) {
  const raw = process.env[key];
  return raw === void 0 ? void 0 : stripEnvNewline(raw);
}
function requireEnv(key) {
  const value = readEnv(key);
  if (!value) {
    throw new Error(`[@paver/supabase] missing required environment variable: ${key}`);
  }
  return value;
}
function getSupabaseEnv() {
  const url = readEnv("NEXT_PUBLIC_SUPABASE_URL") ?? "";
  const anonKey = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ?? "";
  return { url, anonKey, configured: Boolean(url && anonKey) };
}

// src/server-cookies.ts
import {
  createServerClient as createSSRServerClient
} from "@supabase/ssr";
function createServerClientWithCookies(cookies) {
  const { url, anonKey } = getSupabaseEnv();
  return createSSRServerClient(url, anonKey, { cookies });
}

export {
  stripEnvNewline,
  readEnv,
  requireEnv,
  getSupabaseEnv,
  createServerClientWithCookies
};
