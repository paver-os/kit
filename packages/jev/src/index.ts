/**
 * @paver/jev — the guarded client for TypeSafe AI's Jev ("System One")
 * through Vercel AI Gateway. Traces to @REQ-KIT-013 … @REQ-KIT-016 and
 * @blueprint:paver-jev-guarded-decision-client.
 *
 * Zero runtime dependencies: global `fetch` (injectable), no Node-only APIs,
 * so the same build runs in a Node script, a Next.js route or an edge function.
 */
export { createJevClient, JEV_ENDPOINT, JEV_MODEL, JEV_KEY_ENV } from "./client.ts";
export { noul, choice, score } from "./questions.ts";
export { detectPersonalData, estimateTokens } from "./guards.ts";
export { decide, decideChoice } from "./decide.ts";
export type { Decision, DecisionThresholds } from "./decide.ts";
export type {
  AnswerFor,
  AskOptions,
  ChoiceAnswer,
  ChoiceQuestion,
  FetchLike,
  JevAnswers,
  JevClient,
  JevClientConfig,
  JevFailure,
  JevFailureKind,
  JevQuestion,
  JevQuestions,
  JevResult,
  JevUsage,
  NoulAnswer,
  NoulQuestion,
  PersonalDataKind,
  RetryableOutcome,
  ScoreAnswer,
  ScoreQuestion,
} from "./types.ts";
