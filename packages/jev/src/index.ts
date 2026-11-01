/**
 * @paver/jev — the guarded client for TypeSafe AI's Jev ("System One")
 * through Vercel AI Gateway. Traces to @REQ-KIT-013 … @REQ-KIT-016 and
 * @blueprint:paver-jev-guarded-decision-client; images, zero data retention
 * and the versioned model trace to @REQ-KIT-017.
 *
 * Zero runtime dependencies: global `fetch` (injectable), no Node-only APIs,
 * so the same build runs in a Node script, a Next.js route or an edge function.
 */
export { createJevClient, JEV_ENDPOINT, JEV_MODEL, JEV_KEY_ENV } from "./client.ts";
export { noul, choice, score } from "./questions.ts";
export { detectPersonalData, estimateTokens, estimateImageTokens, IMAGE_TOKEN_ESTIMATE } from "./guards.ts";
export { imageSize, imageDimensionProblem, JEV_MIN_SHORT_EDGE, JEV_MAX_ASPECT } from "./guards.ts";
export type { ImageSize } from "./guards.ts";
export { MAX_IMAGES, MAX_IMAGE_BYTES } from "./wire.ts";
export { decide, decideChoice, isRefused } from "./decide.ts";
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
  JevImage,
  JevImageDetail,
  JevImageMediaType,
  JevQuestion,
  JevQuestions,
  JevResult,
  JevUsage,
  NoulAnswer,
  NoulQuestion,
  PersonalDataKind,
  RefusedAnswer,
  RetryableOutcome,
  ScoreAnswer,
  ScoreQuestion,
} from "./types.ts";
