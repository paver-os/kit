import { test } from "node:test";
import assert from "node:assert/strict";
import { detectPersonalData, estimateTokens, noul, choice, score, decide, decideChoice } from "./index.ts";
import * as api from "./index.ts";

// AC-KIT-015.2
test("personal data: detects an email address", () => {
  assert.deepEqual(detectPersonalData("write to ops+alerts@madson.co now"), ["email"]);
});

// AC-KIT-015.3 — NANP with and without separators
test("personal data: detects North American phone numbers in common forms", () => {
  for (const s of ["call (801) 555-0142", "call 801-555-0142", "call 801.555.0142", "call 8015550142", "call +1 801 555 0142"]) {
    assert.deepEqual(detectPersonalData(s), ["phone"], s);
  }
});

// AC-KIT-015.4
test("personal data: detects an international number with a leading +", () => {
  assert.deepEqual(detectPersonalData("office +44 20 7946 0958"), ["phone"]);
});

// AC-KIT-015.5
test("personal data: detects an SSN-form number", () => {
  assert.deepEqual(detectPersonalData("ssn 123-45-6789 on file"), ["ssn"]);
});

// AC-KIT-015.6 — Luhn-valid card detected, Luhn-invalid 16 digits not flagged as a card
test("personal data: detects a Luhn-valid card number and ignores a Luhn-invalid one", () => {
  assert.deepEqual(detectPersonalData("card 4111 1111 1111 1111 exp 09/29"), ["card"]);
  assert.ok(!detectPersonalData("batch 4111111111111112").includes("card"));
});

// AC-KIT-015.13, .14 — known non-personal numbers are not flagged
test("personal data: an ISO date and a 10-digit Unix timestamp are not flagged", () => {
  assert.deepEqual(detectPersonalData("deployed 2026-09-25T13:34:00Z"), []);
  assert.deepEqual(detectPersonalData("epoch 1727300000 ms"), []);
  assert.deepEqual(detectPersonalData("Build log: step 3 failed with exit code 137 after 41 minutes."), []);
});

// AC-KIT-015.12 — the scan is exported and callable without a call
test("personal data: the scan is an exported pure function", () => {
  assert.equal(typeof api.detectPersonalData, "function");
  assert.deepEqual(detectPersonalData("a@b.co and 801-555-0142").sort(), ["email", "phone"]);
});

// Terminology "Estimated tokens" — ceil(chars / 3)
test("size: estimated tokens are characters / 3, rounded up", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("abc"), 1);
  assert.equal(estimateTokens("abcd"), 2);
});

// AC-KIT-016.1, .2, .3 — builders produce the wire shape
test("builders: noul, choice and score produce the systemone wire shape", () => {
  assert.deepEqual(noul("Is it green?"), { type: "noul", instructions: "Is it green?" });
  assert.deepEqual(noul("Is it green?", { true: "green", false: "not green" }), {
    type: "noul",
    instructions: "Is it green?",
    criteria: { true: "green", false: "not green" },
  });
  assert.deepEqual(choice("Which?", { a: "A", b: "B" }), { type: "choice", instructions: "Which?", criteria: { a: "A", b: "B" } });
  assert.deepEqual(score("How much?", ["none", "some"]), { type: "score", instructions: "How much?", criteria: ["none", "some"] });
});

// AC-KIT-016.4, .5
test("builders: choice with fewer than 2 or more than 255 options throws RangeError", () => {
  assert.throws(() => choice("Which?", { a: "A" }), RangeError);
  const many: Record<string, string> = {};
  for (let i = 0; i < 256; i += 1) many[`o${i}`] = `option ${i}`;
  assert.throws(() => choice("Which?", many), RangeError);
  delete many.o255;
  assert.doesNotThrow(() => choice("Which?", many));
});

// AC-KIT-016.6, .7
test("builders: score with fewer than 2 or more than 10 levels throws RangeError", () => {
  assert.throws(() => score("How much?", ["one"]), RangeError);
  assert.throws(() => score("How much?", Array.from({ length: 11 }, (_, i) => `l${i}`)), RangeError);
  assert.doesNotThrow(() => score("How much?", Array.from({ length: 10 }, (_, i) => `l${i}`)));
});

// AC-KIT-016.8
test("builders: empty instructions throw RangeError", () => {
  assert.throws(() => noul("  "), RangeError);
  assert.throws(() => choice("", { a: "A", b: "B" }), RangeError);
  assert.throws(() => score("", ["a", "b"]), RangeError);
});

// AC-KIT-016.17, .18, .19
test("decide: yes at or above, no at or below, unsure between", () => {
  const t = { yesAtOrAbove: 0.75, noAtOrBelow: 0.25 };
  assert.equal(decide(0.75, t), "yes");
  assert.equal(decide(0.97, t), "yes");
  assert.equal(decide(0.25, t), "no");
  assert.equal(decide(0.03, t), "no");
  assert.equal(decide(0.5, t), "unsure");
  assert.equal(decide(0.74, t), "unsure");
});

// AC-KIT-016.20
test("decide: a non-finite or out-of-range probability is unsure", () => {
  const t = { yesAtOrAbove: 0.75, noAtOrBelow: 0.25 };
  for (const p of [Number.NaN, Infinity, -0.1, 1.1]) assert.equal(decide(p, t), "unsure", String(p));
});

// AC-KIT-016.21, .22
test("decide: invalid thresholds throw RangeError", () => {
  assert.throws(() => decide(0.5, { yesAtOrAbove: 0.5, noAtOrBelow: 0.5 }), RangeError);
  assert.throws(() => decide(0.5, { yesAtOrAbove: 0.4, noAtOrBelow: 0.6 }), RangeError);
  assert.throws(() => decide(0.5, { yesAtOrAbove: 1.2, noAtOrBelow: 0.2 }), RangeError);
  assert.throws(() => decide(0.5, { yesAtOrAbove: 0.8, noAtOrBelow: -0.1 }), RangeError);
});

// AC-KIT-016.23 — no default threshold is exported
test("decide: the package exports no default threshold", () => {
  const names = Object.keys(api);
  assert.deepEqual(
    names.filter((n) => /threshold|default/i.test(n)),
    [],
    `unexpected exports: ${names.join(", ")}`,
  );
});

// AC-KIT-016.24
test("decideChoice: returns the option at or above the minimum confidence, unsure below", () => {
  const answer = { type: "choice" as const, choice: "build" as const, probabilities: { build: 0.62 }, confidence: 0.62 };
  assert.equal(decideChoice(answer, { minConfidence: 0.6 }), "build");
  assert.equal(decideChoice(answer, { minConfidence: 0.62 }), "build");
  assert.equal(decideChoice({ ...answer, confidence: 0.41 }, { minConfidence: 0.6 }), "unsure");
});
