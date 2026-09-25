import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runSmoke, SMOKE_STATE } from "./smoke.ts";
import { detectPersonalData } from "./index.ts";
import { scriptedFetch, okBody, TEST_KEY } from "./fixtures.ts";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as Record<string, unknown>;

// AC-KIT-013.13 — zero runtime dependencies
test("package: declares no runtime dependency", () => {
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.peerDependencies, undefined);
  assert.equal(pkg.optionalDependencies, undefined);
});

// AC-KIT-013.29 — smoke makes no call unless JEV_LIVE=1
test("smoke: makes no call unless JEV_LIVE is 1", async () => {
  for (const live of [undefined, "0", "true", "yes"]) {
    const f = scriptedFetch([{ status: 200 }]);
    const out = await runSmoke({ env: { JEV_LIVE: live, AI_GATEWAY_API_KEY: TEST_KEY }, fetch: f.fetch });
    assert.equal(out.ran, false, String(live));
    assert.equal(f.calls.length, 0, String(live));
  }
});

// AC-KIT-013.28 — exactly one call, synthetic non-personal state
test("smoke: with JEV_LIVE=1 makes exactly one call over a non-personal state", async () => {
  const f = scriptedFetch([
    {
      status: 200,
      body: okBody({
        failed: { type: "noul", noul: 0.98 },
        area: { type: "choice", choice: "test", probabilities: { build: 0.05, test: 0.9, deploy: 0.05 }, confidence: 0.9 },
      }),
    },
  ]);
  const out = await runSmoke({ env: { JEV_LIVE: "1", AI_GATEWAY_API_KEY: TEST_KEY }, fetch: f.fetch, maxAttempts: 1 });
  assert.equal(out.ran, true);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(detectPersonalData(SMOKE_STATE), []);
  assert.ok(!JSON.stringify(out).includes(TEST_KEY));
});
