/**
 * The live smoke call (AC-KIT-013.28, .29): ONE call over a synthetic,
 * non-personal build-log state. Kept in `src/` as a function so the tests can
 * prove the JEV_LIVE gate and the one-call count with a scripted fetch;
 * `scripts/smoke.ts` is the thin runner. Not exported from the package entry.
 */
import { createJevClient } from "./client.ts";
import { choice, noul } from "./questions.ts";
import type { FetchLike, JevResult } from "./types.ts";

export const SMOKE_STATE =
  "CI build log excerpt: installing dependencies ok; compiling sources ok; " +
  "running unit tests: suite checkout-math failed, expected total to equal subtotal plus tax, received subtotal only.";

export const SMOKE_QUESTIONS = {
  failed: noul("Did the CI run fail?", { true: "At least one step failed", false: "Every step passed" }),
  area: choice("Which stage failed?", {
    build: "Dependency install or compilation",
    test: "Unit or integration tests",
    deploy: "Deployment or release",
  }),
};

export interface SmokeOutcome {
  ran: boolean;
  result?: JevResult<typeof SMOKE_QUESTIONS>;
}

export async function runSmoke(opts: {
  env: Record<string, string | undefined>;
  fetch?: FetchLike;
  maxAttempts?: number;
}): Promise<SmokeOutcome> {
  if (opts.env.JEV_LIVE !== "1") return { ran: false };
  const client = createJevClient({
    apiKey: opts.env.AI_GATEWAY_API_KEY ?? "",
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
    ...(opts.maxAttempts ? { maxAttempts: opts.maxAttempts } : {}),
  });
  return { ran: true, result: await client.ask(SMOKE_STATE, SMOKE_QUESTIONS) };
}
