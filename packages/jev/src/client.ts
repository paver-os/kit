/**
 * #JevDecisionClient — the one way a product calls Jev (@REQ-KIT-013, -014).
 *
 * Invariant: `ask` never rejects. Every path — refusal, provider error,
 * network error, timeout, malformed body, even a throwing injected clock —
 * resolves to a `JevResult`, and the `ok` discriminant makes the caller's type
 * checker demand a fallback branch. The gateway returned 429/503 on most calls
 * during the 2026-09-25 launch load, so a failure here is ordinary.
 *
 * Since v0.2.0 (@REQ-KIT-017) every call goes to the OpenAI-compatible
 * `/v1/decisions` endpoint with a versioned, image-capable Jev and REQUIRES
 * zero data retention; the wire translation lives in #DecisionsWire (wire.ts).
 */
import { detectPersonalData, sentStrings, sizeProblem } from "./guards.ts";
import { asRecord, NO_ZDR_ERROR_TYPE, prepareImages, readAnswer, wireBody, wireQuestions, type WireQuestion } from "./wire.ts";
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

/**
 * Verified live 2026-10-31. The versioned model accepts images and lists
 * `zdr: all`; plain `typesafe-ai/jev` lists `zdr: some` and is text-only.
 */
export const JEV_ENDPOINT = "https://ai-gateway.vercel.sh/v1/decisions";
export const JEV_MODEL = "typesafe-ai/jev-1.14.0";
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
  const model = config.model ?? JEV_MODEL;

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
    const prepared = prepareImages(options?.images);
    if ("problem" in prepared) return fail({ kind: "invalid_request", message: prepared.problem, sent: false });
    const images = prepared.images;
    // A call about images alone may carry an empty state (AC-KIT-017.6).
    if (typeof state !== "string" || (state.trim() === "" && images.length === 0)) {
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
    const oversize = sizeProblem(state, wire, images);
    if (oversize) {
      return fail({
        kind: "state_too_large",
        message: `estimated ${oversize.estimatedTokens} tokens exceeds ${oversize.limit}`,
        sent: false,
        ...oversize,
      });
    }
    // Images are NOT scanned — a pattern net cannot read pixels, and base64
    // would trip it at random. They are allowed only because every call
    // requires zero data retention (AC-KIT-017.3, .13).
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
    const body = JSON.stringify(wireBody(model, state, wire, images));
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

      if (res.ok) return read(text, questions, call, fail);

      const outcome = retryableOutcome(res.status);
      if (outcome === null) {
        if (res.status === 400 && upstreamType(text) === NO_ZDR_ERROR_TYPE) {
          return fail({
            kind: "no_zdr_provider",
            status: 400,
            message: `no provider for ${model} satisfies zero data retention: ${upstreamMessage(text)}`,
            sent: true,
          });
        }
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
    questions: Qs,
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
    if (!root || !Array.isArray(root.answers)) return fail({ kind: "bad_response", message: "2xx body has no answers", sent: true });
    // Answers are matched by NAME, never by position (AC-KIT-017.15).
    const byName = new Map<string, Record<string, unknown>>();
    for (const a of root.answers) {
      const rec = asRecord(a);
      if (rec && typeof rec.name === "string" && !byName.has(rec.name)) byName.set(rec.name, rec);
    }
    const answers: Record<string, unknown> = {};
    for (const [name, q] of Object.entries(questions)) {
      const got = readAnswer(q, byName.get(name) ?? null);
      if ("problem" in got) return fail({ kind: "bad_response", message: `answer "${name}": ${got.problem}`, sent: true });
      answers[name] = got.answer;
    }
    return {
      ok: true,
      answers: answers as JevAnswers<Qs>,
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
  const provider = asRecord(gateway?.routing)?.finalProvider;
  if (typeof provider === "string" && provider !== "") out.provider = provider;
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

function upstreamType(text: string): string | undefined {
  try {
    const t = asRecord(asRecord(JSON.parse(text))?.error)?.type;
    return typeof t === "string" ? t : undefined;
  } catch {
    return undefined;
  }
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
