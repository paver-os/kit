/**
 * Caller-facing question, answer and result types. Since v0.2.0 the wire is
 * the gateway's OpenAI-compatible `/v1/decisions` (verified live 2026-10-31);
 * these caller shapes are unchanged from v0.1 and the client translates them
 * to and from that wire (#DecisionsWire). Traces to @REQ-KIT-013, @REQ-KIT-016
 * and @REQ-KIT-017.
 */
/** Structural subset of `fetch` the client needs; injectable for tests (AC-KIT-013.14). */
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
interface NoulQuestion {
    type: "noul";
    instructions: string;
    criteria?: {
        true: string;
        false: string;
    };
}
interface ChoiceQuestion<K extends string = string> {
    type: "choice";
    instructions: string;
    criteria: Record<K, string>;
}
interface ScoreQuestion {
    type: "score";
    instructions: string;
    criteria: string[];
}
type JevQuestion = NoulQuestion | ChoiceQuestion<string> | ScoreQuestion;
type JevQuestions = Record<string, JevQuestion>;
interface NoulAnswer {
    type: "noul";
    /** Probability, 0..1, that the answer is yes. */
    noul: number;
}
interface ChoiceAnswer<K extends string = string> {
    type: "choice";
    choice: K;
    probabilities: Partial<Record<K, number>>;
    confidence: number;
}
interface ScoreAnswer {
    type: "score";
    score: number;
    probabilities: Record<string, number>;
    confidence: number;
    legend?: Record<string, string>;
}
/**
 * Jev declined this one question (wire `{"type":"refusal"}`); the other
 * questions in the call are answered normally (AC-KIT-017.14). It is part of
 * every answer's union so the type checker makes a caller handle it.
 */
interface RefusedAnswer {
    type: "refusal";
    refused: true;
}
type AnswerFor<Q> = Q extends NoulQuestion ? NoulAnswer | RefusedAnswer : Q extends ChoiceQuestion<infer K> ? ChoiceAnswer<K> | RefusedAnswer : Q extends ScoreQuestion ? ScoreAnswer | RefusedAnswer : never;
type JevAnswers<Qs extends JevQuestions> = {
    [P in keyof Qs]: AnswerFor<Qs[P]>;
};
interface JevUsage {
    inputTokens: number;
    outputTokens: number;
    /** Gateway charge in USD. Undefined when the response carried none — never a fabricated 0 (AC-KIT-013.26). */
    cost?: number;
    /** Market-rate price in USD. Undefined when the response carried none. */
    marketCost?: number;
    /** The upstream provider that answered (`routing.finalProvider`). Undefined when not reported. */
    provider?: string;
}
type PersonalDataKind = "email" | "phone" | "ssn" | "card";
type JevFailureKind = "personal_data" | "state_too_large" | "invalid_request" | "missing_key" | "auth" | "rejected" | "no_zdr_provider" | "exhausted" | "bad_response";
type RetryableOutcome = "rate_limited" | "unavailable" | "server_error" | "timeout" | "network";
interface JevFailure {
    kind: JevFailureKind;
    /** Human-readable reason. Never contains the gateway key or matched personal data. */
    message: string;
    /** Whether any attempt left the process (AC-KIT-013.6). */
    sent: boolean;
    /** HTTP status, on `auth`, `rejected`, `no_zdr_provider`, and `exhausted` when the last outcome was a response. */
    status?: number;
    /** On `exhausted`: the last retryable outcome (AC-KIT-014.12). */
    lastOutcome?: RetryableOutcome;
    /** On `personal_data`: the kinds detected, never the text (AC-KIT-015.8, .9). */
    detected?: PersonalDataKind[];
    /** On `state_too_large`: the estimate and the limit it exceeded (AC-KIT-015.17). */
    estimatedTokens?: number;
    limit?: number;
}
type JevResult<Qs extends JevQuestions> = {
    ok: true;
    answers: JevAnswers<Qs>;
    usage: JevUsage;
    attempts: number;
    elapsedMs: number;
} | {
    ok: false;
    failure: JevFailure;
    attempts: number;
    elapsedMs: number;
};
type JevImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
type JevImageDetail = "low" | "high" | "auto";
interface JevImage {
    /** Raw bytes, or base64 WITHOUT a `data:` prefix. Sent as a base64 data URL; external URLs are not supported. */
    data: Uint8Array | string;
    mediaType: JevImageMediaType;
    /** Default `low` (~1,060 input tokens for a 512 px JPEG, measured 2026-10-31). */
    detail?: JevImageDetail;
}
interface JevClientConfig {
    /** Decision model id. Default `JEV_MODEL` (`typesafe-ai/jev-1.14.0`). Zero data retention is required whatever the model. */
    model?: string;
    /** Gateway key. When omitted, read from `AI_GATEWAY_API_KEY` at call time (AC-KIT-013.15). */
    apiKey?: string;
    /** Transport. Defaults to the global `fetch` (AC-KIT-013.14). */
    fetch?: FetchLike;
    /** Default 5 (AC-KIT-014.13). */
    maxAttempts?: number;
    /** Default 3,000 ms. */
    attemptTimeoutMs?: number;
    /** Default 8,000 ms, measured from the start of the call across all attempts and waits. */
    totalBudgetMs?: number;
    /** Default 250 ms. */
    baseDelayMs?: number;
    /** Default 4,000 ms. */
    maxDelayMs?: number;
    /** Injectable clock, sleep and randomness — for tests. */
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    random?: () => number;
}
interface AskOptions {
    /**
     * Disables the personal-data refusal. FORBIDDEN BY POLICY (AC-KIT-015.11)
     * until TypeSafe and the gateway offer zero data retention for Jev.
     */
    allowPersonalData?: true;
    /**
     * Images asked about together with the state (AC-KIT-017.6). They cannot be
     * scanned for personal data; they are allowed because every call requires
     * zero data retention (AC-KIT-017.3). At most 128, each at most 5 MB decoded.
     */
    images?: readonly JevImage[];
}
interface JevClient {
    ask<const Qs extends JevQuestions>(state: string, questions: Qs, options?: AskOptions): Promise<JevResult<Qs>>;
}

/**
 * Verified live 2026-10-31. The versioned model accepts images and lists
 * `zdr: all`; plain `typesafe-ai/jev` lists `zdr: some` and is text-only.
 */
declare const JEV_ENDPOINT = "https://ai-gateway.vercel.sh/v1/decisions";
declare const JEV_MODEL = "typesafe-ai/jev-1.14.0";
declare const JEV_KEY_ENV = "AI_GATEWAY_API_KEY";
declare function createJevClient(config?: JevClientConfig): JevClient;

/**
 * Typed question builders (@REQ-KIT-016). A builder throws on a malformed
 * question because that is a programmer error caught at the call site; `ask`
 * re-runs the same check and returns `invalid_request` instead, because `ask`
 * never throws (ADR-007 of @blueprint:paver-jev-guarded-decision-client).
 */

/** A yes/no question; its answer is P(yes). (AC-KIT-016.1) */
declare function noul(instructions: string, criteria?: {
    true: string;
    false: string;
}): NoulQuestion;
/** A pick-one question over caller-named options; the answer's `choice` is typed as the key union. (AC-KIT-016.2) */
declare function choice<const K extends string>(instructions: string, options: Record<K, string>): ChoiceQuestion<K>;
/** A graded question over 2–10 ordered level descriptions, lowest first. (AC-KIT-016.3) */
declare function score(instructions: string, levels: readonly string[]): ScoreQuestion;

/**
 * #DecisionsWire (@REQ-KIT-017) — translation between the caller's v0.1
 * shapes and the gateway's OpenAI-compatible `/v1/decisions` wire, verified
 * live 2026-10-31:
 *
 *   noul   → `predicate` (instructions only; true/false criteria are folded
 *            into the instructions, since predicate has no criteria field)
 *   choice → `choice` with `choices: [{value, description}]`
 *   score  → `score`  with `levels:  [{label}]`
 *
 * Questions become a NAMED ARRAY; answers come back in question order with the
 * same `name`, and are mapped back to the caller's keys by name — never by
 * position. Zero data retention is always requested (AC-KIT-017.3): there is
 * deliberately no parameter that turns it off.
 */

declare const MAX_IMAGES = 128;
declare const MAX_IMAGE_BYTES: number;
/** A validated image, ready for the wire: base64 payload, decoded size, detail resolved. */
interface PreparedImage {
    base64: string;
    bytes: number;
    mediaType: JevImageMediaType;
    detail: JevImageDetail;
}

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

/** Returns the kinds of personal data found in `text`, never the text itself. (AC-KIT-015.12) */
declare function detectPersonalData(text: string): PersonalDataKind[];
/**
 * Characters ÷ 3, rounded up. Deliberately pessimistic (English runs ~4
 * chars/token): the error direction is refusing a request Jev would have
 * accepted, never sending one it rejects. Not measured against Jev's tokenizer.
 */
declare function estimateTokens(text: string): number;
/**
 * Estimated input tokens per image (AC-KIT-017.11). `low` is anchored on the
 * one measurement in hand — a 512 px JPEG at detail low read 1,063 input
 * tokens with a short text part (2026-10-31) — rounded up to 1,100. `high`
 * and `auto` are NOT measured; they are set 4× higher so the estimate errs
 * toward refusing, the same direction as the chars ÷ 3 text estimate.
 */
declare const IMAGE_TOKEN_ESTIMATE: {
    readonly low: 1100;
    readonly high: 4400;
    readonly auto: 4400;
};
declare function estimateImageTokens(images: readonly Pick<PreparedImage, "detail">[]): number;

/**
 * Three-way decisions (@REQ-KIT-016). There is deliberately no default
 * threshold: the 2026-09-25 pilot found 0.5 wrong for "is the customer upset"
 * (5 false alarms) and 0.75 clean, so a threshold is a fact about one question
 * measured on a labeled sample — never a package constant (AC-KIT-016.23).
 */

type Decision = "yes" | "no" | "unsure";
interface DecisionThresholds {
    /** P(yes) at or above this is "yes". */
    yesAtOrAbove: number;
    /** P(yes) at or below this is "no". Must be strictly less than `yesAtOrAbove`. */
    noAtOrBelow: number;
}
/** True when Jev declined this question (AC-KIT-017.14). */
declare function isRefused(answer: unknown): answer is RefusedAnswer;
/**
 * Maps a noul probability — or a noul answer — to yes / no / unsure. Unsure is
 * the caller's fallback path; a refused answer is unsure (AC-KIT-017.16).
 */
declare function decide(input: number | NoulAnswer | RefusedAnswer, thresholds: DecisionThresholds): Decision;
/** Returns the chosen option when Jev's confidence clears the caller's floor, else "unsure" — including when Jev refused. */
declare function decideChoice<K extends string>(answer: Pick<ChoiceAnswer<K>, "choice" | "confidence"> | RefusedAnswer, floor: {
    minConfidence: number;
}): K | "unsure";

export { type AnswerFor, type AskOptions, type ChoiceAnswer, type ChoiceQuestion, type Decision, type DecisionThresholds, type FetchLike, IMAGE_TOKEN_ESTIMATE, JEV_ENDPOINT, JEV_KEY_ENV, JEV_MODEL, type JevAnswers, type JevClient, type JevClientConfig, type JevFailure, type JevFailureKind, type JevImage, type JevImageDetail, type JevImageMediaType, type JevQuestion, type JevQuestions, type JevResult, type JevUsage, MAX_IMAGES, MAX_IMAGE_BYTES, type NoulAnswer, type NoulQuestion, type PersonalDataKind, type RefusedAnswer, type RetryableOutcome, type ScoreAnswer, type ScoreQuestion, choice, createJevClient, decide, decideChoice, detectPersonalData, estimateImageTokens, estimateTokens, isRefused, noul, score };
