/**
 * Wire and result types for Jev's System One endpoint. Question shapes are the
 * exact JSON the gateway accepts (verified live 2026-09-25), so a built
 * question is sent as-is. Traces to @REQ-KIT-013 and @REQ-KIT-016.
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

export type AnswerFor<Q> = Q extends NoulQuestion
  ? NoulAnswer
  : Q extends ChoiceQuestion<infer K>
    ? ChoiceAnswer<K>
    : Q extends ScoreQuestion
      ? ScoreAnswer
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
}

export type PersonalDataKind = "email" | "phone" | "ssn" | "card";

export type JevFailureKind =
  | "personal_data"
  | "state_too_large"
  | "invalid_request"
  | "missing_key"
  | "auth"
  | "rejected"
  | "exhausted"
  | "bad_response";

export type RetryableOutcome = "rate_limited" | "unavailable" | "server_error" | "timeout" | "network";

export interface JevFailure {
  kind: JevFailureKind;
  /** Human-readable reason. Never contains the gateway key or matched personal data. */
  message: string;
  /** Whether any attempt left the process (AC-KIT-013.6). */
  sent: boolean;
  /** HTTP status, on `auth`, `rejected`, and `exhausted` when the last outcome was a response. */
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

export interface JevClientConfig {
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
}

export interface JevClient {
  ask<const Qs extends JevQuestions>(state: string, questions: Qs, options?: AskOptions): Promise<JevResult<Qs>>;
}
