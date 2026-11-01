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
var IMAGE_TOKEN_ESTIMATE = { low: 1100, high: 4400, auto: 4400 };
function estimateImageTokens(images) {
  return images.reduce((sum, img) => sum + IMAGE_TOKEN_ESTIMATE[img.detail], 0);
}
function sizeProblem(state, questions, images = []) {
  const stateTokens = estimateTokens(state) + estimateImageTokens(images);
  const qTokens = questions.map((q) => estimateTokens(JSON.stringify(q)));
  const longest = stateTokens + Math.max(0, ...qTokens);
  if (longest > STATE_PLUS_LONGEST_QUESTION_LIMIT) {
    return { estimatedTokens: longest, limit: STATE_PLUS_LONGEST_QUESTION_LIMIT };
  }
  const total = stateTokens + qTokens.reduce((a, b) => a + b, 0);
  if (total > REQUEST_TOTAL_LIMIT) return { estimatedTokens: total, limit: REQUEST_TOTAL_LIMIT };
  return null;
}
var JEV_MIN_SHORT_EDGE = 280;
var JEV_MAX_ASPECT = 5;
function imageSize(b) {
  const n = b.length;
  const u16be = (i) => b[i] << 8 | b[i + 1];
  const u16le = (i) => b[i] | b[i + 1] << 8;
  const u24le = (i) => b[i] | b[i + 1] << 8 | b[i + 2] << 16;
  const ascii = (i, s) => {
    for (let k = 0; k < s.length; k += 1) if (b[i + k] !== s.charCodeAt(k)) return false;
    return true;
  };
  const ok = (width, height) => width > 0 && height > 0 ? { width, height } : null;
  if (n >= 24 && b[0] === 137 && ascii(1, "PNG") && ascii(12, "IHDR")) {
    return ok((b[16] << 24 >>> 0) + (b[17] << 16) + (b[18] << 8) + b[19], (b[20] << 24 >>> 0) + (b[21] << 16) + (b[22] << 8) + b[23]);
  }
  if (n >= 10 && (ascii(0, "GIF87a") || ascii(0, "GIF89a"))) return ok(u16le(6), u16le(8));
  if (n >= 30 && ascii(0, "RIFF") && ascii(8, "WEBP")) {
    if (ascii(12, "VP8 ") && b[23] === 157 && b[24] === 1 && b[25] === 42) return ok(u16le(26) & 16383, u16le(28) & 16383);
    if (ascii(12, "VP8L") && b[20] === 47) {
      const bits = (b[21] | b[22] << 8 | b[23] << 16 | b[24] << 24) >>> 0;
      return ok((bits & 16383) + 1, (bits >>> 14 & 16383) + 1);
    }
    if (ascii(12, "VP8X")) return ok(u24le(24) + 1, u24le(27) + 1);
    return null;
  }
  if (n >= 4 && b[0] === 255 && b[1] === 216) {
    let i = 2;
    while (i + 3 < n) {
      if (b[i] !== 255) return null;
      const m = b[i + 1];
      if (m === 255) {
        i += 1;
        continue;
      }
      if (m === 216 || m === 1 || m >= 208 && m <= 215) {
        i += 2;
        continue;
      }
      if (m === 217 || m === 218) return null;
      const len = u16be(i + 2);
      if (len < 2) return null;
      const isSof = m >= 192 && m <= 207 && m !== 196 && m !== 200 && m !== 204;
      if (isSof) return i + 8 < n ? ok(u16be(i + 7), u16be(i + 5)) : null;
      i += 2 + len;
    }
  }
  return null;
}
function imageDimensionProblem(index, size) {
  if (size === null) return null;
  const short = Math.min(size.width, size.height);
  const long = Math.max(size.width, size.height);
  if (short < JEV_MIN_SHORT_EDGE || long / short > JEV_MAX_ASPECT) {
    return `image ${index} is ${size.width}\xD7${size.height}: Invalid image dimensions \u2014 Jev needs a short edge of at least ${JEV_MIN_SHORT_EDGE} px and an aspect ratio of at most ${JEV_MAX_ASPECT}:1`;
  }
  return null;
}

// src/wire.ts
var NO_ZDR_ERROR_TYPE = "no_providers_available";
function wireQuestions(questions) {
  return Object.entries(questions).map(([name, q]) => {
    if (q.type === "noul") {
      const instructions = q.criteria === void 0 ? q.instructions : `${q.instructions}
Answer yes if: ${q.criteria.true}
Answer no if: ${q.criteria.false}`;
      return { type: "predicate", name, instructions };
    }
    if (q.type === "choice") {
      return {
        type: "choice",
        name,
        instructions: q.instructions,
        choices: Object.entries(q.criteria).map(([value, description]) => ({ value, description: String(description) }))
      };
    }
    return { type: "score", name, instructions: q.instructions, levels: q.criteria.map((label) => ({ label })) };
  });
}
var MAX_IMAGES = 128;
var MAX_IMAGE_BYTES = 5 * 1024 * 1024;
var IMAGE_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
var IMAGE_DETAILS = ["low", "high", "auto"];
var BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
function prepareImages(images) {
  if (images === void 0) return { images: [] };
  if (!Array.isArray(images)) return { problem: "images must be an array" };
  if (images.length > MAX_IMAGES) return { problem: `at most ${MAX_IMAGES} images per call (got ${images.length})` };
  const out = [];
  for (const [i, raw] of images.entries()) {
    const img = raw;
    if (typeof img !== "object" || img === null) return { problem: `image ${i} is not an object` };
    if (!IMAGE_MEDIA_TYPES.includes(img.mediaType)) {
      return { problem: `image ${i}: mediaType must be one of ${IMAGE_MEDIA_TYPES.join(", ")}` };
    }
    const detail = img.detail ?? "low";
    if (!IMAGE_DETAILS.includes(detail)) return { problem: `image ${i}: detail must be one of ${IMAGE_DETAILS.join(", ")}` };
    let base64;
    let bytes;
    if (img.data instanceof Uint8Array) {
      bytes = img.data.byteLength;
      if (bytes > MAX_IMAGE_BYTES) return { problem: `image ${i} is ${bytes} bytes; the limit is ${MAX_IMAGE_BYTES}` };
      base64 = bytesToBase64(img.data);
    } else if (typeof img.data === "string") {
      base64 = img.data.replace(/\s+/g, "");
      if (base64.startsWith("data:")) return { problem: `image ${i}: pass base64 without the data: prefix` };
      if (base64.length % 4 !== 0 || !BASE64.test(base64)) return { problem: `image ${i}: data is not base64` };
      bytes = base64.length / 4 * 3 - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
      if (bytes > MAX_IMAGE_BYTES) return { problem: `image ${i} is ${bytes} bytes; the limit is ${MAX_IMAGE_BYTES}` };
    } else {
      return { problem: `image ${i}: data must be a Uint8Array or a base64 string` };
    }
    if (bytes === 0) return { problem: `image ${i} is empty` };
    const header = img.data instanceof Uint8Array ? img.data : base64ToBytes(base64);
    const dims = imageDimensionProblem(i, imageSize(header));
    if (dims) return { problem: dims };
    out.push({ base64, bytes, mediaType: img.mediaType, detail });
  }
  return { images: out };
}
function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  }
  return btoa(binary);
}
function wireBody(model, state, questions, images) {
  const input = images.length === 0 ? state : [
    {
      role: "user",
      content: [
        ...state.trim() === "" ? [] : [{ type: "input_text", text: state }],
        ...images.map(
          (img) => ({ type: "input_image", image_url: `data:${img.mediaType};base64,${img.base64}`, detail: img.detail })
        )
      ]
    }
  ];
  return { model, input, questions, providerOptions: { gateway: { zeroDataRetention: true } } };
}
function readAnswer(q, raw) {
  if (!raw) return { problem: "missing" };
  if (raw.type === "refusal") return { answer: { type: "refusal", refused: true } };
  const wireType = q.type === "noul" ? "predicate" : q.type;
  if (raw.type !== wireType) return { problem: `type ${String(raw.type)} does not match question type ${wireType}` };
  switch (q.type) {
    case "noul":
      return isProbability(raw.probability) ? { answer: { type: "noul", noul: raw.probability } } : { problem: "predicate probability is not in 0..1" };
    case "choice": {
      if (typeof raw.choice !== "string" || !Object.hasOwn(q.criteria, raw.choice)) return { problem: "choice is not an offered option" };
      if (!isProbability(raw.confidence)) return { problem: "confidence is not in 0..1" };
      const probs = probabilityList(raw.probabilities, new Set(Object.keys(q.criteria)), (p) => p.value);
      if ("problem" in probs) return probs;
      return { answer: { type: "choice", choice: raw.choice, probabilities: probs.map, confidence: raw.confidence } };
    }
    case "score": {
      const top = q.criteria.length - 1;
      if (typeof raw.score !== "number" || !Number.isFinite(raw.score)) return { problem: "score is not a number" };
      if (raw.score < 0 || raw.score > top) return { problem: `score is outside 0..${top}` };
      if (!isProbability(raw.confidence)) return { problem: "confidence is not in 0..1" };
      const levels = new Set(q.criteria.map((_, i) => String(i)));
      const probs = probabilityList(raw.probabilities, levels, (p) => typeof p.value === "number" ? String(p.value) : void 0);
      if ("problem" in probs) return probs;
      const legend = Object.fromEntries(q.criteria.map((label, i) => [String(i), label]));
      return { answer: { type: "score", score: raw.score, probabilities: probs.map, confidence: raw.confidence, legend } };
    }
  }
}
function probabilityList(raw, allowed, keyOf) {
  if (!Array.isArray(raw)) return { problem: "probabilities are missing" };
  const map = {};
  for (const item of raw) {
    const p = asRecord(item);
    const key = p ? keyOf(p) : void 0;
    if (!p || typeof key !== "string" || !allowed.has(key)) return { problem: `probability for unknown option "${String(key)}"` };
    if (!isProbability(p.probability)) return { problem: `probability for "${key}" is not in 0..1` };
    map[key] = p.probability;
  }
  return { map };
}
function isProbability(v) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
}
function asRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? v : null;
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
var JEV_ENDPOINT = "https://ai-gateway.vercel.sh/v1/decisions";
var JEV_MODEL = "typesafe-ai/jev-1.14.0";
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
  const model = config.model ?? JEV_MODEL;
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
    const prepared = prepareImages(options?.images);
    if ("problem" in prepared) return fail({ kind: "invalid_request", message: prepared.problem, sent: false });
    const images = prepared.images;
    if (typeof state !== "string" || state.trim() === "" && images.length === 0) {
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
    const oversize = sizeProblem(state, wire, images);
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
    const body = JSON.stringify(wireBody(model, state, wire, images));
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
      if (res.ok) return read(text, questions, call, fail);
      const outcome = retryableOutcome(res.status);
      if (outcome === null) {
        if (res.status === 400 && upstreamType(text) === NO_ZDR_ERROR_TYPE) {
          return fail({
            kind: "no_zdr_provider",
            status: 400,
            message: `no provider for ${model} satisfies zero data retention: ${upstreamMessage(text)}`,
            sent: true
          });
        }
        if (res.status === 400 && upstreamMessage(text).includes("Invalid image dimensions")) {
          return fail({
            kind: "invalid_request",
            status: 400,
            message: `Invalid image dimensions \u2014 Jev needs a short edge of at least ${JEV_MIN_SHORT_EDGE} px and an aspect ratio of at most ${JEV_MAX_ASPECT}:1 (gateway: ${upstreamMessage(text)})`,
            sent: true
          });
        }
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
  function read(text, questions, call, fail) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return fail({ kind: "bad_response", message: "2xx body is not JSON", sent: true });
    }
    const root = asRecord(parsed);
    if (!root || !Array.isArray(root.answers)) return fail({ kind: "bad_response", message: "2xx body has no answers", sent: true });
    const byName = /* @__PURE__ */ new Map();
    for (const a of root.answers) {
      const rec = asRecord(a);
      if (rec && typeof rec.name === "string" && !byName.has(rec.name)) byName.set(rec.name, rec);
    }
    const answers = {};
    for (const [name, q] of Object.entries(questions)) {
      const got = readAnswer(q, byName.get(name) ?? null);
      if ("problem" in got) return fail({ kind: "bad_response", message: `answer "${name}": ${got.problem}`, sent: true });
      answers[name] = got.answer;
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
  const provider = asRecord(gateway?.routing)?.finalProvider;
  if (typeof provider === "string" && provider !== "") out.provider = provider;
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
function upstreamMessage(text) {
  let msg = text;
  try {
    const err = asRecord(asRecord(JSON.parse(text))?.error);
    if (err) msg = [err.type, err.message].filter((x) => typeof x === "string").join(": ") || text;
  } catch {
  }
  return msg || "(empty body)";
}
function upstreamType(text) {
  try {
    const t = asRecord(asRecord(JSON.parse(text))?.error)?.type;
    return typeof t === "string" ? t : void 0;
  } catch {
    return void 0;
  }
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
function isRefused(answer) {
  return typeof answer === "object" && answer !== null && answer.type === "refusal";
}
function decide(input, thresholds) {
  const { yesAtOrAbove: yes, noAtOrBelow: no } = thresholds;
  if (!inUnitRange(yes) || !inUnitRange(no)) throw new RangeError("thresholds must lie in 0..1");
  if (!(no < yes)) throw new RangeError("noAtOrBelow must be less than yesAtOrAbove");
  if (isRefused(input)) return "unsure";
  const probability = typeof input === "number" ? input : input.noul;
  if (!inUnitRange(probability)) return "unsure";
  if (probability >= yes) return "yes";
  if (probability <= no) return "no";
  return "unsure";
}
function decideChoice(answer, floor) {
  if (isRefused(answer)) return "unsure";
  return Number.isFinite(answer.confidence) && answer.confidence >= floor.minConfidence ? answer.choice : "unsure";
}
function inUnitRange(n) {
  return Number.isFinite(n) && n >= 0 && n <= 1;
}
export {
  IMAGE_TOKEN_ESTIMATE,
  JEV_ENDPOINT,
  JEV_KEY_ENV,
  JEV_MAX_ASPECT,
  JEV_MIN_SHORT_EDGE,
  JEV_MODEL,
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  choice,
  createJevClient,
  decide,
  decideChoice,
  detectPersonalData,
  estimateImageTokens,
  estimateTokens,
  imageDimensionProblem,
  imageSize,
  isRefused,
  noul,
  score
};
