/**
 * #JevDecisionClient — the one way a product calls Jev (@REQ-KIT-013, -014).
 *
 * Invariant: `ask` never rejects. Every path — refusal, provider error,
 * network error, timeout, malformed body, even a throwing injected clock —
 * resolves to a `JevResult`, and the `ok` discriminant makes the caller's type
 * checker demand a fallback branch. The gateway returned 429/503 on most calls
 * during the 2026-09-25 launch load, so a failure here is ordinary.
 */
import { detectPersonalData, sentStrings, sizeProblem, wireQuestions } from "./guards.ts";
import { questionProblem } from "./questions.ts";
import type {
  AskOptions,
  FetchLike,
  JevAnswers,
  JevClient,
  JevClientConfig,
  JevFailure,
  JevQuestion,
  JevQuestions,
  JevResult,
  JevUsage,
  PersonalDataKind,
  RetryableOutcome,
} from "./types.ts";

/** Verified live 2026-09-25. `/v1/responses` rejects this model with 400. */
export const JEV_ENDPOINT = "https://ai-gateway.vercel.sh/typesafe/v1/systemone";
export const JEV_MODEL = "typesafe-ai/jev";
export const JEV_KEY_ENV = "AI_GATEWAY_API_KEY";

const RETRY_DEFAULTS = {
  maxAttempts: 5,
  attemptTimeoutMs: 3_000,
  totalBudgetMs: 8_000,
  baseDelayMs: 250,
  maxDelayMs: 4_000,
} as const;

const MAX_MESSAGE_CHARS = 300;

/** Thrown inside an attempt when its timer fires; never escapes `ask`. */
class AttemptTimeout extends Error {}

export function createJevClient(config: JevClientConfig = {}): JevClient {
  const policy = {
    maxAttempts: config.maxAttempts ?? RETRY_DEFAULTS.maxAttempts,
    attemptTimeoutMs: config.attemptTimeoutMs ?? RETRY_DEFAULTS.attemptTimeoutMs,
    totalBudgetMs: config.totalBudgetMs ?? RETRY_DEFAULTS.totalBudgetMs,
    baseDelayMs: config.baseDelayMs ?? RETRY_DEFAULTS.baseDelayMs,
    maxDelayMs: config.maxDelayMs ?? RETRY_DEFAULTS.maxDelayMs,
  };
  const now = config.now ?? Date.now;
  const sleep = config.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = config.random ?? Math.random;

  /** Full jitter under a doubling ceiling, floored by Retry-After (AC-KIT-014.7, .9, .10). */
  const backoff = (retryNumber: number, retryAfter: number | undefined): number => {
    const ceiling = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (retryNumber - 1));
    const jitter = Math.floor(random() * ceiling);
    return retryAfter === undefined ? jitter : Math.max(jitter, retryAfter);
  };

  async function ask<const Qs extends JevQuestions>(
    state: string,
    questions: Qs,
    options: AskOptions = {},
  ): Promise<JevResult<Qs>> {
    // Everything that can throw — including the injected clock — runs inside
    // this boundary. `call` holds only plain values, so building it cannot throw.
    const call = { startedAt: Number.NaN, attempts: 0, key: "" };
    const elapsed = (): number => {
      try {
        const ms = now() - call.startedAt;
        return Number.isFinite(ms) ? ms : 0;
      } catch {
        return 0;
      }
    };
    const fail = (f: JevFailure): JevResult<Qs> => ({
      ok: false,
      // Redact BEFORE truncating, so a cut can never leave a key fragment behind.
      failure: { ...f, message: redact(f.message, call.key).slice(0, MAX_MESSAGE_CHARS) },
      attempts: call.attempts,
      elapsedMs: elapsed(),
    });

    try {
      // Read first, so any later error message — even from the clock — is
      // scrubbed of it. Reading the key sends nothing; a missing key still
      // refuses only after the other refusals have run.
      call.key = resolveKey(config.apiKey);
      call.startedAt = now();
      return await attempt(state, questions, options, call, fail);
    } catch (err) {
      return fail({
        kind: "exhausted",
        message: `internal error: ${errorText(err)}`,
        sent: call.attempts > 0,
        lastOutcome: "network",
      });
    }
  }

  async function attempt<Qs extends JevQuestions>(
    state: string,
    questions: Qs,
    options: AskOptions,
    call: { startedAt: number; attempts: number; key: string },
    fail: (f: JevFailure) => JevResult<Qs>,
  ): Promise<JevResult<Qs>> {
    // ── Refusals: nothing is sent unless all pass. Order is shape → size → scan. ──
    if (typeof state !== "string" || state.trim() === "") {
      return fail({ kind: "invalid_request", message: "state is empty", sent: false });
    }
    if (typeof questions !== "object" || questions === null || Array.isArray(questions)) {
      return fail({ kind: "invalid_request", message: "questions must be an object", sent: false });
    }
    const entries = Object.entries(questions) as [string, JevQuestion][];
    if (entries.length === 0) return fail({ kind: "invalid_request", message: "no questions", sent: false });
    for (const [name, q] of entries) {
      const problem = name === "" ? "a question key is empty" : questionProblem(q);
      if (problem) return fail({ kind: "invalid_request", message: `question "${name}": ${problem}`, sent: false });
    }
    // The body is built from known fields only, and it is this object that is
    // sized, scanned and sent — so what is scanned is exactly what leaves.
    const wire = wireQuestions(questions);

    // AC-KIT-015.18: size first. It is O(1) per string, so a 1M-char state is
    // refused before the scan reads a character of it.
    const oversize = sizeProblem(state, wire);
    if (oversize) {
      return fail({
        kind: "state_too_large",
        message: `estimated ${oversize.estimatedTokens} tokens exceeds ${oversize.limit}`,
        sent: false,
        ...oversize,
      });
    }
    if (options?.allowPersonalData !== true) {
      const detected = new Set<PersonalDataKind>();
      for (const s of [state, ...sentStrings(wire)]) for (const k of detectPersonalData(s)) detected.add(k);
      if (detected.size > 0) {
        return fail({
          kind: "personal_data",
          message: `refused: personal data detected (${[...detected].join(", ")}); Jev has no zero data retention`,
          sent: false,
          detected: [...detected],
        });
      }
    }
    if (call.key === "") return fail({ kind: "missing_key", message: `no gateway key; set ${JEV_KEY_ENV}`, sent: false });

    // ── Attempts (@REQ-KIT-014) ──
    const fetchFn: FetchLike = config.fetch ?? ((input, init) => globalThis.fetch(input, init));
    const body = JSON.stringify({ model: JEV_MODEL, state, questions: wire });
    const deadline = call.startedAt + policy.totalBudgetMs;
    let last: { outcome: RetryableOutcome; status?: number; message: string } = {
      outcome: "timeout",
      message: "budget elapsed before the first attempt",
    };

    /** Waits only if another attempt is allowed and the wait ends inside the budget (AC-KIT-014.8). */
    const waitWithin = async (ms: number): Promise<boolean> => {
      if (call.attempts >= policy.maxAttempts) return false;
      if (now() + ms >= deadline) return false;
      await sleep(ms);
      return true;
    };

    while (call.attempts < policy.maxAttempts && now() < deadline) {
      call.attempts += 1;
      // AC-KIT-014.6: never wait on one attempt longer than the budget has left.
      const timeoutMs = Math.max(0, Math.min(policy.attemptTimeoutMs, deadline - now()));
      const controller = new AbortController();
      // The timer both aborts the signal AND rejects this race, so a fetch (or
      // a body read) that ignores its signal is still cut off on time.
      let onTimeout: () => void = () => {};
      const timedOut = new Promise<never>((_, reject) => {
        onTimeout = () => {
          controller.abort();
          reject(new AttemptTimeout());
        };
      });
      timedOut.catch(() => {}); // settled only through the races below
      const timer = setTimeout(() => onTimeout(), timeoutMs);
      let res: Response;
      let text: string;
      try {
        res = await Promise.race([
          fetchFn(JEV_ENDPOINT, {
            method: "POST",
            headers: { Authorization: `Bearer ${call.key}`, "Content-Type": "application/json" },
            body,
            signal: controller.signal,
          }),
          timedOut,
        ]);
        text = await Promise.race([res.text(), timedOut]);
      } catch (err) {
        const isTimeout = err instanceof AttemptTimeout || controller.signal.aborted;
        last = {
          outcome: isTimeout ? "timeout" : "network",
          message: isTimeout ? `no response within ${timeoutMs} ms` : `transport error: ${errorText(err)}`,
        };
        if (!(await waitWithin(backoff(call.attempts, undefined)))) break;
        continue;
      } finally {
        clearTimeout(timer);
      }

      if (res.ok) return read(text, wire, call, fail);

      const outcome = retryableOutcome(res.status);
      if (outcome === null) {
        const kind = res.status === 401 || res.status === 403 ? "auth" : "rejected";
        return fail({ kind, status: res.status, message: `HTTP ${res.status}: ${upstreamMessage(text)}`, sent: true });
      }
      last = { outcome, status: res.status, message: `HTTP ${res.status}: ${upstreamMessage(text)}` };
      if (!(await waitWithin(backoff(call.attempts, retryAfterMs(res.headers.get("retry-after"), now()))))) break;
    }

    return fail({
      kind: "exhausted",
      message: `gave up after ${call.attempts} attempt(s): ${last.message}`,
      sent: call.attempts > 0,
      lastOutcome: last.outcome,
      ...(last.status === undefined ? {} : { status: last.status }),
    });
  }

  function read<Qs extends JevQuestions>(
    text: string,
    wire: Record<string, JevQuestion>,
    call: { startedAt: number; attempts: number },
    fail: (f: JevFailure) => JevResult<Qs>,
  ): JevResult<Qs> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return fail({ kind: "bad_response", message: "2xx body is not JSON", sent: true });
    }
    const root = asRecord(parsed);
    const answers = asRecord(root?.answers);
    if (!root || !answers) return fail({ kind: "bad_response", message: "2xx body has no answers", sent: true });
    for (const [name, q] of Object.entries(wire)) {
      const problem = answerProblem(q, answers[name]);
      if (problem) return fail({ kind: "bad_response", message: `answer "${name}": ${problem}`, sent: true });
    }
    return {
      ok: true,
      answers: answers as unknown as JevAnswers<Qs>,
      usage: readUsage(root),
      attempts: call.attempts,
      elapsedMs: now() - call.startedAt,
    };
  }

  return { ask };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Explicit key, else the environment at call time, with the fleet's env-newline guard (AC-KIT-013.16). */
function resolveKey(explicit: string | undefined): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const raw = explicit ?? env?.[JEV_KEY_ENV] ?? "";
  return raw.replace(/(?:\\n|\s)+$/, "").trim();
}

/** 408, 429 and 5xx are transient; every other 4xx is final (AC-KIT-013.20, .21). */
function retryableOutcome(status: number): RetryableOutcome | null {
  if (status === 429) return "rate_limited";
  if (status === 503) return "unavailable";
  if (status === 408) return "timeout";
  if (status >= 400 && status < 500) return null;
  return "server_error";
}

/** Retry-After as milliseconds from now: delta-seconds or HTTP-date (RFC 9110 §10.2.3). */
function retryAfterMs(header: string | null, nowMs: number): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const at = Date.parse(trimmed);
  return Number.isNaN(at) ? undefined : Math.max(0, at - nowMs);
}

/**
 * Validates one answer against the question asked under its key
 * (AC-KIT-013.9, .10, AC-KIT-016.14, .15, .25, .26). The static type
 * `JevAnswers<Qs>` is only as true as this check, so every field the answer
 * type promises is checked here — not just the headline value.
 */
function answerProblem(q: JevQuestion, raw: unknown): string | null {
  const a = asRecord(raw);
  if (!a) return "missing";
  if (a.type !== q.type) return `type ${String(a.type)} does not match question type ${q.type}`;
  switch (q.type) {
    case "noul":
      return isProbability(a.noul) ? null : "noul is not a probability in 0..1";
    case "choice": {
      if (typeof a.choice !== "string" || !Object.hasOwn(q.criteria, a.choice)) return "choice is not an offered option";
      if (!isProbability(a.confidence)) return "confidence is not in 0..1";
      return probabilitiesProblem(a.probabilities, new Set(Object.keys(q.criteria)));
    }
    case "score": {
      const top = q.criteria.length - 1;
      if (typeof a.score !== "number" || !Number.isFinite(a.score)) return "score is not a number";
      if (a.score < 0 || a.score > top) return `score is outside 0..${top}`;
      if (!isProbability(a.confidence)) return "confidence is not in 0..1";
      return probabilitiesProblem(a.probabilities, new Set(q.criteria.map((_, i) => String(i))));
    }
  }
}

/** A probabilities map must exist, name only known options or levels, and hold values in 0..1. */
function probabilitiesProblem(raw: unknown, allowed: Set<string>): string | null {
  const p = asRecord(raw);
  if (!p) return "probabilities are missing";
  for (const [k, v] of Object.entries(p)) {
    if (!allowed.has(k)) return `probability for unknown option "${k}"`;
    if (!isProbability(v)) return `probability for "${k}" is not in 0..1`;
  }
  return null;
}

function readUsage(root: Record<string, unknown>): JevUsage {
  const usage = asRecord(root.usage);
  const gateway = asRecord(asRecord(root.provider_metadata)?.gateway);
  const out: JevUsage = {
    inputTokens: numberOr(usage?.input_tokens, 0),
    outputTokens: numberOr(usage?.output_tokens, 0),
  };
  // A cost the response did not carry is unknown, not free (AC-KIT-013.26).
  const cost = decimal(gateway?.cost);
  const marketCost = decimal(gateway?.marketCost);
  if (cost !== undefined) out.cost = cost;
  if (marketCost !== undefined) out.marketCost = marketCost;
  return out;
}

/** The gateway sends cost as a decimal STRING ("0.0000137"). */
function decimal(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\s*-?\d+(\.\d+)?([eE][-+]?\d+)?\s*$/.test(v)) return Number(v);
  return undefined;
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function isProbability(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function upstreamMessage(text: string): string {
  let msg = text;
  try {
    const err = asRecord(asRecord(JSON.parse(text))?.error);
    if (err) msg = [err.type, err.message].filter((x) => typeof x === "string").join(": ") || text;
  } catch {
    // not JSON — keep the raw text
  }
  return msg || "(empty body)";
}

function errorText(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

/**
 * Strips the gateway key from any text before it enters a result
 * (AC-KIT-013.18). Any non-empty key is scrubbed, however short. Upstream
 * bodies and transport errors are not ours to trust, so the scrub runs on
 * every failure message — and also blanks any `Bearer <token>`, in case a
 * different key is echoed.
 */
function redact(text: string, key: string): string {
  let out = text;
  if (key.length > 0) out = out.split(key).join("[redacted]");
  return out.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}
