import { test } from "node:test";
import assert from "node:assert/strict";
import { createJevClient, JEV_ENDPOINT, JEV_MODEL, noul, choice, score } from "./index.ts";
import type { JevClientConfig } from "./index.ts";
import { scriptedFetch, fakeClock, okBody, TEST_KEY, type Scripted } from "./fixtures.ts";

const STATE = "Build log: step 3 failed with exit code 137 after 41 minutes.";
const QS = {
  oom: noul("Did the step fail because it ran out of memory?"),
};

function client(script: Scripted[], cfg: Partial<JevClientConfig> = {}) {
  const f = scriptedFetch(script);
  const clock = fakeClock();
  const c = createJevClient({
    apiKey: TEST_KEY,
    fetch: f.fetch,
    now: clock.now,
    sleep: clock.sleep,
    random: () => 0.5,
    ...cfg,
  });
  return { c, calls: f.calls, clock };
}

// AC-KIT-013.1, .11, .12, .23, .24, .25, .27 — success path
test("success: posts to the systemone endpoint with the jev model and reports usage and cost", async () => {
  const { c, calls } = client([{ status: 200, body: okBody({ oom: { type: "noul", noul: 0.97 } }) }]);
  const r = await c.ask(STATE, QS);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.answers.oom.noul, 0.97);
  assert.equal(r.attempts, 1);
  assert.deepEqual(r.usage, { inputTokens: 326, outputTokens: 40, cost: 0, marketCost: 0.0000137 });
  assert.equal(typeof r.elapsedMs, "number");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, JEV_ENDPOINT);
  assert.equal(JEV_ENDPOINT, "https://ai-gateway.vercel.sh/typesafe/v1/systemone");
  assert.equal(calls[0]!.method, "POST");
  assert.equal(calls[0]!.headers["authorization"], `Bearer ${TEST_KEY}`);
  assert.equal(calls[0]!.headers["content-type"], "application/json");
  const body = calls[0]!.body as { model: string; state: string; questions: unknown };
  assert.equal(body.model, JEV_MODEL);
  assert.equal(JEV_MODEL, "typesafe-ai/jev");
  assert.equal(body.state, STATE);
  assert.deepEqual(body.questions, QS);
});

// AC-KIT-013.26 — a missing cost is undefined, never zero
test("usage: an absent cost figure is undefined, not zero", async () => {
  const { c } = client([
    { status: 200, body: okBody({ oom: { type: "noul", noul: 0.1 } }, { provider_metadata: {} }) },
  ]);
  const r = await c.ask(STATE, QS);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.usage.cost, undefined);
  assert.equal(r.usage.marketCost, undefined);
  assert.ok(!("cost" in r.usage) || r.usage.cost === undefined);
});

// AC-KIT-013.26 — an unparseable cost string is undefined, not zero
test("usage: an unparseable cost string is undefined, not zero", async () => {
  const { c } = client([
    {
      status: 200,
      body: okBody({ oom: { type: "noul", noul: 0.1 } }, { provider_metadata: { gateway: { cost: "n/a" } } }),
    },
  ]);
  const r = await c.ask(STATE, QS);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.usage.cost, undefined);
});

// AC-KIT-014.1, .7 — 429 then success
test("retry: 429 then 200 succeeds on the second attempt after a jittered wait", async () => {
  const { c, calls, clock } = client([
    { status: 429, body: { error: { type: "rate_limit_exceeded", message: "high demand" } } },
    { status: 200, body: okBody({ oom: { type: "noul", noul: 0.2 } }) },
  ]);
  const r = await c.ask(STATE, QS);
  assert.equal(r.ok, true);
  assert.equal(r.attempts, 2);
  assert.equal(calls.length, 2);
  // full jitter, retry 1: random 0.5 × min(4000, 250 × 2^0) = 125
  assert.deepEqual(clock.waits, [125]);
});

// AC-KIT-014.7 — the jitter ceiling doubles and caps at maxDelayMs
test("retry: jitter ceiling doubles per retry and caps at maxDelayMs", async () => {
  const { c, clock } = client(
    [{ status: 503 }, { status: 503 }, { status: 503 }, { status: 503 }, { status: 200, body: okBody({ oom: { type: "noul", noul: 0.2 } }) }],
    { random: () => 1, baseDelayMs: 100, maxDelayMs: 300, totalBudgetMs: 60_000 },
  );
  const r = await c.ask(STATE, QS);
  assert.equal(r.ok, true);
  assert.deepEqual(clock.waits, [100, 200, 300, 300]);
});

// AC-KIT-014.2, .11, .12, .13, AC-KIT-013.3, .5, .6 — 503 exhausted
test("retry: 503 on every attempt resolves to exhausted after the default 5 attempts, never throws", async () => {
  const { c, calls } = client([{ status: 503, body: { error: { type: "service_unavailable_error" } } }]);
  const r = await c.ask(STATE, QS);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.failure.kind, "exhausted");
  assert.equal(r.failure.lastOutcome, "unavailable");
  assert.equal(r.failure.sent, true);
  assert.equal(r.attempts, 5);
  assert.equal(calls.length, 5);
});

// AC-KIT-014.12 — 429 exhaustion names rate_limited; 500 names server_error
test("retry: exhausted names the last retryable outcome", async () => {
  const a = client([{ status: 429 }], { maxAttempts: 2 });
  const ra = await a.c.ask(STATE, QS);
  assert.equal(!ra.ok && ra.failure.lastOutcome, "rate_limited");
  const b = client([{ status: 502 }], { maxAttempts: 2 });
  const rb = await b.c.ask(STATE, QS);
  assert.equal(!rb.ok && rb.failure.lastOutcome, "server_error");
});

// AC-KIT-014.9 — Retry-After delta-seconds is a floor on the wait
test("retry: Retry-After seconds is honoured as a minimum wait", async () => {
  const { c, clock } = client([
    { status: 429, headers: { "retry-after": "2" } },
    { status: 200, body: okBody({ oom: { type: "noul", noul: 0.2 } }) },
  ]);
  const r = await c.ask(STATE, QS);
  assert.equal(r.ok, true);
  assert.equal(clock.waits.length, 1);
  assert.ok(clock.waits[0]! >= 2000, `waited ${clock.waits[0]}`);
});

// AC-KIT-014.10 — Retry-After HTTP-date is a floor on the wait
test("retry: Retry-After HTTP-date is honoured as a minimum wait", async () => {
  const clock = fakeClock(Date.UTC(2026, 8, 25, 12, 0, 0));
  const date = new Date(Date.UTC(2026, 8, 25, 12, 0, 3)).toUTCString();
  const s = scriptedFetch([
    { status: 503, headers: { "retry-after": date } },
    { status: 200, body: okBody({ oom: { type: "noul", noul: 0.2 } }) },
  ]);
  const c = createJevClient({ apiKey: TEST_KEY, fetch: s.fetch, now: clock.now, sleep: clock.sleep, random: () => 0 });
  const r = await c.ask(STATE, QS);
  assert.equal(r.ok, true);
  assert.ok(clock.waits[0]! >= 3000, `waited ${clock.waits[0]}`);
});

// AC-KIT-014.8 — a wait that would pass the budget ends the call now
test("retry: a Retry-After longer than the remaining budget resolves exhausted without waiting", async () => {
  const { c, calls, clock } = client([{ status: 429, headers: { "retry-after": "30" } }]);
  const r = await c.ask(STATE, QS);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.failure.kind, "exhausted");
  assert.equal(calls.length, 1);
  assert.deepEqual(clock.waits, []);
});

// AC-KIT-014.3 — no attempt starts after the budget has elapsed
test("retry: no attempt starts after the budget has elapsed", async () => {
  const f = scriptedFetch([{ status: 503 }]);
  const clock = fakeClock();
  let n = 0;
  const slowFetch: typeof f.fetch = async (url, init) => {
    n += 1;
    clock.advance(3000); // each attempt consumes 3 s of the 8 s budget
    return f.fetch(url, init);
  };
  const c = createJevClient({ apiKey: TEST_KEY, fetch: slowFetch, now: clock.now, sleep: clock.sleep, random: () => 0 });
  const r = await c.ask(STATE, QS);
  assert.equal(r.ok, false);
  // attempts start at t=0, 3000, 6000; the next would start at 9000 > 8000
  assert.equal(n, 3);
});

// AC-KIT-014.4, .5, AC-KIT-013.2 — a hung attempt is aborted and retried
test("timeout: a hung attempt is aborted at the attempt timeout and retried", async () => {
  const { c, calls } = client(
    [{ hang: true }, { status: 200, body: okBody({ oom: { type: "noul", noul: 0.2 } }) }],
    { attemptTimeoutMs: 20 },
  );
  const r = await c.ask(STATE, QS);
  assert.equal(r.ok, true);
  assert.equal(calls.length, 2);
});

// AC-KIT-014.5, .12 — timeouts exhausting report `timeout`
test("timeout: every attempt hanging resolves exhausted with lastOutcome timeout", async () => {
  const { c } = client([{ hang: true }], { attemptTimeoutMs: 10, maxAttempts: 2 });
  const r = await c.ask(STATE, QS);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.failure.kind, "exhausted");
  assert.equal(r.failure.lastOutcome, "timeout");
});

// AC-KIT-014.6 — the attempt timeout never exceeds the remaining budget
test("timeout: the per-attempt timeout is clipped to the remaining budget", async () => {
  const f = scriptedFetch([{ hang: true }]);
  const clock = fakeClock();
  const started = Date.now();
  const c = createJevClient({
    apiKey: TEST_KEY,
    fetch: f.fetch,
    now: clock.now,
    sleep: clock.sleep,
    random: () => 0,
    attemptTimeoutMs: 5_000,
    totalBudgetMs: 30,
    maxAttempts: 1,
  });
  const r = await c.ask(STATE, QS);
  assert.equal(r.ok, false);
  assert.ok(Date.now() - started < 1_000, "attempt was not clipped to the 30 ms budget");
});

// AC-KIT-013.2, .12 — a transport rejection never rejects the call
test("network: a rejecting transport resolves exhausted with lastOutcome network", async () => {
  const { c } = client([{ throws: new TypeError("fetch failed") }], { maxAttempts: 2 });
  const r = await c.ask(STATE, QS);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.failure.kind, "exhausted");
  assert.equal(r.failure.lastOutcome, "network");
});

// AC-KIT-013.20, .22 — 401 is not retried
test("auth: 401 resolves auth after exactly one attempt", async () => {
  const { c, calls } = client([{ status: 401, body: { error: { message: "invalid key" } } }]);
  const r = await c.ask(STATE, QS);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.failure.kind, "auth");
  assert.equal(r.failure.status, 401);
  assert.equal(r.failure.sent, true);
  assert.equal(calls.length, 1);
});

// AC-KIT-013.20 — 403 is not retried
test("auth: 403 resolves auth after exactly one attempt", async () => {
  const { c, calls } = client([{ status: 403 }]);
  const r = await c.ask(STATE, QS);
  assert.equal(!r.ok && r.failure.kind, "auth");
  assert.equal(calls.length, 1);
});

// AC-KIT-013.21, .22 — other 4xx rejected, not retried
test("rejected: 400 resolves rejected after one attempt with the status", async () => {
  const { c, calls } = client([{ status: 400, body: { error: { message: "evaluation model" } } }]);
  const r = await c.ask(STATE, QS);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.failure.kind, "rejected");
  assert.equal(r.failure.status, 400);
  assert.equal(r.failure.sent, true);
  assert.equal(calls.length, 1);
});

// AC-KIT-013.21 — 408 is the carve-out: retried, not rejected
test("rejected: 408 is retried rather than rejected", async () => {
  const { c, calls } = client([{ status: 408 }, { status: 200, body: okBody({ oom: { type: "noul", noul: 0.2 } }) }]);
  const r = await c.ask(STATE, QS);
  assert.equal(r.ok, true);
  assert.equal(calls.length, 2);
});

// AC-KIT-013.8
test("bad_response: a 2xx body that is not JSON", async () => {
  const { c } = client([{ status: 200, rawBody: "<html>gateway</html>" }]);
  const r = await c.ask(STATE, QS);
  assert.equal(!r.ok && r.failure.kind, "bad_response");
  assert.equal(!r.ok && r.failure.sent, true);
});

// AC-KIT-013.9
test("bad_response: a 2xx body missing an asked question's answer", async () => {
  const { c } = client([{ status: 200, body: okBody({}) }]);
  const r = await c.ask(STATE, QS);
  assert.equal(!r.ok && r.failure.kind, "bad_response");
});

// AC-KIT-013.10
test("bad_response: an answer whose type differs from the question's", async () => {
  const { c } = client([{ status: 200, body: okBody({ oom: { type: "score", score: 1 } }) }]);
  const r = await c.ask(STATE, QS);
  assert.equal(!r.ok && r.failure.kind, "bad_response");
});

// AC-KIT-016.15
test("bad_response: a noul probability outside 0..1", async () => {
  const { c } = client([{ status: 200, body: okBody({ oom: { type: "noul", noul: 1.4 } }) }]);
  const r = await c.ask(STATE, QS);
  assert.equal(!r.ok && r.failure.kind, "bad_response");
});

// AC-KIT-016.12, .13, .14 — choice and score answers
test("answers: choice and score answers are returned per key; an unoffered option is bad_response", async () => {
  const qs = {
    area: choice("Which area does this log belong to?", { build: "Compilation or bundling", test: "Test runner", deploy: "Deployment" }),
    severity: score("How severe is the failure?", ["cosmetic", "degraded", "blocking"]),
  };
  const good = client([
    {
      status: 200,
      body: okBody({
        area: { type: "choice", choice: "build", probabilities: { build: 0.9, test: 0.05, deploy: 0.05 }, confidence: 0.9 },
        severity: { type: "score", score: 1.8, probabilities: { "0": 0.05, "1": 0.1, "2": 0.85 }, confidence: 0.8 },
      }),
    },
  ]);
  const r = await good.c.ask(STATE, qs);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const area: "build" | "test" | "deploy" = r.answers.area.choice;
  assert.equal(area, "build");
  assert.equal(r.answers.severity.score, 1.8);

  const goodArea = { type: "choice", choice: "build", probabilities: { build: 0.9, test: 0.05, deploy: 0.05 }, confidence: 0.9 };
  const goodSeverity = { type: "score", score: 1, probabilities: { "0": 0.1, "1": 0.8, "2": 0.1 }, confidence: 0.5 };

  // Choice half alone: an unoffered option with a sound score answer.
  const badChoice = client([
    { status: 200, body: okBody({ area: { ...goodArea, choice: "marketing" }, severity: goodSeverity }) },
  ]);
  const rc = await badChoice.c.ask(STATE, qs);
  assert.equal(!rc.ok && rc.failure.kind, "bad_response");
  assert.match(!rc.ok ? rc.failure.message : "", /area/);

  // Score half alone: a sound choice answer with a score missing its probabilities.
  const badScore = client([
    { status: 200, body: okBody({ area: goodArea, severity: { type: "score", score: 1, confidence: 0.5 } }) },
  ]);
  const rs = await badScore.c.ask(STATE, qs);
  assert.equal(!rs.ok && rs.failure.kind, "bad_response");
  assert.match(!rs.ok ? rs.failure.message : "", /severity/);
});

// AC-KIT-013.15, .16, .17 — key from env, newline-stripped; missing key refuses
test("key: read from AI_GATEWAY_API_KEY at call time, trailing \\n stripped", async () => {
  const prev = process.env.AI_GATEWAY_API_KEY;
  try {
    const f = scriptedFetch([{ status: 200, body: okBody({ oom: { type: "noul", noul: 0.2 } }) }]);
    const c = createJevClient({ fetch: f.fetch });
    process.env.AI_GATEWAY_API_KEY = `${TEST_KEY}\\n`; // set AFTER client creation: read at call time
    const r = await c.ask(STATE, QS);
    assert.equal(r.ok, true);
    assert.equal(f.calls[0]!.headers["authorization"], `Bearer ${TEST_KEY}`);
  } finally {
    if (prev === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = prev;
  }
});

test("key: none available resolves missing_key without sending", async () => {
  const prev = process.env.AI_GATEWAY_API_KEY;
  try {
    delete process.env.AI_GATEWAY_API_KEY;
    const f = scriptedFetch([{ status: 200 }]);
    const c = createJevClient({ fetch: f.fetch });
    const r = await c.ask(STATE, QS);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.failure.kind, "missing_key");
    assert.equal(r.failure.sent, false);
    assert.equal(r.attempts, 0);
    assert.equal(f.calls.length, 0);
  } finally {
    if (prev !== undefined) process.env.AI_GATEWAY_API_KEY = prev;
  }
});

// AC-KIT-013.18 — the key never appears in a failure, even when upstream echoes it
test("key: never appears in a failure, even when the transport error or body echoes it", async () => {
  const echoes: Scripted[][] = [
    [{ throws: new Error(`connect failed; Authorization: Bearer ${TEST_KEY}`) }],
    [{ status: 401, body: { error: { message: `key ${TEST_KEY} is invalid` } } }],
    [{ status: 400, rawBody: `bad request for ${TEST_KEY}` }],
    [{ status: 503, body: { error: { message: `upstream saw ${TEST_KEY}` } } }],
  ];
  for (const script of echoes) {
    const { c } = client(script, { maxAttempts: 1 });
    const r = await c.ask(STATE, QS);
    assert.equal(r.ok, false);
    assert.ok(!JSON.stringify(r).includes(TEST_KEY), `key leaked: ${JSON.stringify(r)}`);
    assert.ok(!JSON.stringify(r).includes(TEST_KEY.slice(4, 20)), "key fragment leaked");
  }
});

// AC-KIT-013.19 — nothing is written to the console on any path
test("console: no path writes to the console", async () => {
  const methods = ["log", "info", "warn", "error", "debug", "trace"] as const;
  const saved = methods.map((m) => console[m]);
  let writes = 0;
  for (const m of methods) console[m] = () => void (writes += 1);
  try {
    const scripts: Scripted[][] = [
      [{ status: 200, body: okBody({ oom: { type: "noul", noul: 0.2 } }) }],
      [{ status: 429 }],
      [{ status: 401 }],
      [{ throws: new Error("boom") }],
      [{ status: 200, rawBody: "nope" }],
    ];
    for (const s of scripts) await client(s, { maxAttempts: 2 }).c.ask(STATE, QS);
    await client([{ status: 200 }]).c.ask("mail me at a@b.co", QS);
  } finally {
    methods.forEach((m, i) => (console[m] = saved[i]!));
  }
  assert.equal(writes, 0);
});

// AC-KIT-013.14 — the global fetch is the default transport
test("transport: uses the global fetch when none is supplied", async () => {
  const saved = globalThis.fetch;
  const s = scriptedFetch([{ status: 200, body: okBody({ oom: { type: "noul", noul: 0.3 } }) }]);
  globalThis.fetch = s.fetch as typeof globalThis.fetch;
  try {
    const c = createJevClient({ apiKey: TEST_KEY });
    const r = await c.ask(STATE, QS);
    assert.equal(r.ok, true);
    assert.equal(s.calls.length, 1);
  } finally {
    globalThis.fetch = saved;
  }
});

// AC-KIT-015.7, .8, .9, AC-KIT-013.6 — personal data refused before sending
test("personal data: an email in the state is refused, nothing sent, match not echoed", async () => {
  const { c, calls } = client([{ status: 200 }]);
  const r = await c.ask("Customer jane.doe@example.com says the order is late", QS);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.failure.kind, "personal_data");
  assert.deepEqual(r.failure.detected, ["email"]);
  assert.equal(r.failure.sent, false);
  assert.equal(calls.length, 0);
  assert.ok(!JSON.stringify(r).includes("jane.doe"));
});

// AC-KIT-015.1 — question text is scanned too
test("personal data: a phone number inside a question's criteria is refused", async () => {
  const { c, calls } = client([{ status: 200 }]);
  const r = await c.ask(STATE, { q: noul("Is this about the rep?", { true: "Mentions (801) 555-0142", false: "Does not" }) });
  assert.equal(!r.ok && r.failure.kind, "personal_data");
  assert.equal(calls.length, 0);
});

// AC-KIT-015.10 — explicit opt-in sends
test("personal data: allowPersonalData true sends the call", async () => {
  const { c, calls } = client([{ status: 200, body: okBody({ oom: { type: "noul", noul: 0.2 } }) }]);
  const r = await c.ask("Contact jane.doe@example.com", QS, { allowPersonalData: true });
  assert.equal(r.ok, true);
  assert.equal(calls.length, 1);
});

// AC-KIT-015.15, .17 — oversized state refused
test("size: state + longest question over 32,000 estimated tokens is refused before sending", async () => {
  const { c, calls } = client([{ status: 200 }]);
  const r = await c.ask("x".repeat(96_001), QS);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.failure.kind, "state_too_large");
  assert.equal(r.failure.sent, false);
  assert.equal(r.failure.limit, 32_000);
  assert.ok((r.failure.estimatedTokens ?? 0) > 32_000);
  assert.equal(calls.length, 0);
});

// AC-KIT-015.16 — many questions over the 64,000 per-request limit
test("size: state + all questions over 64,000 estimated tokens is refused", async () => {
  const { c, calls } = client([{ status: 200 }]);
  const big = "y".repeat(40_000);
  const qs: Record<string, ReturnType<typeof noul>> = {};
  for (let i = 0; i < 5; i += 1) qs[`q${i}`] = noul(`${big} question ${i}?`);
  const r = await c.ask("short state", qs);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.failure.kind, "state_too_large");
  assert.equal(r.failure.limit, 64_000);
  assert.equal(calls.length, 0);
});

// AC-KIT-016.9, .10, .11 — invalid requests refused before sending
test("invalid_request: empty state, no questions, and a malformed question are refused unsent", async () => {
  const { c, calls } = client([{ status: 200 }]);
  const empty = await c.ask("   ", QS);
  assert.equal(!empty.ok && empty.failure.kind, "invalid_request");
  const none = await c.ask(STATE, {});
  assert.equal(!none.ok && none.failure.kind, "invalid_request");
  const oneOption = await c.ask(STATE, {
    q: { type: "choice", instructions: "pick", criteria: { only: "the only one" } },
  });
  assert.equal(!oneOption.ok && oneOption.failure.kind, "invalid_request");
  const elevenLevels = await c.ask(STATE, {
    q: { type: "score", instructions: "grade", criteria: Array.from({ length: 11 }, (_, i) => `level ${i}`) },
  });
  assert.equal(!elevenLevels.ok && elevenLevels.failure.kind, "invalid_request");
  assert.equal(calls.length, 0);
});
