/**
 * Three-way decisions (@REQ-KIT-016). There is deliberately no default
 * threshold: the 2026-09-25 pilot found 0.5 wrong for "is the customer upset"
 * (5 false alarms) and 0.75 clean, so a threshold is a fact about one question
 * measured on a labeled sample — never a package constant (AC-KIT-016.23).
 */
import type { ChoiceAnswer, NoulAnswer, RefusedAnswer } from "./types.ts";

export type Decision = "yes" | "no" | "unsure";

export interface DecisionThresholds {
  /** P(yes) at or above this is "yes". */
  yesAtOrAbove: number;
  /** P(yes) at or below this is "no". Must be strictly less than `yesAtOrAbove`. */
  noAtOrBelow: number;
}

/** True when Jev declined this question (AC-KIT-017.14). */
export function isRefused(answer: unknown): answer is RefusedAnswer {
  return typeof answer === "object" && answer !== null && (answer as { type?: unknown }).type === "refusal";
}

/**
 * Maps a noul probability — or a noul answer — to yes / no / unsure. Unsure is
 * the caller's fallback path; a refused answer is unsure (AC-KIT-017.16).
 */
export function decide(input: number | NoulAnswer | RefusedAnswer, thresholds: DecisionThresholds): Decision {
  const { yesAtOrAbove: yes, noAtOrBelow: no } = thresholds;
  if (!inUnitRange(yes) || !inUnitRange(no)) throw new RangeError("thresholds must lie in 0..1");
  if (!(no < yes)) throw new RangeError("noAtOrBelow must be less than yesAtOrAbove");
  if (isRefused(input)) return "unsure";
  const probability = typeof input === "number" ? input : input.noul;
  // An impossible probability is not evidence either way.
  if (!inUnitRange(probability)) return "unsure";
  if (probability >= yes) return "yes";
  if (probability <= no) return "no";
  return "unsure";
}

/** Returns the chosen option when Jev's confidence clears the caller's floor, else "unsure" — including when Jev refused. */
export function decideChoice<K extends string>(
  answer: Pick<ChoiceAnswer<K>, "choice" | "confidence"> | RefusedAnswer,
  floor: { minConfidence: number },
): K | "unsure" {
  if (isRefused(answer)) return "unsure";
  return Number.isFinite(answer.confidence) && answer.confidence >= floor.minConfidence ? answer.choice : "unsure";
}

function inUnitRange(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 1;
}
