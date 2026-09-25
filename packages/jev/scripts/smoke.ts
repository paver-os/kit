/**
 * Live smoke test for @paver/jev — makes exactly ONE real call to Jev with a
 * synthetic, non-personal state. Does nothing unless JEV_LIVE=1.
 *
 *   JEV_LIVE=1 AI_GATEWAY_API_KEY=… node --experimental-strip-types packages/jev/scripts/smoke.ts
 *
 * Prints the result (answers, usage, attempts, elapsed) as JSON. Never prints
 * the key: the result object never contains it (AC-KIT-013.18).
 * Exit code: 0 on success or skip, 1 on a Jev failure result.
 */
import { runSmoke } from "../src/smoke.ts";

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined>; exitCode?: number } }).process;
const out = await runSmoke({ env: env.env });
if (!out.ran) {
  console.log("skipped: set JEV_LIVE=1 to make one live Jev call");
} else {
  console.log(JSON.stringify(out.result, null, 2));
  if (!out.result?.ok) env.exitCode = 1;
}
