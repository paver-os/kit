/**
 * Caller-facing question, answer and result types. Since v0.2.0 the wire is
 * the gateway's OpenAI-compatible `/v1/decisions` (verified live 2026-10-31);
 * these caller shapes are unchanged from v0.1 and the client translates them
 * to and from that wire (#DecisionsWire). Traces to @REQ-KIT-013, @REQ-KIT-016
 * and @REQ-KIT-017.
 */

/** Structural subset of `fetch` the client needs; injectable for tests (AC-KIT-013.14). */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

// ── Questions ────────────────────────────────────────────────────────────────

export interface NoulQuestion {
  type: "noul";
  instructions: string;
  criteria?: { true: string; false: string };
}

export interface ChoiceQuestion<K extends string = string> {
  type: "choice";
  instructions: string;
  criteria: Record<K, string>;
}

export interface ScoreQuestion {
  type: "score";
  instructions: string;
  criteria: string[];
}

export type JevQuestion = NoulQuestion | ChoiceQuestion<string> | ScoreQuestion;
export type JevQuestions = Record<string, JevQuestion>;

// ── Answers ──────────────────────────────────────────────────────────────────

export interface NoulAnswer {
  type: "noul";
  /** Probability, 0..1, that the answer is yes. */
  noul: number;
}

export interface ChoiceAnswer<K extends string = string> {
  type: "choice";
  choice: K;
  probabilities: Partial<Record<K, number>>;
  confidence: number;
}

export interface ScoreAnswer {
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
export interface RefusedAnswer {
  type: "refusal";
  refused: true;
}

export type AnswerFor<Q> = Q extends NoulQuestion
  ? NoulAnswer | RefusedAnswer
  : Q extends ChoiceQuestion<infer K>
    ? ChoiceAnswer<K> | RefusedAnswer
    : Q extends ScoreQuestion
      ? ScoreAnswer | RefusedAnswer
      : never;

export type JevAnswers<Qs extends JevQuestions> = { [P in keyof Qs]: AnswerFor<Qs[P]> };

// ── Results ──────────────────────────────────────────────────────────────────

export interface JevUsage {
  inputTokens: number;
  outputTokens: number;
  /** Gateway charge in USD. Undefined when the response carried none — never a fabricated 0 (AC-KIT-013.26). */
  cost?: number;
  /** Market-rate price in USD. Undefined when the response carried none. */
  marketCost?: number;
  /** The upstream provider that answered (`routing.finalProvider`). Undefined when not reported. */
  provider?: string;
}

export type PersonalDataKind = "email" | "phone" | "ssn" | "card";

export type JevFailureKind =
  | "personal_data"
  | "state_too_large"
  | "invalid_request"
  | "missing_key"
  | "auth"
  | "rejected"
  | "no_zdr_provider"
  | "exhausted"
  | "bad_response";

export type RetryableOutcome = "rate_limited" | "unavailable" | "server_error" | "timeout" | "network";

export interface JevFailure {
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

export type JevResult<Qs extends JevQuestions> =
  | { ok: true; answers: JevAnswers<Qs>; usage: JevUsage; attempts: number; elapsedMs: number }
  | { ok: false; failure: JevFailure; attempts: number; elapsedMs: number };

// ── Client ───────────────────────────────────────────────────────────────────

// ── Images (@REQ-KIT-017) ────────────────────────────────────────────────────

/** JPEG and PNG only: Jev 1.14.0 answers 400 "media type ... not supported" for WebP and GIF (measured 2026-11-01). */
export type JevImageMediaType = "image/jpeg" | "image/png";
export type JevImageDetail = "low" | "high" | "auto";

export interface JevImage {
  /** Raw bytes, or base64 WITHOUT a `data:` prefix. Sent as a base64 data URL; external URLs are not supported. */
  data: Uint8Array | string;
  mediaType: JevImageMediaType;
  /** Default `low` (~1,060 input tokens for a 512 px JPEG, measured 2026-10-31). */
  detail?: JevImageDetail;
}

export interface JevClientConfig {
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

export interface AskOptions {
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

export interface JevClient {
  ask<const Qs extends JevQuestions>(state: string, questions: Qs, options?: AskOptions): Promise<JevResult<Qs>>;
}
