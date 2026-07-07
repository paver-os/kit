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

export {
  stripEnvNewline,
  readEnv,
  requireEnv
};
