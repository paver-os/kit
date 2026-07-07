/**
 * Env-newline guard (#EnvNewlineGuard).
 *
 * `vercel env pull` appends a trailing newline to pulled secret values. The
 * pulled value can carry either a real trailing "\n" or the two-character
 * literal sequence backslash-n; both corrupt a Supabase URL or key at client
 * construction. This guard is applied to every Supabase env read so the fleet
 * stops hand-rolling the strip in each repo.
 *
 * Traces to AC-KIT-003.2 (guard applied before use) and AC-KIT-003.5 (unit
 * test asserts a value ending in "\n" is returned without the trailing
 * newline). See fleet memory: vercel-env-pull-trailing-newlines.
 */
export function stripEnvNewline(value: string): string {
  // Order matters: strip a literal backslash-n suffix first, then any real
  // trailing CR/LF, then surrounding whitespace. Idempotent on clean input.
  return value
    .replace(/\\n$/, "")
    .replace(/[\r\n]+$/, "")
    .trim();
}

/** Read an env var and apply the newline guard. Returns undefined if unset. */
export function readEnv(key: string): string | undefined {
  const raw = process.env[key];
  return raw === undefined ? undefined : stripEnvNewline(raw);
}

/** Read a required env var (guarded). Throws a named error if missing/empty. */
export function requireEnv(key: string): string {
  const value = readEnv(key);
  if (!value) {
    throw new Error(`[@paver/supabase] missing required environment variable: ${key}`);
  }
  return value;
}
