// src/guards.ts
var SEP = String.raw`(?:[ \t]{0,3}[-./][ \t]{0,3}|[ \t])?`;
var PHONE_NANP = new RegExp(
  String.raw`(?<![\d+])(?:\+?1${SEP})?(?:\([2-9]\d{2}\)[ \t]?|[2-9]\d{2}${SEP})\d{3}${SEP}\d{4}(?!\d)`
);
var PHONE_INTL = /(?<![\w+])\+(?:\d[\s().-]?){7,14}\d(?!\d)/;
var SSN = /(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/;
var CARD_CANDIDATE = /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g;
function detectPersonalData(text) {
  const found = [];
  if (containsEmail(text)) found.push("email");
  if (PHONE_NANP.test(text) || PHONE_INTL.test(text)) found.push("phone");
  if (SSN.test(text)) found.push("ssn");
  for (const m of text.matchAll(CARD_CANDIDATE)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) {
      found.push("card");
      break;
    }
  }
  return found;
}
var LOCAL_CHAR = /[A-Za-z0-9._%+-]/;
var DOMAIN_CHAR = /[A-Za-z0-9.-]/;
var LABEL = /^[A-Za-z0-9-]+$/;
var TLD = /^[A-Za-z]{2,}$/;
function containsEmail(text) {
  let at = text.indexOf("@");
  while (at !== -1) {
    let end = at + 1;
    while (end < text.length && DOMAIN_CHAR.test(text[end])) end += 1;
    if (at > 0 && LOCAL_CHAR.test(text[at - 1])) {
      const labels = text.slice(at + 1, end).replace(/\.+$/, "").split(".");
      if (labels.length >= 2 && labels.every((l) => LABEL.test(l)) && TLD.test(labels[labels.length - 1])) return true;
    }
    at = text.indexOf("@", end);
  }
  return false;
}
function luhnValid(digits) {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}
function wireQuestions(questions) {
  const out = {};
  for (const [key, q] of Object.entries(questions)) {
    if (q.type === "noul") {
      out[key] = q.criteria === void 0 ? { type: "noul", instructions: q.instructions } : { type: "noul", instructions: q.instructions, criteria: { true: q.criteria.true, false: q.criteria.false } };
    } else if (q.type === "choice") {
      out[key] = { type: "choice", instructions: q.instructions, criteria: { ...q.criteria } };
    } else {
      out[key] = { type: "score", instructions: q.instructions, criteria: [...q.criteria] };
    }
  }
  return out;
}
function sentStrings(value, into = []) {
  if (typeof value === "string") into.push(value);
  else if (Array.isArray(value)) for (const v of value) sentStrings(v, into);
  else if (typeof value === "object" && value !== null) {
    for (const [k, v] of Object.entries(value)) {
      into.push(k);
      sentStrings(v, into);
    }
  }
  return into;
}
var STATE_PLUS_LONGEST_QUESTION_LIMIT = 32e3;
var REQUEST_TOTAL_LIMIT = 64e3;
function estimateTokens(text) {
  return Math.ceil(text.length / 3);
}
function sizeProblem(state, questions) {
  const stateTokens = estimateTokens(state);
  const qTokens = Object.entries(questions).map(([k, q]) => estimateTokens(k) + estimateTokens(JSON.stringify(q)));
  const longest = stateTokens + Math.max(0, ...qTokens);
  if (longest > STATE_PLUS_LONGEST_QUESTION_LIMIT) {
    return { estimatedTokens: longest, limit: STATE_PLUS_LONGEST_QUESTION_LIMIT };
  }
  const total = stateTokens + qTokens.reduce((a, b) => a + b, 0);
  if (total > REQUEST_TOTAL_LIMIT) return { estimatedTokens: total, limit: REQUEST_TOTAL_LIMIT };
  return null;
}

// src/questions.ts
var MAX_CHOICE_OPTIONS = 255;
var MIN_SCORE_LEVELS = 2;
var MAX_SCORE_LEVELS = 10;
function questionProblem(q) {
  if (typeof q !== "object" || q === null) return "question is not an object";
  if (typeof q.instructions !== "string" || q.instructions.trim() === "") return "instructions are empty";
  switch (q.type) {
    case "noul":
      if (q.criteria === void 0) return null;
      if (typeof q.criteria !== "object" || q.criteria === null) return "noul criteria must be an object";
      if (!nonEmpty(q.criteria.true) || !nonEmpty(q.criteria.false)) {
        return "noul criteria need both true and false descriptions";
      }
      return null;
    case "choice": {
      if (typeof q.criteria !== "object" || q.criteria === null || Array.isArray(q.criteria)) {
        return "choice options must be an object";
      }
      const keys = Object.keys(q.criteria);
      if (keys.length < 2) return "choice needs at least 2 options";
      if (keys.length > MAX_CHOICE_OPTIONS) return `choice allows at most ${MAX_CHOICE_OPTIONS} options`;
      if (keys.some((k) => k === "" || !nonEmpty(q.criteria[k]))) return "choice options need a key and a description";
      return null;
    }
    case "score": {
      const n = Array.isArray(q.criteria) ? q.criteria.length : 0;
      if (n < MIN_SCORE_LEVELS) return `score needs at least ${MIN_SCORE_LEVELS} levels`;
      if (n > MAX_SCORE_LEVELS) return `score allows at most ${MAX_SCORE_LEVELS} levels`;
      if (q.criteria.some((l) => !nonEmpty(l))) return "score levels need a description";
      return null;
    }
    default:
      return "unknown question type";
  }
}
function nonEmpty(s) {
  return typeof s === "string" && s.trim() !== "";
}
function assertSound(q) {
  const problem = questionProblem(q);
  if (problem) throw new RangeError(problem);
  return q;
}
function noul(instructions, criteria) {
  return assertSound(criteria === void 0 ? { type: "noul", instructions } : { type: "noul", instructions, criteria });
}
function choice(instructions, options) {
  return assertSound({ type: "choice", instructions, criteria: options });
}
function score(instructions, levels) {
  return assertSound({ type: "score", instructions, criteria: [...levels] });
}

// src/client.ts
var JEV_ENDPOINT = "https://ai-gateway.vercel.sh/typesafe/v1/systemone";
var JEV_MODEL = "typesafe-ai/jev";
var JEV_KEY_ENV = "AI_GATEWAY_API_KEY";
var RETRY_DEFAULTS = {
  maxAttempts: 5,
  attemptTimeoutMs: 3e3,
  totalBudgetMs: 8e3,
  baseDelayMs: 250,
  maxDelayMs: 4e3
};
var MAX_MESSAGE_CHARS = 300;
var AttemptTimeout = class extends Error {
};
function createJevClient(config = {}) {
  const policy = {
    maxAttempts: config.maxAttempts ?? RETRY_DEFAULTS.maxAttempts,
    attemptTimeoutMs: config.attemptTimeoutMs ?? RETRY_DEFAULTS.attemptTimeoutMs,
    totalBudgetMs: config.totalBudgetMs ?? RETRY_DEFAULTS.totalBudgetMs,
    baseDelayMs: config.baseDelayMs ?? RETRY_DEFAULTS.baseDelayMs,
    maxDelayMs: config.maxDelayMs ?? RETRY_DEFAULTS.maxDelayMs
  };
  const now = config.now ?? Date.now;
  const sleep = config.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const random = config.random ?? Math.random;
  const backoff = (retryNumber, retryAfter) => {
    const ceiling = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (retryNumber - 1));
    const jitter = Math.floor(random() * ceiling);
    return retryAfter === void 0 ? jitter : Math.max(jitter, retryAfter);
  };
  async function ask(state, questions, options = {}) {
    const call = { startedAt: Number.NaN, attempts: 0, key: "" };
    const elapsed = () => {
      try {
        const ms = now() - call.startedAt;
        return Number.isFinite(ms) ? ms : 0;
      } catch {
        return 0;
      }
    };
    const fail = (f) => ({
      ok: false,
      // Redact BEFORE truncating, so a cut can never leave a key fragment behind.
      failure: { ...f, message: redact(f.message, call.key).slice(0, MAX_MESSAGE_CHARS) },
      attempts: call.attempts,
      elapsedMs: elapsed()
    });
    try {
      call.key = resolveKey(config.apiKey);
      call.startedAt = now();
      return await attempt(state, questions, options, call, fail);
    } catch (err) {
      return fail({
        kind: "exhausted",
        message: `internal error: ${errorText(err)}`,
        sent: call.attempts > 0,
        lastOutcome: "network"
      });
    }
  }
  async function attempt(state, questions, options, call, fail) {
    if (typeof state !== "string" || state.trim() === "") {
      return fail({ kind: "invalid_request", message: "state is empty", sent: false });
    }
    if (typeof questions !== "object" || questions === null || Array.isArray(questions)) {
      return fail({ kind: "invalid_request", message: "questions must be an object", sent: false });
    }
    const entries = Object.entries(questions);
    if (entries.length === 0) return fail({ kind: "invalid_request", message: "no questions", sent: false });
    for (const [name, q] of entries) {
      const problem = name === "" ? "a question key is empty" : questionProblem(q);
      if (problem) return fail({ kind: "invalid_request", message: `question "${name}": ${problem}`, sent: false });
    }
    const wire = wireQuestions(questions);
    const oversize = sizeProblem(state, wire);
    if (oversize) {
      return fail({
        kind: "state_too_large",
        message: `estimated ${oversize.estimatedTokens} tokens exceeds ${oversize.limit}`,
        sent: false,
        ...oversize
      });
    }
    if (options?.allowPersonalData !== true) {
      const detected = /* @__PURE__ */ new Set();
      for (const s of [state, ...sentStrings(wire)]) for (const k of detectPersonalData(s)) detected.add(k);
      if (detected.size > 0) {
        return fail({
          kind: "personal_data",
          message: `refused: personal data detected (${[...detected].join(", ")}); Jev has no zero data retention`,
          sent: false,
          detected: [...detected]
        });
      }
    }
    if (call.key === "") return fail({ kind: "missing_key", message: `no gateway key; set ${JEV_KEY_ENV}`, sent: false });
    const fetchFn = config.fetch ?? ((input, init) => globalThis.fetch(input, init));
    const body = JSON.stringify({ model: JEV_MODEL, state, questions: wire });
    const deadline = call.startedAt + policy.totalBudgetMs;
    let last = {
      outcome: "timeout",
      message: "budget elapsed before the first attempt"
    };
    const waitWithin = async (ms) => {
      if (call.attempts >= policy.maxAttempts) return false;
      if (now() + ms >= deadline) return false;
      await sleep(ms);
      return true;
    };
    while (call.attempts < policy.maxAttempts && now() < deadline) {
      call.attempts += 1;
      const timeoutMs = Math.max(0, Math.min(policy.attemptTimeoutMs, deadline - now()));
      const controller = new AbortController();
      let onTimeout = () => {
      };
      const timedOut = new Promise((_, reject) => {
        onTimeout = () => {
          controller.abort();
          reject(new AttemptTimeout());
        };
      });
      timedOut.catch(() => {
      });
      const timer = setTimeout(() => onTimeout(), timeoutMs);
      let res;
      let text;
      try {
        res = await Promise.race([
          fetchFn(JEV_ENDPOINT, {
            method: "POST",
            headers: { Authorization: `Bearer ${call.key}`, "Content-Type": "application/json" },
            body,
            signal: controller.signal
          }),
          timedOut
        ]);
        text = await Promise.race([res.text(), timedOut]);
      } catch (err) {
        const isTimeout = err instanceof AttemptTimeout || controller.signal.aborted;
        last = {
          outcome: isTimeout ? "timeout" : "network",
          message: isTimeout ? `no response within ${timeoutMs} ms` : `transport error: ${errorText(err)}`
        };
        if (!await waitWithin(backoff(call.attempts, void 0))) break;
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
      if (!await waitWithin(backoff(call.attempts, retryAfterMs(res.headers.get("retry-after"), now())))) break;
    }
    return fail({
      kind: "exhausted",
      message: `gave up after ${call.attempts} attempt(s): ${last.message}`,
      sent: call.attempts > 0,
      lastOutcome: last.outcome,
      ...last.status === void 0 ? {} : { status: last.status }
    });
  }
  function read(text, wire, call, fail) {
    let parsed;
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
      answers,
      usage: readUsage(root),
      attempts: call.attempts,
      elapsedMs: now() - call.startedAt
    };
  }
  return { ask };
}
function resolveKey(explicit) {
  const env = globalThis.process?.env;
  const raw = explicit ?? env?.[JEV_KEY_ENV] ?? "";
  return raw.replace(/(?:\\n|\s)+$/, "").trim();
}
function retryableOutcome(status) {
  if (status === 429) return "rate_limited";
  if (status === 503) return "unavailable";
  if (status === 408) return "timeout";
  if (status >= 400 && status < 500) return null;
  return "server_error";
}
function retryAfterMs(header, nowMs) {
  if (!header) return void 0;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1e3;
  const at = Date.parse(trimmed);
  return Number.isNaN(at) ? void 0 : Math.max(0, at - nowMs);
}
function answerProblem(q, raw) {
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
function probabilitiesProblem(raw, allowed) {
  const p = asRecord(raw);
  if (!p) return "probabilities are missing";
  for (const [k, v] of Object.entries(p)) {
    if (!allowed.has(k)) return `probability for unknown option "${k}"`;
    if (!isProbability(v)) return `probability for "${k}" is not in 0..1`;
  }
  return null;
}
function readUsage(root) {
  const usage = asRecord(root.usage);
  const gateway = asRecord(asRecord(root.provider_metadata)?.gateway);
  const out = {
    inputTokens: numberOr(usage?.input_tokens, 0),
    outputTokens: numberOr(usage?.output_tokens, 0)
  };
  const cost = decimal(gateway?.cost);
  const marketCost = decimal(gateway?.marketCost);
  if (cost !== void 0) out.cost = cost;
  if (marketCost !== void 0) out.marketCost = marketCost;
  return out;
}
function decimal(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\s*-?\d+(\.\d+)?([eE][-+]?\d+)?\s*$/.test(v)) return Number(v);
  return void 0;
}
function numberOr(v, fallback) {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function isProbability(v) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
}
function asRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? v : null;
}
function upstreamMessage(text) {
  let msg = text;
  try {
    const err = asRecord(asRecord(JSON.parse(text))?.error);
    if (err) msg = [err.type, err.message].filter((x) => typeof x === "string").join(": ") || text;
  } catch {
  }
  return msg || "(empty body)";
}
function errorText(err) {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}
function redact(text, key) {
  let out = text;
  if (key.length > 0) out = out.split(key).join("[redacted]");
  return out.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

// src/decide.ts
function decide(probability, thresholds) {
  const { yesAtOrAbove: yes, noAtOrBelow: no } = thresholds;
  if (!inUnitRange(yes) || !inUnitRange(no)) throw new RangeError("thresholds must lie in 0..1");
  if (!(no < yes)) throw new RangeError("noAtOrBelow must be less than yesAtOrAbove");
  if (!inUnitRange(probability)) return "unsure";
  if (probability >= yes) return "yes";
  if (probability <= no) return "no";
  return "unsure";
}
function decideChoice(answer, floor) {
  return Number.isFinite(answer.confidence) && answer.confidence >= floor.minConfidence ? answer.choice : "unsure";
}
function inUnitRange(n) {
  return Number.isFinite(n) && n >= 0 && n <= 1;
}
export {
  JEV_ENDPOINT,
  JEV_KEY_ENV,
  JEV_MODEL,
  choice,
  createJevClient,
  decide,
  decideChoice,
  detectPersonalData,
  estimateTokens,
  noul,
  score
};
