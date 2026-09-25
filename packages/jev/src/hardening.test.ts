import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createJevClient, detectPersonalData, noul, choice, score } from "./index.ts";
import type { JevClientConfig, JevQuestions } from "./index.ts";
import { scriptedFetch, fakeClock, okBody, TEST_KEY, type Scripted } from "./fixtures.ts";

const STATE = "Build log: step 3 failed with exit code 137 after 41 minutes.";
const QS = { oom: noul("Did the step fail because it ran out of memory?") };

function client(script: Scripted[], cfg: Partial<JevClientConfig> = {}) {
  const f = scriptedFetch(script);
  const clock = fakeClock();
  const c = createJevClient({ apiKey: TEST_KEY, fetch: f.fetch, now: clock.now, sleep: clock.sleep, random: () => 0.5, ...cfg });
  return { c, calls: f.calls, clock };
}

// ── Fix 1: size before scan; the scan is linear ─────────────────────────────

// AC-KIT-015.18 — size runs before the personal-data scan
test("size-first: a 1,000,000-char no-space state resolves state_too_large in under 200 ms", async () => {
  const { c, calls } = client([{ status: 200 }]);
  const t0 = performance.now();
  const r = await c.ask("a".repeat(1_000_000), QS);
  const ms = performance.now() - t0;
  assert.equal(!r.ok && r.failure.kind, "state_too_large");
  assert.equal(calls.length, 0);
  assert.ok(ms < 200, `took ${ms.toFixed(1)} ms`);
});

// AC-KIT-015.18 — ordering pinned independently of speed: an input that fails BOTH
// checks reports the size failure, which is only possible if size ran first.
test("size-first: an oversized state that also contains an email reports state_too_large", async () => {
  const { c, calls } = client([{ status: 200 }]);
  const r = await c.ask(`contact jane.doe@example.com ${"x".repeat(100_000)}`, QS);
  assert.equal(!r.ok && r.failure.kind, "state_too_large");
  assert.equal(calls.length, 0);
});

// AC-KIT-015.19 — the scan is linear in the input
test("scan: a 30,000-char state with no '@' scans in under 100 ms", () => {
  for (const s of ["a".repeat(30_000), "a.".repeat(15_000), "1".repeat(30_000), "@".repeat(30_000), "a@".repeat(15_000)]) {
    const t0 = performance.now();
    detectPersonalData(s);
    const ms = performance.now() - t0;
    assert.ok(ms < 100, `${JSON.stringify(s.slice(0, 4))}… took ${ms.toFixed(1)} ms`);
  }
});

// AC-KIT-015.2 — still detects after the linear rewrite
test("scan: the linear email check still detects emails at boundaries and before punctuation", () => {
  for (const s of ["x@y.io", "mail jane.doe@example.com.", "(ops+1@mail.madson.co)", "a_b-c%d@sub-1.example.org,"]) {
    assert.deepEqual(detectPersonalData(s), ["email"], s);
  }
  for (const s of ["user@localhost", "@handle", "foo@", "a@b.c", "version 2.0@build"]) {
    assert.ok(!detectPersonalData(s).includes("email"), s);
  }
});

// ── Fix 2: scan exactly what is sent ────────────────────────────────────────

// AC-KIT-015.1 (rev 2) — question keys are sent, so they are scanned
test("scan: an email used as a question KEY is refused unsent", async () => {
  const { c, calls } = client([{ status: 200 }]);
  const r = await c.ask(STATE, { "jane.doe@example.com": noul("Is this about the rep?") });
  assert.equal(!r.ok && r.failure.kind, "personal_data");
  assert.equal(calls.length, 0);
});

// AC-KIT-015.20 — only known question fields are sent, so an extra field cannot carry data out
test("wire: an extra field on a question is not sent, so the email in it never leaves", async () => {
  const { c, calls } = client([{ status: 200, body: okBody({ oom: { type: "noul", noul: 0.2 } }) }]);
  const q = { ...noul("Did it run out of memory?"), note: "escalate to jane.doe@example.com" } as unknown as ReturnType<typeof noul>;
  const r = await c.ask(STATE, { oom: q });
  assert.equal(r.ok, true);
  assert.equal(calls.length, 1);
  const sent = JSON.stringify(calls[0]!.body);
  assert.ok(!sent.includes("jane.doe"), sent);
  assert.deepEqual(calls[0]!.body, {
    model: "typesafe-ai/jev",
    state: STATE,
    questions: { oom: { type: "noul", instructions: "Did it run out of memory?" } },
  });
});

// ── Fix 3: full answer validation ───────────────────────────────────────────

const CQ = { area: choice("Which area?", { build: "b", test: "t", deploy: "d" }) };
const SQ = { sev: score("How severe?", ["low", "mid", "high"]) };
const goodChoice = { type: "choice", choice: "build", probabilities: { build: 0.8, test: 0.1, deploy: 0.1 }, confidence: 0.8 };
const goodScore = { type: "score", score: 1.2, probabilities: { "0": 0.1, "1": 0.6, "2": 0.3 }, confidence: 0.6 };

async function verdict(qs: JevQuestions, answers: Record<string, unknown>) {
  const { c } = client([{ status: 200, body: okBody(answers) }]);
  const r = await c.ask(STATE, qs);
  return r.ok ? "ok" : r.failure.kind;
}

test("answers: sound choice and score answers pass (control for the cases below)", async () => {
  assert.equal(await verdict(CQ, { area: goodChoice }), "ok");
  assert.equal(await verdict(SQ, { sev: goodScore }), "ok");
});

// AC-KIT-016.25 — choice probabilities and confidence
test("answers: choice with confidence outside 0..1 is bad_response", async () => {
  assert.equal(await verdict(CQ, { area: { ...goodChoice, confidence: 1.5 } }), "bad_response");
  assert.equal(await verdict(CQ, { area: { ...goodChoice, confidence: -0.1 } }), "bad_response");
});

test("answers: choice with missing probabilities is bad_response", async () => {
  const { probabilities: _p, ...noProbs } = goodChoice;
  assert.equal(await verdict(CQ, { area: noProbs }), "bad_response");
});

test("answers: choice probabilities naming an unoffered option or outside 0..1 are bad_response", async () => {
  assert.equal(await verdict(CQ, { area: { ...goodChoice, probabilities: { build: 0.9, marketing: 0.1 } } }), "bad_response");
  assert.equal(await verdict(CQ, { area: { ...goodChoice, probabilities: { build: 1.9 } } }), "bad_response");
});

// AC-KIT-016.26 — score range, probabilities and confidence
test("answers: score outside the level range is bad_response", async () => {
  assert.equal(await verdict(SQ, { sev: { ...goodScore, score: 2.5 } }), "bad_response");
  assert.equal(await verdict(SQ, { sev: { ...goodScore, score: -0.5 } }), "bad_response");
  assert.equal(await verdict(SQ, { sev: { ...goodScore, score: 2 } }), "ok");
});

test("answers: score missing probabilities or confidence is bad_response", async () => {
  const { probabilities: _p, ...noProbs } = goodScore;
  const { confidence: _c, ...noConf } = goodScore;
  assert.equal(await verdict(SQ, { sev: noProbs }), "bad_response");
  assert.equal(await verdict(SQ, { sev: noConf }), "bad_response");
});

test("answers: score confidence outside 0..1, or a probability for a level that does not exist, is bad_response", async () => {
  assert.equal(await verdict(SQ, { sev: { ...goodScore, confidence: 2 } }), "bad_response");
  assert.equal(await verdict(SQ, { sev: { ...goodScore, probabilities: { "0": 0.1, "7": 0.9 } } }), "bad_response");
});

test("answers: noul probability below 0 or non-numeric is bad_response", async () => {
  assert.equal(await verdict(QS, { oom: { type: "noul", noul: -0.01 } }), "bad_response");
  assert.equal(await verdict(QS, { oom: { type: "noul", noul: "0.9" } }), "bad_response");
});

// ── Fix 4: redact any non-empty key ─────────────────────────────────────────

// AC-KIT-013.18 — any non-empty key
test("key: a short key is still redacted from failures", async () => {
  const shortKey = "k1";
  const f = scriptedFetch([{ status: 401, body: { error: { message: `key xk1x rejected` } } }]);
  const c = createJevClient({ apiKey: shortKey, fetch: f.fetch });
  const r = await c.ask(STATE, QS);
  assert.equal(!r.ok && r.failure.kind, "auth");
  assert.ok(!(!r.ok && r.failure.message.includes(shortKey)), !r.ok ? r.failure.message : "");
});

// ── Fix 5: phone false negatives ────────────────────────────────────────────

// AC-KIT-015.3 (rev 2)
test("personal data: phone forms with a 0/1 exchange, spaced dashes, or slashes are detected", () => {
  for (const s of ["call 801-123-4567", "call 801 - 555 - 1234", "call 801/555/1234", "call (801)555-1234"]) {
    assert.deepEqual(detectPersonalData(s), ["phone"], s);
  }
});

// Decision: a bare 7-digit local number is NOT flagged — it is indistinguishable
// from part numbers, invoice numbers and ranges (see AC-KIT-015.21).
test("personal data: 7-digit local numbers and version strings are not flagged", () => {
  for (const s of ["sku 555-1234", "release 1.2.3", "v12.4.1051", "range 200-300", "INV 100-2000"]) {
    assert.deepEqual(detectPersonalData(s), [], s);
  }
});

// ── Minor: malformed input, deaf fetch, never-throw boundary ────────────────

// AC-KIT-016.27
test("invalid_request: a null question, null criteria, or null options resolve invalid_request, not exhausted", async () => {
  const { c, calls } = client([{ status: 200 }]);
  const cases = [
    { q: null },
    { q: { type: "noul", instructions: "x?", criteria: null } },
    { q: { type: "choice", instructions: "x?", criteria: null } },
    { q: { type: "score", instructions: "x?", criteria: null } },
    { q: { type: "noul", instructions: null } },
    { q: "not a question" },
  ];
  for (const qs of cases) {
    const r = await c.ask(STATE, qs as unknown as JevQuestions);
    assert.equal(!r.ok && r.failure.kind, "invalid_request", JSON.stringify(qs));
  }
  const r = await c.ask(STATE, null as unknown as JevQuestions);
  assert.equal(!r.ok && r.failure.kind, "invalid_request");
  assert.equal(calls.length, 0);
});

// AC-KIT-014.15 — a fetch that ignores its abort signal still times out
test("timeout: a fetch that ignores the abort signal is still cut off at the attempt timeout", async () => {
  let n = 0;
  const deaf = (() => {
    n += 1;
    return new Promise<Response>(() => {}); // never settles, never listens
  }) as JevClientConfig["fetch"];
  const clock = fakeClock();
  const c = createJevClient({ apiKey: TEST_KEY, fetch: deaf, now: clock.now, sleep: clock.sleep, random: () => 0, attemptTimeoutMs: 15, maxAttempts: 2 });
  const r = await c.ask(STATE, QS);
  assert.equal(!r.ok && r.failure.kind, "exhausted");
  assert.equal(!r.ok && r.failure.lastOutcome, "timeout");
  assert.equal(n, 2);
});

// AC-KIT-013.2 — the never-throw boundary covers the clock too
test("never throws: a clock that throws still yields a typed failure", async () => {
  const f = scriptedFetch([{ status: 200 }]);
  const c = createJevClient({ apiKey: TEST_KEY, fetch: f.fetch, now: () => { throw new Error(`clock broke ${TEST_KEY}`); } });
  const r = await c.ask(STATE, QS);
  assert.equal(r.ok, false);
  assert.ok(!JSON.stringify(r).includes(TEST_KEY));
});

// ── Defaults (AC-KIT-014.13) ────────────────────────────────────────────────

test("defaults: base delay 250 ms, max delay 4,000 ms", async () => {
  const { c, clock } = client([{ status: 503 }], { random: () => 1, maxAttempts: 8, totalBudgetMs: 100_000 });
  await c.ask(STATE, QS);
  assert.deepEqual(clock.waits, [250, 500, 1000, 2000, 4000, 4000, 4000]);
});

test("defaults: total budget 8,000 ms", async () => {
  const s = scriptedFetch([{ status: 503 }]);
  const clock = fakeClock();
  let n = 0;
  const c = createJevClient({
    apiKey: TEST_KEY,
    now: clock.now,
    sleep: clock.sleep,
    random: () => 0,
    maxAttempts: 100,
    fetch: async (u, i) => {
      n += 1;
      clock.advance(1000);
      return s.fetch(u, i);
    },
  });
  await c.ask(STATE, QS);
  assert.equal(n, 8); // attempts start at 0, 1000, … 7000; 8000 is past the budget
});

test("defaults: attempt timeout 3,000 ms and at most 5 attempts", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const signals: AbortSignal[] = [];
    const clock = fakeClock();
    const c = createJevClient({
      apiKey: TEST_KEY,
      now: clock.now,
      sleep: clock.sleep,
      random: () => 0,
      totalBudgetMs: 1_000_000,
      fetch: (_u, init) => {
        signals.push(init!.signal!);
        return new Promise<Response>(() => {});
      },
    });
    const pending = c.ask(STATE, QS);
    for (let i = 0; i < 5; i += 1) {
      await new Promise((r) => setImmediate(r));
      assert.equal(signals.length, i + 1);
      mock.timers.tick(2_999);
      assert.equal(signals[i]!.aborted, false, `attempt ${i + 1} aborted before 3000 ms`);
      mock.timers.tick(1);
      assert.equal(signals[i]!.aborted, true, `attempt ${i + 1} not aborted at 3000 ms`);
    }
    const r = await pending;
    assert.equal(r.attempts, 5);
    assert.equal(!r.ok && r.failure.kind, "exhausted");
  } finally {
    mock.timers.reset();
  }
});
