/**
 * Typed question builders (@REQ-KIT-016). A builder throws on a malformed
 * question because that is a programmer error caught at the call site; `ask`
 * re-runs the same check and returns `invalid_request` instead, because `ask`
 * never throws (ADR-007 of @blueprint:paver-jev-guarded-decision-client).
 */
import type { ChoiceQuestion, JevQuestion, NoulQuestion, ScoreQuestion } from "./types.ts";

export const MAX_CHOICE_OPTIONS = 255;
export const MIN_SCORE_LEVELS = 2;
export const MAX_SCORE_LEVELS = 10;

/** Returns the reason a question is malformed, or null when it is sound. */
export function questionProblem(q: JevQuestion): string | null {
  // Hand-built or deserialized questions reach `ask` unchecked by the type
  // system; a null anywhere must be a refusal, not a TypeError.
  if (typeof q !== "object" || q === null) return "question is not an object";
  if (typeof q.instructions !== "string" || q.instructions.trim() === "") return "instructions are empty";
  switch (q.type) {
    case "noul":
      if (q.criteria === undefined) return null;
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

function nonEmpty(s: unknown): boolean {
  return typeof s === "string" && s.trim() !== "";
}

function assertSound<Q extends JevQuestion>(q: Q): Q {
  const problem = questionProblem(q);
  if (problem) throw new RangeError(problem);
  return q;
}

/** A yes/no question; its answer is P(yes). (AC-KIT-016.1) */
export function noul(instructions: string, criteria?: { true: string; false: string }): NoulQuestion {
  return assertSound(criteria === undefined ? { type: "noul", instructions } : { type: "noul", instructions, criteria });
}

/** A pick-one question over caller-named options; the answer's `choice` is typed as the key union. (AC-KIT-016.2) */
export function choice<const K extends string>(instructions: string, options: Record<K, string>): ChoiceQuestion<K> {
  return assertSound({ type: "choice", instructions, criteria: options });
}

/** A graded question over 2–10 ordered level descriptions, lowest first. (AC-KIT-016.3) */
export function score(instructions: string, levels: readonly string[]): ScoreQuestion {
  return assertSound({ type: "score", instructions, criteria: [...levels] });
}
