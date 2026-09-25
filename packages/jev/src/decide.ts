/**
 * Three-way decisions (@REQ-KIT-016). There is deliberately no default
 * threshold: the 2026-09-25 pilot found 0.5 wrong for "is the customer upset"
 * (5 false alarms) and 0.75 clean, so a threshold is a fact about one question
 * measured on a labeled sample — never a package constant (AC-KIT-016.23).
 */
import type { ChoiceAnswer } from "./types.ts";

export type Decision = "yes" | "no" | "unsure";

export interface DecisionThresholds {
  /** P(yes) at or above this is "yes". */
  yesAtOrAbove: number;
  /** P(yes) at or below this is "no". Must be strictly less than `yesAtOrAbove`. */
  noAtOrBelow: number;
}

/** Maps a noul probability to yes / no / unsure. Unsure is the caller's fallback path. */
export function decide(probability: number, thresholds: DecisionThresholds): Decision {
  const { yesAtOrAbove: yes, noAtOrBelow: no } = thresholds;
  if (!inUnitRange(yes) || !inUnitRange(no)) throw new RangeError("thresholds must lie in 0..1");
  if (!(no < yes)) throw new RangeError("noAtOrBelow must be less than yesAtOrAbove");
  // An impossible probability is not evidence either way.
  if (!inUnitRange(probability)) return "unsure";
  if (probability >= yes) return "yes";
  if (probability <= no) return "no";
  return "unsure";
}

/** Returns the chosen option when Jev's confidence clears the caller's floor, else "unsure". */
export function decideChoice<K extends string>(
  answer: Pick<ChoiceAnswer<K>, "choice" | "confidence">,
  floor: { minConfidence: number },
): K | "unsure" {
  return Number.isFinite(answer.confidence) && answer.confidence >= floor.minConfidence ? answer.choice : "unsure";
}

function inUnitRange(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 1;
}
