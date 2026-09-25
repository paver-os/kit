/**
 * Pre-send refusals (@REQ-KIT-015): size and personal data. Both run before
 * the first attempt, so a refused call never leaves the process. Size runs
 * FIRST (AC-KIT-015.18): it costs O(1) per string, so a huge state is refused
 * before any scan reads it.
 *
 * The personal-data scan is a net for patterns a regex can see — it is NOT a
 * classifier. Names and street addresses pass it. The policy it enforces
 * (no personal text to Jev until zero data retention) is wider than the net.
 * Every pattern errs toward refusing: a refusal costs a fallback, a miss
 * costs a policy breach. Every pattern is bounded in length or hand-scanned,
 * so the whole scan is linear in its input (AC-KIT-015.19).
 */
import type { JevQuestion, PersonalDataKind } from "./types.ts";

// NANP: the area code starts 2-9, which keeps a Unix timestamp (starts with 1)
// and an ISO date (4-2-2 grouping) out. The exchange may start with any digit
// (801-123-4567 is a real form). Groups may be joined by nothing, a space, or a
// dash / dot / slash with optional spaces around it.
const SEP = String.raw`(?:[ \t]{0,3}[-./][ \t]{0,3}|[ \t])?`;
const PHONE_NANP = new RegExp(
  String.raw`(?<![\d+])(?:\+?1${SEP})?(?:\([2-9]\d{2}\)[ \t]?|[2-9]\d{2}${SEP})\d{3}${SEP}\d{4}(?!\d)`,
);
const PHONE_INTL = /(?<![\w+])\+(?:\d[\s().-]?){7,14}\d(?!\d)/;
const SSN = /(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/;
const CARD_CANDIDATE = /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g;

// A bare 7-digit local number (555-1234) is deliberately NOT a phone: it is
// indistinguishable from part numbers, invoice numbers and ranges
// (AC-KIT-015.21).

/** Returns the kinds of personal data found in `text`, never the text itself. (AC-KIT-015.12) */
export function detectPersonalData(text: string): PersonalDataKind[] {
  const found: PersonalDataKind[] = [];
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

const LOCAL_CHAR = /[A-Za-z0-9._%+-]/;
const DOMAIN_CHAR = /[A-Za-z0-9.-]/;
const LABEL = /^[A-Za-z0-9-]+$/;
const TLD = /^[A-Za-z]{2,}$/;

/**
 * Email detection without a backtracking regex. The obvious pattern
 * `[local]+@[domain]+\.[tld]` re-scans a long run of local-part characters
 * from every start position — quadratic, 3.7 s on 96k characters with no '@'.
 * Here each '@' is examined once: one local-part character before it, then the
 * domain run after it. A domain run cannot contain '@', so the scan resumes
 * past it and no character is read twice.
 */
function containsEmail(text: string): boolean {
  let at = text.indexOf("@");
  while (at !== -1) {
    let end = at + 1;
    while (end < text.length && DOMAIN_CHAR.test(text[end]!)) end += 1;
    if (at > 0 && LOCAL_CHAR.test(text[at - 1]!)) {
      const labels = text.slice(at + 1, end).replace(/\.+$/, "").split(".");
      if (labels.length >= 2 && labels.every((l) => LABEL.test(l)) && TLD.test(labels[labels.length - 1]!)) return true;
    }
    at = text.indexOf("@", end);
  }
  return false;
}

function luhnValid(digits: string): boolean {
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

// ── What is sent ─────────────────────────────────────────────────────────────

/**
 * The questions exactly as they go on the wire: `type`, `instructions`,
 * `criteria`, nothing else (AC-KIT-015.20). An extra field a caller attached
 * is dropped here, so it can neither carry data out nor escape the scan.
 * Callers must pass questions that already passed `questionProblem`.
 */
export function wireQuestions(questions: Record<string, JevQuestion>): Record<string, JevQuestion> {
  const out: Record<string, JevQuestion> = {};
  for (const [key, q] of Object.entries(questions)) {
    if (q.type === "noul") {
      out[key] =
        q.criteria === undefined
          ? { type: "noul", instructions: q.instructions }
          : { type: "noul", instructions: q.instructions, criteria: { true: q.criteria.true, false: q.criteria.false } };
    } else if (q.type === "choice") {
      out[key] = { type: "choice", instructions: q.instructions, criteria: { ...q.criteria } };
    } else {
      out[key] = { type: "score", instructions: q.instructions, criteria: [...q.criteria] };
    }
  }
  return out;
}

/** Every string in a value — object keys included, recursively. Scanning this scans the whole body (AC-KIT-015.1). */
export function sentStrings(value: unknown, into: string[] = []): string[] {
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

// ── Size ─────────────────────────────────────────────────────────────────────

/** Limits relayed from TypeSafe's documentation 2026-09-25 — not independently measured. */
export const STATE_PLUS_LONGEST_QUESTION_LIMIT = 32_000;
export const REQUEST_TOTAL_LIMIT = 64_000;

/**
 * Characters ÷ 3, rounded up. Deliberately pessimistic (English runs ~4
 * chars/token): the error direction is refusing a request Jev would have
 * accepted, never sending one it rejects. Not measured against Jev's tokenizer.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

export interface SizeVerdict {
  estimatedTokens: number;
  limit: number;
}

/** Returns the first limit exceeded, or null. Each question is measured as its serialized wire JSON plus its key. */
export function sizeProblem(state: string, questions: Record<string, JevQuestion>): SizeVerdict | null {
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
