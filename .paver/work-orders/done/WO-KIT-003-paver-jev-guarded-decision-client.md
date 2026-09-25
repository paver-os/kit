---
owner: builder
blocks: []
blocked-by: []
open-blockers: []
---

# WO-KIT-003: Build `@paver/jev` — the guarded Jev decision client

> **Repo:** `paver-os/kit` · **Allocated 2026-09-25.** Placed directly in `in-progress/`: `blocked-by`
> is empty and implementation began the same day under operator direction. The one open blocker is
> the bootstrap approval below — it is owed before this Work Order moves to `done/`, not before it
> started, and is recorded so it is not discovered at the `done/` transition.

## Summary

Products need Jev — TypeSafe AI's System One evaluation model — for cheap, fast typed decisions over
non-personal text. Reached through Vercel AI Gateway, it failed often under the 2026-09-25 load, and
the operator forbids personal text reaching it until zero data retention exists. This Work Order
builds `packages/jev` (`@paver/jev` v0.1.0): one client that never throws on a failed call, retries
within a bound, refuses personal data and oversized requests before sending, types questions and
answers, and maps probabilities to yes / no / unsure on caller thresholds. Released as tag
`jev-v0.1.0` by the main thread after verification.

## In Scope

- `packages/jev/` — `package.json` (v0.1.0, zero runtime deps), `tsconfig.json` (`types: []`),
  `README.md`, and `src/`: `client.ts` (`#JevDecisionClient`, `#GatewayRetryLoop`,
  `#SystemOneResponseReader`), `guards.ts` (`#JevRequestPreflight` size half, `#PersonalDataScanner`),
  `questions.ts` (`#TypedQuestionBuilders`), `decide.ts` (`#ProbabilityBandDecider`), `types.ts`,
  `index.ts`, `smoke.ts` + `scripts/smoke.ts` (`#JevLiveSmoke`).
- Tests with a scripted fetch and a fake clock (`src/*.test.ts`, `src/fixtures.ts`) and a
  compile-time check (`src/result-type.typecheck.ts`) run by the workspace `tsc --noEmit` gate.
- `pnpm-lock.yaml` gains the `packages/jev` importer.

## Out of Scope

- Any consumer adopting the package, and any consumer's thresholds or fallback path.
- Running the live smoke call — the main thread runs it once with the key from `paver/.env.local`.
- Cutting and pushing the `jev-v0.1.0` tag, and updating kit's `README.md` / `CLAUDE.md` package
  tables — main thread, at commit time.
- Lifting `AC-KIT-015.11` — an operator decision recorded in the FRD, never a code change.

## Requirements

Cited verbatim from
`@artifact:projects/kit/.paver/requirements/frds/REQ-KIT-013-paver-jev-guarded-decision-client.md`
(**Revision 2**). This Work Order claims every AC below except `AC-KIT-015.11`, which binds consumers
and is verified by drift review, not by this package.

**REQ-KIT-013: A Jev call resolves to a typed result and never throws on failure**

- **AC-KIT-013.1:** `@paver/jev` shall export a function that sends one state and a set of named questions to Jev and resolves to a result.
- **AC-KIT-013.2:** When an attempt's transport rejects, the call shall resolve to a failure result and shall not reject.
- **AC-KIT-013.3:** When an attempt returns a status outside 200–299, the call shall resolve to a failure result and shall not reject.
- **AC-KIT-013.4:** The result type shall be a union discriminated by a boolean `ok` field, so that a TypeScript caller cannot read `answers` without first testing `ok`.
- **AC-KIT-013.5:** Every failure result shall carry exactly one failure kind from the closed set named in Terminology.
- **AC-KIT-013.6:** Every failure result shall state, in a boolean `sent` field, whether any attempt was made.
- **AC-KIT-013.7:** Every result shall report the number of attempts the call made.
- **AC-KIT-013.8:** When a 2xx response body is not valid JSON, the call shall resolve to a `bad_response` failure.
- **AC-KIT-013.9:** When a 2xx response lacks an answer for any question the call asked, the call shall resolve to a `bad_response` failure.
- **AC-KIT-013.10:** When an answer's `type` differs from the type of the question asked under its key, the call shall resolve to a `bad_response` failure.
- **AC-KIT-013.11:** The package shall send every attempt as a `POST` to `https://ai-gateway.vercel.sh/typesafe/v1/systemone`.
- **AC-KIT-013.12:** The package shall send every attempt with the model id `typesafe-ai/jev`.
- **AC-KIT-013.13:** The package shall declare no runtime dependency.
- **AC-KIT-013.14:** The package shall accept a caller-supplied fetch function and shall use the global `fetch` when none is supplied.
- **AC-KIT-013.15:** When the caller supplies no key, the package shall read the gateway key from `AI_GATEWAY_API_KEY` at call time.
- **AC-KIT-013.16:** The package shall remove trailing whitespace and a trailing literal `\n` from the key before use.
- **AC-KIT-013.17:** When no key is available, the call shall resolve to a `missing_key` failure with `sent` false.
- **AC-KIT-013.18:** No failure result shall contain the gateway key in any field.
- **AC-KIT-013.19:** The package shall write nothing to the console.
- **AC-KIT-013.20:** When an attempt returns status 401 or 403, the call shall resolve to an `auth` failure after that one attempt.
- **AC-KIT-013.21:** When an attempt returns any other status from 400 to 499 except 408 and 429, the call shall resolve to a `rejected` failure after that one attempt.
- **AC-KIT-013.22:** An `auth` or `rejected` failure shall carry the HTTP status.
- **AC-KIT-013.23:** A success result shall report the input token count and the output token count from the response's `usage`.
- **AC-KIT-013.24:** When the response carries `provider_metadata.gateway.cost`, a success result shall report it as a number.
- **AC-KIT-013.25:** When the response carries `provider_metadata.gateway.marketCost`, a success result shall report it as a number.
- **AC-KIT-013.26:** When the response carries no parseable cost figure, the success result shall leave that field undefined and shall not report zero.
- **AC-KIT-013.27:** Every result shall report the call's elapsed time in milliseconds.
- **AC-KIT-013.28:** The package shall ship a live smoke script that makes exactly one call with a synthetic, non-personal state.
- **AC-KIT-013.29:** The live smoke script shall exit without making a call unless the environment variable `JEV_LIVE` equals `1`.

**REQ-KIT-014: Rate limits and outages are retried within a bound**

- **AC-KIT-014.1:** When an attempt ends in a retryable outcome, the package shall make another attempt, subject to AC-KIT-014.2, AC-KIT-014.3 and AC-KIT-014.8.
- **AC-KIT-014.2:** The package shall make no more than the configured maximum number of attempts per call.
- **AC-KIT-014.3:** The package shall start no attempt after the call's budget has elapsed.
- **AC-KIT-014.4:** The package shall abort an attempt that has received no response within the attempt timeout.
- **AC-KIT-014.5:** The package shall treat an aborted attempt as a retryable outcome.
- **AC-KIT-014.6:** The attempt timeout the package applies to an attempt shall not exceed the budget remaining when that attempt starts.
- **AC-KIT-014.7:** Before retry number *n* (the first retry is *n* = 1), the package shall wait a duration drawn by full jitter with ceiling `min(maxDelayMs, baseDelayMs × 2^(n−1))`.
- **AC-KIT-014.8:** When the wait before the next attempt would end after the budget elapses, the package shall resolve to an `exhausted` failure without waiting.
- **AC-KIT-014.9:** When a retryable response carries a `Retry-After` header in delta-seconds form, the wait before the next attempt shall be no shorter than that many seconds.
- **AC-KIT-014.10:** When a retryable response carries a `Retry-After` header in HTTP-date form, the wait before the next attempt shall be no shorter than the time remaining until that date.
- **AC-KIT-014.11:** When the package stops retrying, the call shall resolve to an `exhausted` failure.
- **AC-KIT-014.12:** An `exhausted` failure shall name its last retryable outcome as one of `rate_limited`, `unavailable`, `server_error`, `timeout` or `network`.
- **AC-KIT-014.13:** The package shall default to at most 5 attempts, a 3,000 ms attempt timeout, an 8,000 ms budget, a 250 ms base delay and a 4,000 ms maximum delay.
- **AC-KIT-014.14:** A caller may override each value named in AC-KIT-014.13 when creating a client.
- **AC-KIT-014.15:** The package shall end an attempt at its attempt timeout even when the transport ignores the abort signal.

**REQ-KIT-015: Personal data and oversized requests are refused before sending**

- **AC-KIT-015.1:** Before the first attempt, the package shall scan every string the request body carries — the state, each question key, and each string inside each question — for personal data.
- **AC-KIT-015.2:** The scan shall detect an email address.
- **AC-KIT-015.3:** The scan shall detect a North American 10-digit phone number whose groups are joined by nothing, a space, or a dash, dot or slash with optional spaces around it.
- **AC-KIT-015.4:** The scan shall detect an international phone number written with a leading `+`.
- **AC-KIT-015.5:** The scan shall detect a number in the US Social Security form `NNN-NN-NNNN`.
- **AC-KIT-015.6:** The scan shall detect a 13-to-19-digit number that passes the Luhn check.
- **AC-KIT-015.7:** When the scan detects personal data and the opt-in is not set, the call shall resolve to a `personal_data` failure with `sent` false.
- **AC-KIT-015.8:** A `personal_data` failure shall list the kinds of personal data detected.
- **AC-KIT-015.9:** A `personal_data` failure shall not contain the matched text.
- **AC-KIT-015.10:** When the opt-in is set, the package shall send the call without the personal-data refusal.
- **AC-KIT-015.11:** No consumer source file shall set the opt-in while the gateway lists Jev without zero data retention.
- **AC-KIT-015.12:** The package shall export its personal-data scan as a function a caller can run without making a call.
- **AC-KIT-015.13:** The scan shall not flag an ISO 8601 date.
- **AC-KIT-015.14:** The scan shall not flag a 10-digit Unix timestamp that begins with `1`.
- **AC-KIT-015.18:** The package shall run the size check of AC-KIT-015.15 and AC-KIT-015.16 before the personal-data scan.
- **AC-KIT-015.19:** The personal-data scan of a 30,000-character state shall complete in under 100 ms.
- **AC-KIT-015.20:** The package shall send only the `type`, `instructions` and `criteria` fields of each question.
- **AC-KIT-015.21:** The scan shall not flag a 7-digit local number of the form `NNN-NNNN`.
- **AC-KIT-015.15:** When the estimated tokens of the state plus the longest question exceed 32,000, the call shall resolve to a `state_too_large` failure with `sent` false.
- **AC-KIT-015.16:** When the estimated tokens of the state plus every question exceed 64,000, the call shall resolve to a `state_too_large` failure with `sent` false.
- **AC-KIT-015.17:** A `state_too_large` failure shall report the estimated token count and the limit it exceeded.

**REQ-KIT-016: Questions, answers and decisions are typed**

- **AC-KIT-016.1:** The package shall export a `noul` builder that takes instructions and optional true and false criteria.
- **AC-KIT-016.2:** The package shall export a `choice` builder that takes instructions and a map from option key to option description.
- **AC-KIT-016.3:** The package shall export a `score` builder that takes instructions and an ordered list of level descriptions.
- **AC-KIT-016.4:** When the `choice` builder receives fewer than 2 options, it shall throw a `RangeError`.
- **AC-KIT-016.5:** When the `choice` builder receives more than 255 options, it shall throw a `RangeError`.
- **AC-KIT-016.6:** When the `score` builder receives fewer than 2 levels, it shall throw a `RangeError`.
- **AC-KIT-016.7:** When the `score` builder receives more than 10 levels, it shall throw a `RangeError`.
- **AC-KIT-016.8:** When any builder receives empty instructions, it shall throw a `RangeError`.
- **AC-KIT-016.9:** When a call carries a question that violates AC-KIT-016.4 through AC-KIT-016.8, the call shall resolve to an `invalid_request` failure with `sent` false.
- **AC-KIT-016.10:** When a call carries an empty state, the call shall resolve to an `invalid_request` failure with `sent` false.
- **AC-KIT-016.11:** When a call carries no questions, the call shall resolve to an `invalid_request` failure with `sent` false.
- **AC-KIT-016.12:** A success result's `answers` shall be typed so that each question key maps to the answer type of the question asked under it.
- **AC-KIT-016.13:** A `choice` answer's `choice` field shall be typed as the union of that question's option keys.
- **AC-KIT-016.14:** When a `choice` answer names an option the question did not offer, the call shall resolve to a `bad_response` failure.
- **AC-KIT-016.15:** When a `noul` answer's probability is not a number from 0 to 1, the call shall resolve to a `bad_response` failure.
- **AC-KIT-016.16:** The package shall export a `decide` function that takes a probability and thresholds and returns `"yes"`, `"no"` or `"unsure"`.
- **AC-KIT-016.17:** `decide` shall return `"yes"` when the probability is at or above `yesAtOrAbove`.
- **AC-KIT-016.18:** `decide` shall return `"no"` when the probability is at or below `noAtOrBelow`.
- **AC-KIT-016.19:** `decide` shall return `"unsure"` when the probability lies in the unsure band.
- **AC-KIT-016.20:** `decide` shall return `"unsure"` when the probability is not a finite number from 0 to 1.
- **AC-KIT-016.21:** `decide` shall throw a `RangeError` when `noAtOrBelow` is not less than `yesAtOrAbove`.
- **AC-KIT-016.22:** `decide` shall throw a `RangeError` when either threshold lies outside 0 to 1.
- **AC-KIT-016.23:** The package shall export no default threshold.
- **AC-KIT-016.24:** The package shall export a `decideChoice` function that returns a `choice` answer's option key when its confidence is at or above a caller-supplied minimum, and `"unsure"` otherwise.
- **AC-KIT-016.25:** When a `choice` answer lacks a probabilities map, carries a confidence outside 0 to 1, or carries a probability outside 0 to 1 or for an option not offered, the call shall resolve to a `bad_response` failure.
- **AC-KIT-016.26:** When a `score` answer's value lies outside 0 to the number of levels minus 1, lacks a probabilities map, carries a confidence outside 0 to 1, or carries a probability outside 0 to 1 or for a level that does not exist, the call shall resolve to a `bad_response` failure.
- **AC-KIT-016.27:** When a question, its criteria, or its options are null or not objects of the expected shape, the call shall resolve to an `invalid_request` failure with `sent` false.

## Blueprints

`@blueprint:paver-jev-guarded-decision-client` (**Revision 2**) — all eight components; ADR-001
(typed failure, never throw), ADR-002 (pattern net that refuses), ADR-003 (chars ÷ 3 estimate),
ADR-004 (full jitter, Retry-After floor, budget checked before every wait), ADR-005 (zero deps,
injected transport and clock, `types: []`), ADR-006 (no default threshold), ADR-007 (builders throw,
`ask` does not), ADR-008 (the body is rebuilt from known fields and that object is sized, scanned and sent). `@blueprint:paver-os-kit-platform` — build, test and git-tag release conventions.

## E2E Acceptance Tests

Test-case names in `packages/jev/src/*.test.ts`; each test carries its AC ids in a comment above it.

- **COV_KIT_040** — covers AC-KIT-013.1, AC-KIT-013.2, AC-KIT-013.3, AC-KIT-013.4, AC-KIT-013.5, AC-KIT-013.6, AC-KIT-013.7, AC-KIT-013.8, AC-KIT-013.9, AC-KIT-013.10, AC-KIT-013.11, AC-KIT-013.12, AC-KIT-013.23, AC-KIT-013.24, AC-KIT-013.25, AC-KIT-013.26, AC-KIT-013.27 — success path, endpoint, model, usage, cost-undefined-not-zero. Tests: `client.test.ts`: "success: …", "usage: …" (×2)
- **COV_KIT_041** — covers AC-KIT-013.2, AC-KIT-013.3, AC-KIT-013.5, AC-KIT-013.6, AC-KIT-013.8, AC-KIT-013.9, AC-KIT-013.10, AC-KIT-013.20, AC-KIT-013.21, AC-KIT-013.22, AC-KIT-016.14, AC-KIT-016.15 — failure kinds, no rejection. Tests: `client.test.ts`: "auth: …" (×2), "rejected: …" (×2), "bad_response: …" (×4), "answers: …", "network: …"
- **COV_KIT_042** — covers AC-KIT-014.1, AC-KIT-014.2, AC-KIT-014.3, AC-KIT-014.4, AC-KIT-014.5, AC-KIT-014.6, AC-KIT-014.7, AC-KIT-014.8, AC-KIT-014.9, AC-KIT-014.10, AC-KIT-014.11, AC-KIT-014.12, AC-KIT-014.13 — retry, jitter, Retry-After (both forms), budget, attempt timeout. Tests: `client.test.ts`: "retry: …" (×8), "timeout: …" (×3)
- **COV_KIT_043** — covers AC-KIT-013.14, AC-KIT-013.15, AC-KIT-013.16, AC-KIT-013.17, AC-KIT-013.18, AC-KIT-013.19 — default fetch, key at call time, newline guard, missing key, key never in a failure, no console. Tests: `client.test.ts`: "transport: …", "key: …" (×3), "console: …"
- **COV_KIT_044** — covers AC-KIT-015.1, AC-KIT-015.2, AC-KIT-015.3, AC-KIT-015.4, AC-KIT-015.5, AC-KIT-015.6, AC-KIT-015.7, AC-KIT-015.8, AC-KIT-015.9, AC-KIT-015.10, AC-KIT-015.12, AC-KIT-015.13, AC-KIT-015.14 — personal-data scan, refusal, opt-in, non-flagged dates and timestamps. Tests: `guards.test.ts`: "personal data: …" (×7); `client.test.ts`: "personal data: …" (×3)
- **COV_KIT_045** — covers AC-KIT-015.15, AC-KIT-015.16, AC-KIT-015.17, AC-KIT-016.9, AC-KIT-016.10, AC-KIT-016.11 — size refusals, invalid requests, all unsent. Tests: `client.test.ts`: "size: …" (×2), "invalid_request: …"; `guards.test.ts`: "size: …"
- **COV_KIT_046** — covers AC-KIT-016.1, AC-KIT-016.2, AC-KIT-016.3, AC-KIT-016.4, AC-KIT-016.5, AC-KIT-016.6, AC-KIT-016.7, AC-KIT-016.8, AC-KIT-016.16, AC-KIT-016.17, AC-KIT-016.18, AC-KIT-016.19, AC-KIT-016.20, AC-KIT-016.21, AC-KIT-016.22, AC-KIT-016.23, AC-KIT-016.24 — builders, decide, decideChoice, no default threshold. Tests: `guards.test.ts`: "builders: …" (×4), "decide: …" (×4), "decideChoice: …"
- **COV_KIT_047** — covers AC-KIT-013.4, AC-KIT-016.12, AC-KIT-016.13 — compile-time result and answer typing. Tests: `src/result-type.typecheck.ts` via `pnpm -r exec tsc --noEmit` (`@ts-expect-error` lines fail the gate if the types loosen)
- **COV_KIT_048** — covers AC-KIT-013.13, AC-KIT-013.28, AC-KIT-013.29 — zero runtime deps; smoke makes one call, only when `JEV_LIVE=1`. Tests: `package.test.ts` (×3)
- **COV_KIT_049** — covers Revision 2 — AC-KIT-015.1, AC-KIT-015.2, AC-KIT-015.3, AC-KIT-015.18, AC-KIT-015.19, AC-KIT-015.20, AC-KIT-015.21, AC-KIT-016.25, AC-KIT-016.26, AC-KIT-016.27, AC-KIT-014.13, AC-KIT-014.15, AC-KIT-013.2, AC-KIT-013.18 — size before scan, linear scan, keys scanned, known fields only, phone forms, 7-digit decision, full answer validation, null-shaped questions, deaf fetch, throwing clock, short key, every timing default. Tests: `hardening.test.ts` (×23)
- **COV_KIT_050** — covers AC-KIT-014.14 — every AC-KIT-014.13 default is overridden at client creation in the suite (`maxAttempts`, `attemptTimeoutMs`, `totalBudgetMs` in `hardening.test.ts`; `baseDelayMs`, `maxDelayMs`, `attemptTimeoutMs`, `maxAttempts` in `client.test.ts`) and the overridden value is what the assertion observes.
- **COV_KIT_051** — covers AC-KIT-015.11 — policy check, not a unit test: `grep -rln allowPersonalData` over every `projects/*/` `.ts`/`.tsx` outside kit returns no file (main thread, 2026-09-25). Re-run at each consumer's Work Order.

Revision 2 mutations, 2026-09-25, each red then restored byte-identical (`cmp`): restoring the
backtracking email regex reds the 30,000-char scan-time test; moving the size check after the scan
reds "size-first: an oversized state that also contains an email…" (the 1M-char timing test alone
stayed green under that mutation, which is why the ordering test exists); dropping question keys
from the scan reds "scan: an email used as a question KEY…"; serializing the caller's raw questions
instead of the wire object reds "wire: an extra field on a question is not sent…".

Revision 1 mutations, 2026-09-25: removing the key scrub turns "key: never appears in a failure…" red;
disabling the personal-data check turns both client "personal data: …" refusal tests red. Source
restored byte-identical after each (verified with `cmp`).

## Verification

| Signal | Command (kit root, Node 22, pnpm 9) | Pass condition |
| Install | `pnpm install --frozen-lockfile` | exits 0 with the updated lockfile |
| Build | `pnpm -r build` | exits 0; `packages/jev/dist/index.js` + `index.d.ts`, no imports in the bundle |
| Types | `pnpm -r exec tsc --noEmit` | exits 0, including `result-type.typecheck.ts` |
| Tests | `pnpm -r test` | green, **and** jev tests-run equals `grep -c '^test(' src/*.test.ts` summed |
| Live | `JEV_LIVE=1 AI_GATEWAY_API_KEY=… node --experimental-strip-types packages/jev/scripts/smoke.ts` | one call, `ok: true`, answers `failed` ≈ yes and `area` = `test`; main thread runs it |

## Blockers on `in-progress/` → `done/`

| Field | Value |
|---|---|
| Blocker | `bootstrap-operator-approval-jev` |
| Scope | The whole FRD: `@REQ-KIT-013`–`016` declares bootstrap mode — no Product Overview, no committed consumer, and `@paver/jev` is not among the packages `AC-KIT-007.1` names |
| Requirement | `@REQ-KIT-013` … `@REQ-KIT-016` — present, bootstrap mode claimed in its header |
| Blueprint | `@blueprint:paver-jev-guarded-decision-client` — present |
| Needs | Tony's explicit approval of the bootstrap claim, recorded in the FRD header |
| Remediation | Closes when a first consumer's Requirement cites `@REQ-KIT-013` |

## Notes

- The main thread ran the live smoke on 2026-09-25: `ok: true`, 1 attempt, 856 ms. Before that, the builder had not run it. Its skip path was run once
  (no `JEV_LIVE`): it printed the skip line, exited 0, and made no call.
- Node's test runner treats any file named `test-*` as a test file; the harness is named
  `fixtures.ts` so the reported test count equals the tests written.
- `tsconfig.json` sets `types: []` rather than the sibling packages' `["node"]`: this package must
  not reach a Node-only API (ADR-005), and `@types/node` is not a declared devDependency anywhere in
  kit. Test files are excluded from `tsc` as in the sibling packages.

## Lifecycle

- 2026-09-25 — allocated and placed in `in-progress/` (no `blocked-by`); implementation built
  test-first; gates green in the builder's run.
- 2026-09-25 — independent review found 5 defects plus minors; fixed test-first against FRD
  Revision 2 and Blueprint Revision 2; gates green, 78 tests run of 78 written.
- 2026-09-25 — main thread re-ran gates (78/78 jev, 5/5 supabase, 6/6 contracts; build + tsc exit 0) and the live smoke (ok, 1 attempt); released `jev-v0.1.0` (tag pushed). Tony approved the bootstrap claim (recorded in the FRD header); blocker `bootstrap-operator-approval-jev` closed; moved to `done/`.
