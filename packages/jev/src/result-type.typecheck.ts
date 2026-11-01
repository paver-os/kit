/**
 * Compile-time acceptance checks. This file is inside `src/` and is not a
 * `*.test.ts`, so the workspace `tsc --noEmit` gate type-checks it; nothing
 * imports it, so the build never bundles it. A regression here fails the
 * typecheck gate, not the test runner.
 *
 * AC-KIT-013.4  — `answers` is unreachable without testing `ok`.
 * AC-KIT-016.12 — each answer is typed by the question asked under its key.
 * AC-KIT-016.13 — a choice answer is the union of that question's option keys.
 * AC-KIT-017.19 — a refused answer is in every answer's union, so a caller
 *                 cannot read a value without first ruling the refusal out.
 * AC-KIT-017.5  — `no_zdr_provider` is in the closed failure set.
 */
import { choice, decide, decideChoice, isRefused, noul, score, type JevClient } from "./index.ts";

declare const client: JevClient;

export async function typeChecks(): Promise<void> {
  const r = await client.ask("state", {
    upset: noul("Is it upset?"),
    area: choice("Which area?", { build: "b", test: "t" }),
    sev: score("How severe?", ["low", "high"]),
  });

  // @ts-expect-error — AC-KIT-013.4: answers is not on the failure branch
  void r.answers;

  if (r.ok) {
    const { upset, area, sev } = r.answers;
    // @ts-expect-error — AC-KIT-017.19: the value is unreachable until the refusal is ruled out
    void upset.noul;
    // The decision helpers take the answer as-is, refusal included.
    const d1: "yes" | "no" | "unsure" = decide(upset, { yesAtOrAbove: 0.8, noAtOrBelow: 0.2 });
    const d2: "build" | "test" | "unsure" = decideChoice(area, { minConfidence: 0.6 });
    if (isRefused(upset) || isRefused(area) || isRefused(sev)) return;
    const p: number = upset.noul;
    const a: "build" | "test" = area.choice;
    // @ts-expect-error — AC-KIT-016.13: "deploy" was not an option
    const bad: "deploy" = area.choice;
    const s: number = sev.score;
    // @ts-expect-error — AC-KIT-016.12: a noul answer carries no `choice`
    void upset.choice;
    // @ts-expect-error — AC-KIT-016.12: no answer exists under an un-asked key
    void r.answers.missing;
    void p, a, bad, s, d1, d2;
  } else {
    const kind:
      | "personal_data"
      | "state_too_large"
      | "invalid_request"
      | "missing_key"
      | "auth"
      | "rejected"
      | "no_zdr_provider"
      | "exhausted"
      | "bad_response" = r.failure.kind;
    void kind;
  }
}
