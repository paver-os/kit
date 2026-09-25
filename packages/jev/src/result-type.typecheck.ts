/**
 * Compile-time acceptance checks. This file is inside `src/` and is not a
 * `*.test.ts`, so the workspace `tsc --noEmit` gate type-checks it; nothing
 * imports it, so the build never bundles it. A regression here fails the
 * typecheck gate, not the test runner.
 *
 * AC-KIT-013.4  — `answers` is unreachable without testing `ok`.
 * AC-KIT-016.12 — each answer is typed by the question asked under its key.
 * AC-KIT-016.13 — a choice answer is the union of that question's option keys.
 */
import { choice, noul, score, type JevClient } from "./index.ts";

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
    const p: number = r.answers.upset.noul;
    const a: "build" | "test" = r.answers.area.choice;
    // @ts-expect-error — AC-KIT-016.13: "deploy" was not an option
    const bad: "deploy" = r.answers.area.choice;
    const s: number = r.answers.sev.score;
    // @ts-expect-error — AC-KIT-016.12: a noul answer carries no `choice`
    void r.answers.upset.choice;
    // @ts-expect-error — AC-KIT-016.12: no answer exists under an un-asked key
    void r.answers.missing;
    void p, a, bad, s;
  } else {
    const kind: "personal_data" | "state_too_large" | "invalid_request" | "missing_key" | "auth" | "rejected" | "exhausted" | "bad_response" =
      r.failure.kind;
    void kind;
  }
}
