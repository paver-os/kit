# @paver/jev — The Guarded Jev Decision Client

> **Type:** Feature Requirements Document (FRD)
> **ID Prefix:** KIT
> **Status:** Draft
> **Owner:** Tony Davis (operator) · Karl Strunk (Author)
> **Revision:** 3 — 2026-10-31. TypeSafe released Jev 1.14.0 (gateway id `typesafe-ai/jev-1.14.0`, released 2026-10-14), which accepts images and lists `zdr: all`. Added **REQ-KIT-017** (AC-KIT-017.1 – .19): the `/v1/decisions` wire, the versioned model, zero data retention required on every call, image input and its guards, refusal answers, provider reporting. Re-cut in place to match: AC-KIT-013.11 and .12 (endpoint and model now name REQ-KIT-017), AC-KIT-015.20 (the wire's known fields), AC-KIT-016.10 (an image-only call may carry an empty state); the failure-kind set gains `no_zdr_provider`. AC-KIT-015.11 is unchanged — see the 2026-10-31 note under it.
> **Revision 2** — 2026-09-25. Independent review of `packages/jev`. Re-cut in place: AC-KIT-015.1 (scan every string the request body carries, question keys included — Revision 1 said "the text of every question", which left keys unscanned) and AC-KIT-015.3 (separators widened; the exchange may begin with 0 or 1). Added: AC-KIT-014.15 (timeout holds when the transport ignores its signal), AC-KIT-015.18 through .21 (size before scan, linear scan, known fields only, 7-digit decision), AC-KIT-016.25 through .27 (full answer validation, null-shaped questions). No other AC changed meaning.
> **Revision 1** — 2026-09-25.
> **Traces up to:** operator direction, Tony Davis, 2026-09-25 (commissioned `@paver/jev` as the one way products call Jev) · `@artifact:paver/.claude/skills/jev/SKILL.md` (the fleet's usage, data and fallback rules for Jev) · the 2026-09-25 live verification and 49-message pilot recorded in the Measured Facts table below.
> **Bootstrap mode:** **APPROVED by Tony Davis, 2026-09-25** (in-session: "sign off the work order and start using Jev for Surf tagging" — option a). Surf asset tagging is named as the first consumer. No Product Overview exists for Jev use, and no consumer has committed to adopting the package. `AC-KIT-007.1`'s pattern is that a package receives its Requirement when a first consumer commits; this FRD is authored ahead of that, on operator direction, because the data rule and the fallback rule must exist in code before the first product call rather than after it. Re-grade when a first consumer's Requirement cites this one.
> **Downstream:** `@blueprint:paver-jev-guarded-decision-client` · `WO-KIT-003` · `WO-KIT-004` (REQ-KIT-017).
> **Implemented in:** `packages/jev/` (`WO-KIT-003`, done 2026-09-25; released `jev-v0.1.0`) · REQ-KIT-017 in `WO-KIT-004`, done 2026-10-31; released `jev-v0.2.0`.

## Overview

Jev is TypeSafe AI's "System One" evaluation model. It writes no text. It takes a `state` string and a set of named, typed questions, and returns a calibrated answer to each: a probability for a yes/no question, a chosen option with per-option probabilities for a choice question, a graded value for a score question. It answers in about 0.4 seconds for a fraction of a cent, which makes it cheap enough to sit inside a loop or a request path — classify a build log, route an internal document, gate a pipeline step.

The fleet reaches Jev through Vercel AI Gateway. Three facts measured on 2026-09-25 shape everything below. First, the gateway is unreliable under current demand: in a 50-call run it returned `429 rate_limit_exceeded` and `503 service_unavailable_error` often enough to need 32 retries, and one call still failed after six attempts. Second, the gateway lists Jev with no zero-data-retention guarantee, and Tony's rule is that no customer or personal text goes to Jev until TypeSafe offers one. Third, the pilot showed that the default 0.5 cut-off on a yes/no probability is wrong for real questions: "is the customer upset" caught 12 of 12 but raised 5 false alarms at 0.5, and raised none at 0.75.

Each fact becomes a behaviour the package enforces so that no product has to remember it. Because calls fail, the package never throws on a failed call; it returns a typed failure that the caller's type checker forces it to handle, which forces a fallback path. Because calls are rate-limited, it retries with bounded, jittered backoff that honours the gateway's `Retry-After`. Because the data rule is a rule and not a hope, the package refuses to send text that contains an email address, a phone number, an SSN or a card number unless the caller sets an explicit opt-in — and this FRD states that setting it is forbidden by policy today. Because thresholds are question-specific, the package ships a three-way decision helper (yes / no / unsure) with no default threshold, so the unsure band routes to the caller's fallback instead of being rounded into a wrong answer.

After this FRD ships: a product adds one pinned dependency, builds its questions with typed builders, calls one function, and handles two branches. No product hand-rolls a gateway call, no product holds retry logic, and no product can send an email address to Jev by accident.

### Measured facts this FRD is written against (2026-09-25)

| Fact | Value | Source |
|---|---|---|
| Endpoint | `POST https://ai-gateway.vercel.sh/typesafe/v1/systemone` | Live call, 2026-09-25 |
| Model id | `typesafe-ai/jev` | Live call |
| Auth | `Authorization: Bearer <AI Gateway key>` | Live call |
| `/v1/responses` with this model | `400` — "evaluation model, not a language model" | Live call |
| Question types | `noul`, `choice` (up to 255 options), `score` (2–10 levels) | Live calls, one per type |
| Response | `{model, answers, usage:{input_tokens, output_tokens}, provider_metadata:{gateway:{cost, marketCost, …}}}`; `cost` and `marketCost` are decimal **strings** | Live call |
| Limits | 32,000 tokens for state plus the longest question; 64,000 tokens per request | TypeSafe documentation as relayed 2026-09-25 — **not independently measured** |
| Reliability | 50 calls: 32 retries, 1 failure after 6 attempts; 429 and 503 observed | Live run |
| Latency when served | median 0.38 s, max 0.62 s | Live run |
| Data retention | gateway lists zero-data-retention = none, no-training = all | Gateway model listing |
| Endpoint (since Revision 3) | `POST https://ai-gateway.vercel.sh/v1/decisions` (OpenAI-compatible); questions are a named array of `predicate` / `choice` / `score` | Live call, 2026-10-31 |
| Versioned model | `typesafe-ai/jev-1.14.0` (released 2026-10-14): accepts images, gateway lists `zdr: all`; plain `typesafe-ai/jev` lists `zdr: some`, text-only | Gateway model listing + live call, 2026-10-31 |
| ZDR enforcement | `providerOptions.gateway.zeroDataRetention: true` routed to `typesafe-ai` ("all 1 attempts support ZDR"); with no ZDR provider the gateway returns `400` `no_providers_available` | Live call + gateway docs, 2026-10-31 |
| Images | base64 data URLs only, at most 128 per request, detail `low` / `high` / `auto` / `original`; a 512 px JPEG at `low` ≈ 1,060 input tokens ≈ $0.000045 | Live calls + gateway docs, 2026-10-31 |
| Refusal | a declined question comes back `{"type":"refusal","name":…}` in its position; the others are answered | Gateway docs, 2026-10-31 — not observed live |
| Pilot accuracy | 49 synthetic tickets: intent choice 48/49; "upset" noul 12/12 caught, 5 false positives at 0.5, 0 errors at 0.75 | Pilot run |

## Terminology

- **Jev** — TypeSafe AI's System One evaluation model, addressed as `typesafe-ai/jev`.
- **State** — the text a call asks questions about.
- **Question** — one named, typed request for a judgement about the state. Its **key** is the name the caller gives it; its answer is returned under the same key.
- **noul question** — a yes/no question. Its answer is the probability, from 0 to 1, that the answer is yes.
- **choice question** — a question whose answer is one of a set of caller-named **options**, with a probability per option and a confidence.
- **score question** — a question whose answer is a graded value across 2 to 10 caller-described **levels**, with a probability per level and a confidence.
- **Call** — one invocation of the package's ask function. A call makes one or more **attempts**.
- **Attempt** — one HTTP request to the gateway.
- **Result** — the value a call resolves to: a **success** carrying answers and usage, or a **failure** carrying a failure kind.
- **Failure kind** — one value from the closed set `personal_data`, `state_too_large`, `invalid_request`, `missing_key`, `auth`, `rejected`, `no_zdr_provider`, `exhausted`, `bad_response`.
- **Image** — a JPEG, PNG, WebP or GIF the caller attaches to a call, given as bytes or as base64 without a `data:` prefix.
- **Refused answer** — the answer for a question Jev declined: `{ type: "refusal", refused: true }`.
- **Refusal** — a failure the package returns before any attempt is made.
- **Retryable outcome** — an attempt that ends in HTTP status 429, 500, 502, 503 or 504, in the attempt timeout, or in the transport rejecting.
- **Attempt timeout** — the longest the package waits for one attempt's response before aborting it.
- **Budget** — the longest one call may take, from its start, across every attempt and every wait.
- **Full jitter** — a wait drawn uniformly at random between zero and a ceiling that doubles with each retry.
- **Gateway key** — the Vercel AI Gateway API key, read from the environment variable `AI_GATEWAY_API_KEY`.
- **Personal data** — for this package's guard, text matching an email address, a phone number, a US Social Security number, or a payment card number. The guard is a net for obvious patterns, not a classifier; the policy it enforces forbids personal text wholesale, including names and addresses the guard cannot see.
- **Zero data retention (ZDR)** — a provider guarantee that request content is not stored after the response.
- **Opt-in** — the call option `allowPersonalData: true`, which disables the personal-data refusal.
- **Estimated tokens** — the character count of a text divided by 3, rounded up.
- **Thresholds** — a caller-chosen pair: `yesAtOrAbove` and `noAtOrBelow`.
- **Unsure band** — probabilities strictly between `noAtOrBelow` and `yesAtOrAbove`.

## Requirements

### REQ-KIT-013: A Jev call resolves to a typed result and never throws on failure

**User Story:** As a product engineer putting a Jev decision in a request path, I want every Jev call to resolve to a value my type checker makes me branch on, so that a Jev outage sends my feature down its fallback path instead of crashing it.

**Acceptance Criteria:**

*The call and its result*

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

*The endpoint and the transport*

- **AC-KIT-013.11:** The package shall send every attempt as a `POST` to the endpoint named in AC-KIT-017.1. *(Revision 3; was `…/typesafe/v1/systemone`.)*
- **AC-KIT-013.12:** The package shall send every attempt with the model id named in AC-KIT-017.2. *(Revision 3; was `typesafe-ai/jev`.)*
- **AC-KIT-013.13:** The package shall declare no runtime dependency.
- **AC-KIT-013.14:** The package shall accept a caller-supplied fetch function and shall use the global `fetch` when none is supplied.

*The key*

- **AC-KIT-013.15:** When the caller supplies no key, the package shall read the gateway key from `AI_GATEWAY_API_KEY` at call time.
- **AC-KIT-013.16:** The package shall remove trailing whitespace and a trailing literal `\n` from the key before use.
- **AC-KIT-013.17:** When no key is available, the call shall resolve to a `missing_key` failure with `sent` false.
- **AC-KIT-013.18:** No failure result shall contain the gateway key in any field.
- **AC-KIT-013.19:** The package shall write nothing to the console.

*Non-retryable responses*

- **AC-KIT-013.20:** When an attempt returns status 401 or 403, the call shall resolve to an `auth` failure after that one attempt.
- **AC-KIT-013.21:** When an attempt returns any other status from 400 to 499 except 408 and 429, the call shall resolve to a `rejected` failure after that one attempt.
- **AC-KIT-013.22:** An `auth` or `rejected` failure shall carry the HTTP status.

*Usage and cost*

- **AC-KIT-013.23:** A success result shall report the input token count and the output token count from the response's `usage`.
- **AC-KIT-013.24:** When the response carries `provider_metadata.gateway.cost`, a success result shall report it as a number.
- **AC-KIT-013.25:** When the response carries `provider_metadata.gateway.marketCost`, a success result shall report it as a number.
- **AC-KIT-013.26:** When the response carries no parseable cost figure, the success result shall leave that field undefined and shall not report zero.
- **AC-KIT-013.27:** Every result shall report the call's elapsed time in milliseconds.

*Live proof*

- **AC-KIT-013.28:** The package shall ship a live smoke script that makes exactly one call with a synthetic, non-personal state.
- **AC-KIT-013.29:** The live smoke script shall exit without making a call unless the environment variable `JEV_LIVE` equals `1`.

### REQ-KIT-014: Rate limits and outages are retried within a bound

**User Story:** As a product engineer calling Jev while the gateway is under heavy demand, I want the package to retry rate-limited and unavailable responses with bounded backoff, so that most calls succeed without my code retrying and no call hangs my request past a known limit.

**Acceptance Criteria:**

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

### REQ-KIT-015: Personal data and oversized requests are refused before sending

**User Story:** As the operator, I want the client itself to refuse text containing personal data and requests Jev cannot accept, so that the no-personal-data rule holds even when a product engineer forgets it and no call wastes an attempt on a request Jev will reject.

**Acceptance Criteria:**

*Personal data*

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
  - *Recorded 2026-10-31, no change to this AC or to the guard's default:* the versioned model `typesafe-ai/jev-1.14.0` lists `zdr: all`, and since Revision 3 every call requires zero data retention (AC-KIT-017.3), measured live 2026-10-31. Whether that lifts this AC is an operator decision (Open Question 1); until Tony records it here, the opt-in stays forbidden and the personal-data refusal stays on by default.
- **AC-KIT-015.12:** The package shall export its personal-data scan as a function a caller can run without making a call.
- **AC-KIT-015.13:** The scan shall not flag an ISO 8601 date.
- **AC-KIT-015.14:** The scan shall not flag a 10-digit Unix timestamp that begins with `1`.
- **AC-KIT-015.18:** The package shall run the size check of AC-KIT-015.15 and AC-KIT-015.16 before the personal-data scan.
- **AC-KIT-015.19:** The personal-data scan of a 30,000-character state shall complete in under 100 ms.
- **AC-KIT-015.20:** The package shall send only the fields of each question named in AC-KIT-017.18 (`type`, `name`, `instructions`, and `choices` or `levels`). *(Revision 3; was `type`, `instructions`, `criteria`.)*
- **AC-KIT-015.21:** The scan shall not flag a 7-digit local number of the form `NNN-NNNN`.

*Size*

- **AC-KIT-015.15:** When the estimated tokens of the state plus the longest question exceed 32,000, the call shall resolve to a `state_too_large` failure with `sent` false.
- **AC-KIT-015.16:** When the estimated tokens of the state plus every question exceed 64,000, the call shall resolve to a `state_too_large` failure with `sent` false.
- **AC-KIT-015.17:** A `state_too_large` failure shall report the estimated token count and the limit it exceeded.

### REQ-KIT-016: Questions, answers and decisions are typed

**User Story:** As a product engineer, I want typed builders for each question type, typed answers keyed by my question names, and a yes / no / unsure helper that takes my own thresholds, so that a malformed question fails at build time and an uncertain answer reaches my fallback instead of being rounded into a wrong one.

**Acceptance Criteria:**

*Builders*

- **AC-KIT-016.1:** The package shall export a `noul` builder that takes instructions and optional true and false criteria.
- **AC-KIT-016.2:** The package shall export a `choice` builder that takes instructions and a map from option key to option description.
- **AC-KIT-016.3:** The package shall export a `score` builder that takes instructions and an ordered list of level descriptions.
- **AC-KIT-016.4:** When the `choice` builder receives fewer than 2 options, it shall throw a `RangeError`.
- **AC-KIT-016.5:** When the `choice` builder receives more than 255 options, it shall throw a `RangeError`.
- **AC-KIT-016.6:** When the `score` builder receives fewer than 2 levels, it shall throw a `RangeError`.
- **AC-KIT-016.7:** When the `score` builder receives more than 10 levels, it shall throw a `RangeError`.
- **AC-KIT-016.8:** When any builder receives empty instructions, it shall throw a `RangeError`.
- **AC-KIT-016.9:** When a call carries a question that violates AC-KIT-016.4 through AC-KIT-016.8, the call shall resolve to an `invalid_request` failure with `sent` false.
- **AC-KIT-016.10:** When a call carries an empty state and no image, the call shall resolve to an `invalid_request` failure with `sent` false. *(Revision 3 added "and no image".)*
- **AC-KIT-016.11:** When a call carries no questions, the call shall resolve to an `invalid_request` failure with `sent` false.

*Answers*

- **AC-KIT-016.12:** A success result's `answers` shall be typed so that each question key maps to the answer type of the question asked under it.
- **AC-KIT-016.13:** A `choice` answer's `choice` field shall be typed as the union of that question's option keys.
- **AC-KIT-016.14:** When a `choice` answer names an option the question did not offer, the call shall resolve to a `bad_response` failure.
- **AC-KIT-016.15:** When a `noul` answer's probability is not a number from 0 to 1, the call shall resolve to a `bad_response` failure.

*Decisions*

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

### REQ-KIT-017: Calls use the versioned Jev with zero data retention, and may carry images

**User Story:** As a product engineer who needs to label photos — product, person, shot quality — I want to ask Jev typed questions about images through the same guarded client, on a model that guarantees zero data retention on every call, so that I can identify images cheaply without hand-rolling a gateway call or reasoning about retention myself.

**Acceptance Criteria:**

*Endpoint, model, retention*

- **AC-KIT-017.1:** The package shall send every attempt as a `POST` to `https://ai-gateway.vercel.sh/v1/decisions`.
- **AC-KIT-017.2:** The package shall send the model id `typesafe-ai/jev-1.14.0` unless the caller sets a `model` when creating the client, in which case it shall send that id.
- **AC-KIT-017.3:** Every attempt's body shall carry `providerOptions.gateway.zeroDataRetention` set to `true`.
- **AC-KIT-017.4:** No client configuration value and no call option shall remove or change the field named in AC-KIT-017.3.
- **AC-KIT-017.5:** When an attempt returns status 400 with error type `no_providers_available`, the call shall resolve to a `no_zdr_provider` failure carrying the status, with `sent` true, after that one attempt.

*Images*

- **AC-KIT-017.6:** The ask function shall accept an optional list of images. A call with no image shall send the state as a plain-string `input`; a call with one or more images shall send one user message whose parts are the state as `input_text` (omitted when the state is empty) followed by each image as `input_image`, in the caller's order.
- **AC-KIT-017.7:** The package shall send each image as `data:<media type>;base64,<data>` with the caller's detail, or `low` when the caller gives none.
- **AC-KIT-017.8:** When a call carries more than 128 images, the call shall resolve to an `invalid_request` failure with `sent` false.
- **AC-KIT-017.9:** When an image's media type is not `image/jpeg`, `image/png`, `image/webp` or `image/gif`, or its detail is not `low`, `high` or `auto`, the call shall resolve to an `invalid_request` failure with `sent` false.
- **AC-KIT-017.10:** When an image is empty, exceeds 5 MB (5,242,880 bytes) decoded, or its string data is not bare base64 (a `data:` prefix, a URL or a non-base64 character), the call shall resolve to an `invalid_request` failure with `sent` false.
- **AC-KIT-017.11:** The size check of AC-KIT-015.15 and AC-KIT-015.16 shall count each image as part of the state: 1,100 estimated tokens at detail `low`, and 4,400 at `high` or `auto`.
- **AC-KIT-017.12:** When a call carries images, the personal-data scan of AC-KIT-015.1 shall still run over the state and every question string.
- **AC-KIT-017.13:** The package shall not run the personal-data scan over image data.

*Answers*

- **AC-KIT-017.14:** When the response answers a question with type `refusal`, the success result shall carry `{ type: "refusal", refused: true }` under that question's key and the other questions' answers unchanged.
- **AC-KIT-017.15:** The package shall match each answer to its question by the answer's `name`; when no answer carries a question's name, the call shall resolve to a `bad_response` failure.
- **AC-KIT-017.16:** `decide` and `decideChoice` shall return `"unsure"` for a refused answer, and `decide` shall accept a noul answer as well as a bare probability.
- **AC-KIT-017.17:** When the response carries `provider_metadata.gateway.routing.finalProvider`, a success result's usage shall report it as `provider`; otherwise `provider` shall be undefined.
- **AC-KIT-017.18:** The package shall send a noul question as `predicate` with its true and false criteria appended to its instructions, a choice question as `choice` with `choices: [{ value, description }]`, and a score question as `score` with `levels: [{ label }]`, as an array named by the caller's keys; and it shall return answers in the shapes of REQ-KIT-016 (a choice's probabilities keyed by option, a score's keyed by level index).
- **AC-KIT-017.19:** Each answer's type shall be a union with the refused answer, so that a TypeScript caller cannot read an answer's value without first ruling the refusal out.

*Image dimensions (v0.2.1, measured 2026-11-01)*

- **AC-KIT-017.20:** The package shall read an image's width and height from its header bytes, without a dependency, for JPEG (start-of-frame marker), PNG (IHDR), WebP (VP8, VP8L, VP8X) and GIF (logical screen).
- **AC-KIT-017.21:** When an image's short edge is under 280 px, or its long edge divided by its short edge exceeds 5, the call shall resolve to an `invalid_request` failure with `sent` false whose message names the image's index and its width×height, and no request shall be made.
- **AC-KIT-017.22:** When an image's header cannot be read, the package shall send the image unrefused and leave the decision to the gateway.
- **AC-KIT-017.23:** When the gateway answers HTTP 400 with a message containing "Invalid image dimensions", the call shall resolve to an `invalid_request` failure with `sent` true and status 400 after that one attempt, without retry.
- **AC-KIT-017.24:** The package shall export the limits as `JEV_MIN_SHORT_EDGE = 280` and `JEV_MAX_ASPECT = 5`. Source: Jev 1.14.0 refused 7 of 9 OverlayPro crops (e.g. 35×522) and a 270 px-short-side RACK poster, and accepted 280 px (2026-11-01); the edges are measured, not documented.

## Scope Boundary

**In scope:** one client for Jev's System One endpoint through Vercel AI Gateway; the typed failure contract; retry, backoff and budget; the personal-data and size refusals; typed question builders and answers; the yes / no / unsure decision helpers; usage and cost reporting per call; one opt-in live smoke script.

**Out of scope, with reasons:**

| Excluded | Why |
|---|---|
| Choosing thresholds for any real question | Question-specific and data-specific. The pilot showed 0.5 is wrong for "upset" and 0.75 is right; that is a fact about one question. Each consumer labels its own sample. |
| Detecting names, street addresses and free-text personal details | No pattern does this reliably. The policy (AC-KIT-015.11 and the skill's data rule) forbids personal text wholesale; the guard catches the patterns a regex can see and says so. |
| Calling Jev over `/v1/responses` or through the AI SDK | Measured: that path returns 400 for this model. |
| Image URLs, file ids, detail `original`, and image resizing | The gateway accepts only base64 data URLs; `original` has no measured token cost; resizing is the caller's job (a 512 px JPEG at `low` is the measured case). |
| Scanning images for personal data | No pattern can read pixels. Images are allowed because zero data retention is required on every call (AC-KIT-017.3), not because they are known to be clean. |
| A response cache, request batching across calls, or a circuit breaker | No consumer has asked. Each is a Requirement when one does. |
| Budget and spend alerts | The gateway key carries its own monthly cap (`paver-jev`, $10). When the cap is hit, calls fail and callers take their fallback. |
| Direct TypeSafe API access | TypeSafe paused direct sign-ups on 2026-09-22; the gateway is the only route in hand. |

## Known Risks

- **The gateway is the only route, and it is congested.** Retries raise the success rate; they do not make Jev available. Every consumer needs a fallback that is correct on its own (AC-KIT-013.4 forces the branch; it cannot force the branch to be right).
- **The token estimate is an approximation.** Characters ÷ 3 over-counts English prose and under-counts dense non-Latin text. The error is toward refusing a request Jev would have accepted, which is the safe direction. The 32,000 and 64,000 limits themselves are relayed from TypeSafe documentation, not measured.
- **A 7-digit local number is not detected (AC-KIT-015.21).** `555-1234` is indistinguishable from part numbers, invoice numbers and ranges; flagging it would refuse ordinary catalog text. The policy, not the pattern, covers it.
- **The phone pattern will refuse some non-personal numbers.** A bare 10-digit SKU or order number in North American phone shape is refused. That is the safe direction; the opt-in is not the remedy, because it is forbidden by policy. The remedy is trimming the state to the part the question needs.
- **Retry-After can exceed the budget.** A gateway that asks for a 30-second wait inside an 8-second budget ends the call at once as `exhausted` (AC-KIT-014.8). That is intended: the caller's budget outranks the gateway's request.
- **The image token estimate is anchored on one measurement.** 1,100 per `low` image comes from a 512 px JPEG (1,063–1,120 input tokens with short text, 2026-10-31); `high` and `auto` are unmeasured and set 4× higher. A call near the limit may be refused that Jev would accept — the safe direction.
- **Routing can resolve to more than one upstream provider.** A 2026-09-25 response listed `digitalocean` and `typesafe-ai`. Data-retention guarantees must be checked across the whole route before AC-KIT-015.11 is lifted.

## Open Questions

1. **When is AC-KIT-015.11 lifted?** When TypeSafe and the gateway both list zero data retention for every provider on Jev's route. Lifting it is an operator decision recorded in this FRD with the date and source; it is not a code change in the package. *2026-10-31:* `typesafe-ai/jev-1.14.0` lists `zdr: all` and every call now requires it (AC-KIT-017.3); the decision is still open.
2. **Who is the first consumer?** None has committed. The bootstrap claim above closes when one does.

<!--
Karl's notes:

NUMBERING — the last Requirement in this repo was REQ-KIT-012 (REQ-KIT-008 FRD holds 008..012;
  REQ-KIT-001 FRD holds 001..007). Grepped every file under .paver/ plus README.md and CLAUDE.md,
  and the paver root, for REQ-KIT-013..019: none existed. Allocated REQ-KIT-013 through
  REQ-KIT-016, following the REQ-KIT-008 precedent of one FRD file named by its first id.

TRACEABILITY — bootstrap mode is CLAIMED and needs Tony's explicit approval. AC-KIT-007.1 only
  names five deferred packages; @paver/jev is not among them, so this FRD is not a fulfilment of
  AC-KIT-007.1. It traces to operator direction and the jev skill's rules.

MODAL CHOICES — AC-KIT-014.14 is `may` (a permission to the caller). AC-KIT-015.11 is a policy
  criterion on consumers, verified by grep over consumer repositories for `allowPersonalData: true`
  during drift review; the package cannot enforce it and does not pretend to.

REVISION 2 — AC-KIT-016.25 and .26 each list several conditions joined by "or". They are one
  claim each ("a structurally invalid answer of this type is bad_response"), each condition has its
  own test, and splitting them into eight ACs would add ids without adding a test. Flagged for
  Karl's next drift review; split if he disagrees.

REVISION 3 — REQ-KIT-017 was the next free id (grepped .paver/ for REQ-KIT-017..019: none). AC-KIT-017.6
  and .18 each describe one translation with several parts; each part has its own assertion in
  decisions.test.ts. The refusal shape is from the gateway docs; a live refusal has not been observed.

REVISION 4 — AC-KIT-017.20–.24 added for v0.2.1 (WO-KIT-005): the pre-send dimension guard.

UNSOURCED, and marked: the 32,000 / 64,000 token limits (relayed from TypeSafe docs, not measured);
  the characters-per-token ratio (chosen conservative, not measured against Jev's tokenizer);
  whether 500/502/504 occur on this route (only 429 and 503 were observed; retried anyway because
  they are transient by HTTP semantics).
-->
