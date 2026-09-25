# @paver/jev — Guarded Jev Decision Client — Component Blueprint

> **Type:** Component Blueprint
> **Paver Level:** OS (shared package in `paver-os/kit`; consumed by both roots, belongs to neither)
> **Traces up to:** `@REQ-KIT-013` · `@REQ-KIT-014` · `@REQ-KIT-015` · `@REQ-KIT-016` (file: `kit/.paver/requirements/frds/REQ-KIT-013-paver-jev-guarded-decision-client.md`, **Revision 2**, bootstrap mode claimed — see that FRD's header)
> **Composed by:** `@blueprint:paver-os-kit-platform` (build/release container). No consumer Blueprint composes it yet.
> **Implemented by:** `WO-KIT-003` → `packages/jev/`
> **Status:** Draft
> **Owner:** Boris Frank (Architect)
> **Last reviewed by Boris:** 2026-09-25 — **Revision 2.** Re-synced to `@REQ-KIT-013` Revision 2 after an independent code review. `#JevRequestPreflight` now runs size before the scan and builds the wire body from known fields only, then scans exactly that body, question keys included; `#PersonalDataScanner`'s email check is a linear hand-scan rather than a backtracking regex; `#SystemOneResponseReader` validates every field an answer type promises; `#GatewayRetryLoop` races the transport against its own timer. ADR-008 records the wire-body decision.
> **Revision 1** — 2026-09-25.

## Capability Summary

`@paver/jev` is the only place in the fleet that builds a request to Jev's System One endpoint. A consumer hands it a `state` string and a `JevQuestions` map built from typed builders; it hands back a `JevResult` — either typed `JevAnswers` with `JevUsage`, or a `JevFailure` of a closed kind. It never rejects.

Between the call and the network sit two refusals — personal data and size — and after the network sits one reader that trusts nothing it did not validate. Retry, backoff and the time budget live inside the client so no consumer writes its own loop against a gateway that returned 429 or 503 on most calls under the 2026-09-25 load. The package decides nothing on the caller's behalf: `#ProbabilityBandDecider` turns a probability into yes / no / unsure only against thresholds the caller supplies.

The package is feature-agnostic, tenant-agnostic and runtime-agnostic. It takes its transport, clock, sleep and randomness as injected functions, reads one environment variable, imports no Node-only module, and has no runtime dependency (`AC-KIT-013.13`, `AC-KIT-013.14`).

## Core Components

### The call

```component
name: JevDecisionClient
container: paver-os/kit (@paver/jev)
responsibilities:
  - Exposing `createJevClient(config)` and `JevClient.ask(state, questions, options)` as the one entry to Jev (AC-KIT-013.1)
  - Resolving every call to a `JevResult` discriminated by `ok`, on every path including internal error (AC-KIT-013.2, AC-KIT-013.3, AC-KIT-013.4)
  - Running `#JevRequestPreflight` before resolving the key, and resolving the key before the first attempt (AC-KIT-013.15, AC-KIT-013.17)
  - Stamping every result with `attempts` and `elapsedMs` (AC-KIT-013.7, AC-KIT-013.27)
  - Scrubbing the gateway key from every `JevFailure.message` before truncating it (AC-KIT-013.18)
  - Writing nothing to the console on any path (AC-KIT-013.19)
```

`#JevDecisionClient` calls `#JevRequestPreflight` with the `state` and the `JevQuestion` list, and returns the `JevFailure` it gets back without calling `#GatewayRetryLoop`. The order is fixed so that a refused call provably sends nothing: `sent` is `false` on every refusal because no attempt has been counted when the refusal returns (`AC-KIT-013.6`).

`#JevDecisionClient` hands `#GatewayRetryLoop` the serialized request body — `{model: "typesafe-ai/jev", state, questions}` — and the resolved key, and receives either a 2xx body text or a terminal outcome. It owns the key for the length of one call only; the key is read at call time from `AI_GATEWAY_API_KEY` (`JEV_KEY_ENV`) unless the config carries one, so a key rotated in the environment takes effect on the next call without rebuilding a client.

### Before the network

```component
name: JevRequestPreflight
container: paver-os/kit (@paver/jev)
responsibilities:
  - Refusing an empty state, an empty question map, an empty question key, or a malformed or null-shaped question as `invalid_request` (AC-KIT-016.9, AC-KIT-016.10, AC-KIT-016.11, AC-KIT-016.27)
  - Building `WireQuestions` — each question's `type`, `instructions` and `criteria`, nothing else — which is the object sized, scanned and sent (AC-KIT-015.20)
  - Running the size check before the scan (AC-KIT-015.18)
  - Running `#PersonalDataScanner` over the state and every string in `WireQuestions`, keys included, unless `AskOptions.allowPersonalData` is `true` (AC-KIT-015.1, AC-KIT-015.7, AC-KIT-015.10)
  - Refusing on any detection as `personal_data`, listing the `PersonalDataKind`s and never the matched text (AC-KIT-015.8, AC-KIT-015.9)
  - Refusing a request whose estimated tokens exceed 32,000 for state plus longest question, or 64,000 for state plus every question, as `state_too_large` with the estimate and the limit (AC-KIT-015.15, AC-KIT-015.16, AC-KIT-015.17)
```

`#JevRequestPreflight` calls the same `questionProblem` check the builders in `#TypedQuestionBuilders` call, so a question built by hand and a question built by a builder are judged by one rule. The difference is only in how a failure surfaces: the builder throws `RangeError` at the call site, the preflight returns `invalid_request` (ADR-007).

```component
name: PersonalDataScanner
container: paver-os/kit (@paver/jev)
responsibilities:
  - Detecting email addresses, North American and `+`-prefixed international phone numbers, `NNN-NN-NNNN` SSNs, and Luhn-valid 13–19-digit card numbers (AC-KIT-015.2 through AC-KIT-015.6)
  - Not flagging ISO 8601 dates, 10-digit Unix timestamps beginning with `1`, or 7-digit `NNN-NNNN` local numbers (AC-KIT-015.13, AC-KIT-015.14, AC-KIT-015.21)
  - Scanning in time linear in its input: every regex is bounded in length and email is a single pass over each '@' (AC-KIT-015.19)
  - Being exported as `detectPersonalData(text)` so a caller can pre-check without a call (AC-KIT-015.12)
```

`#PersonalDataScanner` returns `PersonalDataKind[]` to `#JevRequestPreflight` and nothing else — the matched substrings never leave the function, which is how `AC-KIT-015.9` holds by construction rather than by a later scrub.

### The network

```component
name: GatewayRetryLoop
container: paver-os/kit (@paver/jev)
responsibilities:
  - POSTing to `JEV_ENDPOINT` with `Authorization: Bearer` and `Content-Type: application/json` through the injected `FetchLike` (AC-KIT-013.11, AC-KIT-013.12, AC-KIT-013.14)
  - Aborting an attempt at `min(attemptTimeoutMs, budget remaining)` and treating it as retryable (AC-KIT-014.4, AC-KIT-014.5, AC-KIT-014.6)
  - Racing the transport and the body read against its own timer, so a transport that ignores the abort signal is still cut off (AC-KIT-014.15)
  - Classifying 429, 408 and 5xx as retryable, 401/403 as `auth`, and every other 4xx as `rejected`, both terminal after one attempt (AC-KIT-013.20, AC-KIT-013.21, AC-KIT-013.22)
  - Waiting before retry n for full jitter under `min(maxDelayMs, baseDelayMs × 2^(n−1))`, floored by `Retry-After` in either form (AC-KIT-014.7, AC-KIT-014.9, AC-KIT-014.10)
  - Stopping at `maxAttempts`, at the budget, or when a wait would end past the budget, and returning `exhausted` with `lastOutcome` (AC-KIT-014.2, AC-KIT-014.3, AC-KIT-014.8, AC-KIT-014.11, AC-KIT-014.12)
```

`#GatewayRetryLoop` reads `RetryPolicy` — the five numbers in `JevClientConfig` with the defaults of `AC-KIT-014.13` — once per client, and reads `now`, `sleep` and `random` from the same config. The injection exists so the loop's timing is asserted with a fake clock rather than by waiting, which is the only way `AC-KIT-014.7` through `.10` are testable to the millisecond.

`#GatewayRetryLoop` passes the text of the first 2xx response to `#SystemOneResponseReader` and returns its verdict unchanged. A malformed 2xx is not retried: the gateway answered, and asking again does not make a wrong shape right.

### After the network

```component
name: SystemOneResponseReader
container: paver-os/kit (@paver/jev)
responsibilities:
  - Rejecting a 2xx body that is not JSON or has no `answers` object as `bad_response` (AC-KIT-013.8)
  - Rejecting a missing answer, a type mismatch, a noul probability outside 0..1, or a choice outside the offered options as `bad_response` (AC-KIT-013.9, AC-KIT-013.10, AC-KIT-016.14, AC-KIT-016.15)
  - Rejecting a choice or score answer whose confidence, probabilities map or (for score) value falls outside what its question allows (AC-KIT-016.25, AC-KIT-016.26)
  - Reading `usage.input_tokens` and `usage.output_tokens` into `JevUsage` (AC-KIT-013.23)
  - Parsing `provider_metadata.gateway.cost` and `.marketCost` — decimal strings on the wire — into numbers, and leaving either undefined when absent or unparseable (AC-KIT-013.24, AC-KIT-013.25, AC-KIT-013.26)
```

`#SystemOneResponseReader` validates each answer against the `JevQuestion` asked under the same key, which is what lets `#JevDecisionClient` cast the validated object to `JevAnswers<Qs>` — the static type is only as true as this check, so the check is written against the question, not against the answer's self-description.

### The caller's side of the result

```component
name: TypedQuestionBuilders
container: paver-os/kit (@paver/jev)
responsibilities:
  - Building `NoulQuestion`, `ChoiceQuestion<K>` and `ScoreQuestion` in the exact wire shape (AC-KIT-016.1, AC-KIT-016.2, AC-KIT-016.3)
  - Throwing `RangeError` on 0–1 or 256+ choice options, 0–1 or 11+ score levels, or empty instructions (AC-KIT-016.4 through AC-KIT-016.8)
  - Carrying the option keys of a choice question as a type parameter, so `ChoiceAnswer<K>.choice` is the key union (AC-KIT-016.12, AC-KIT-016.13)
```

```component
name: ProbabilityBandDecider
container: paver-os/kit (@paver/jev)
responsibilities:
  - Mapping a noul probability to "yes" / "no" / "unsure" against caller `DecisionThresholds` (AC-KIT-016.16 through AC-KIT-016.19)
  - Returning "unsure" for a non-finite or out-of-range probability (AC-KIT-016.20)
  - Throwing `RangeError` on thresholds outside 0..1 or with `noAtOrBelow` not below `yesAtOrAbove` (AC-KIT-016.21, AC-KIT-016.22)
  - Mapping a `ChoiceAnswer<K>` to K or "unsure" against a caller `minConfidence` (AC-KIT-016.24)
```

`#ProbabilityBandDecider` reads a `NoulAnswer.noul` or a `ChoiceAnswer<K>` that the consumer takes out of a success `JevResult`; it never sees a `JevResult` itself. Keeping it a pure function of a number and the caller's thresholds is what lets the consumer measure its thresholds offline against a labeled sample and use the same function in production.

### Live proof

```component
name: JevLiveSmoke
container: paver-os/kit (@paver/jev) — `src/smoke.ts` + `scripts/smoke.ts`, not exported from the package entry
responsibilities:
  - Making exactly one call through `#JevDecisionClient` over a synthetic build-log state that `#PersonalDataScanner` passes (AC-KIT-013.28)
  - Making no call unless `JEV_LIVE` equals `1` (AC-KIT-013.29)
```

## System Contracts

### Key Contracts

**A call never rejects.** `AC-KIT-013.2`: *"When an attempt's transport rejects, the call shall resolve to a failure result and shall not reject."* `AC-KIT-013.3`: *"When an attempt returns a status outside 200–299, the call shall resolve to a failure result and shall not reject."* `#JevDecisionClient` also wraps its whole body so an injected function that throws still produces an `exhausted` failure. The builders and `decide` do throw — on programmer error, synchronously, never on the network (ADR-007).

**The caller cannot skip the fallback branch.** `AC-KIT-013.4`: *"The result type shall be a union discriminated by a boolean `ok` field, so that a TypeScript caller cannot read `answers` without first testing `ok`."* Proven at compile time by `src/result-type.typecheck.ts`, which the workspace `tsc --noEmit` gate checks.

**Nothing personal is sent by accident.** `AC-KIT-015.7`: *"When the scan detects personal data and the opt-in is not set, the call shall resolve to a `personal_data` failure with `sent` false."* `AC-KIT-015.11`: *"No consumer source file shall set the opt-in while the gateway lists Jev without zero data retention."* The package enforces the first and cannot enforce the second; drift review greps consumer repositories for `allowPersonalData: true`.

**What is scanned is what is sent.** `AC-KIT-015.1`: *"Before the first attempt, the package shall scan every string the request body carries — the state, each question key, and each string inside each question — for personal data."* `AC-KIT-015.20`: *"The package shall send only the `type`, `instructions` and `criteria` fields of each question."* The body is serialized from the same `WireQuestions` object the scan walks, so no field can be sent unscanned.

**Refusals send nothing.** Every refusal kind — `personal_data`, `state_too_large`, `invalid_request`, `missing_key` — returns before the first attempt, with `sent: false` and `attempts: 0`.

**The key never leaves in a result.** `AC-KIT-013.18`: *"No failure result shall contain the gateway key in any field."* Every `JevFailure.message` passes `redact` — the exact key and any `Bearer <token>` — before it is truncated to 300 characters, so a truncation cannot leave a fragment. The key never enters any other field.

**Retry is bounded twice.** `AC-KIT-014.2`: *"The package shall make no more than the configured maximum number of attempts per call."* `AC-KIT-014.8`: *"When the wait before the next attempt would end after the budget elapses, the package shall resolve to an `exhausted` failure without waiting."* The budget check runs before every sleep, so a `Retry-After` longer than the remaining budget ends the call at once.

**An unsourced cost is not a zero cost.** `AC-KIT-013.26`: *"When the response carries no parseable cost figure, the success result shall leave that field undefined and shall not report zero."*

**No threshold ships in the package.** `AC-KIT-016.23`: *"The package shall export no default threshold."*

### Integration Contracts

**Outbound — Vercel AI Gateway, System One.** `POST https://ai-gateway.vercel.sh/typesafe/v1/systemone`, headers `Authorization: Bearer <AI_GATEWAY_API_KEY>` and `Content-Type: application/json`, body `{"model":"typesafe-ai/jev","state":string,"questions":{[key]:JevQuestion}}`. Response `{"model","answers":{[key]:answer},"usage":{"input_tokens","output_tokens"},"provider_metadata":{"gateway":{"cost":string,"marketCost":string,…}}}`. Verified live 2026-09-25. `/v1/responses` rejects this model with 400 and is not used.

**Inbound — the consumer.**

| Export | Shape |
|---|---|
| `createJevClient` | `(config?: JevClientConfig) => JevClient` |
| `JevClient.ask` | `<const Qs extends JevQuestions>(state: string, questions: Qs, options?: AskOptions) => Promise<JevResult<Qs>>` |
| `noul` / `choice` / `score` | builders → `NoulQuestion` / `ChoiceQuestion<K>` / `ScoreQuestion` |
| `decide` / `decideChoice` | `(p, DecisionThresholds) => Decision` / `(ChoiceAnswer<K>, {minConfidence}) => K \| "unsure"` |
| `detectPersonalData` / `estimateTokens` | pure helpers |
| `JEV_ENDPOINT` / `JEV_MODEL` / `JEV_KEY_ENV` | constants |

### Integration Boundaries

| Owned by `@paver/jev` | Owned by the consumer |
|---|---|
| The request shape, the endpoint, the model id | Which questions to ask and how to word them |
| Retry, backoff, budget | The budget value for its own request path (config) |
| Refusing personal data and oversized requests | Trimming state to what the question needs |
| Validating the answer shape | Choosing thresholds from a labeled sample |
| Reporting usage and cost per call | Aggregating spend; the gateway key's monthly cap |
| — | The fallback path taken on every `ok: false` and every "unsure" |

## Architecture Decision Records

### ADR-001: A failed call resolves to a typed failure; it does not throw

**Context:** Under the 2026-09-25 load the gateway failed often enough that one call in fifty failed after six attempts. A thrown error is optional to handle in TypeScript; an uncaught one crashes a route handler.

**Decision:** `ask` resolves to `JevResult`, a union discriminated by `ok`. `answers` exists only on the `ok: true` branch, so reading it without a check is a compile error. A top-level `try` in `ask` converts any internal throw into an `exhausted` failure.

**Consequences:** Every consumer writes a fallback branch, by construction. The cost is ceremony at every call site; that ceremony is the point. The failure's `kind` is a closed set, so a consumer can switch on it exhaustively.

### ADR-002: The personal-data guard is a pattern net that refuses, not a classifier that judges

**Context:** Tony's rule forbids personal text wholesale while Jev lacks zero data retention. No regex finds names or street addresses; a model-based detector would itself need to see the text.

**Decision:** Scan the state and every question string for four patterns — email, phone, SSN, Luhn-valid card — and refuse on any hit. Patterns are tuned to err toward refusal (bare North American 10-digit numbers are phones), with two named exclusions measured by test: ISO dates and `1`-prefixed Unix timestamps. The opt-in `allowPersonalData: true` disables the guard and is forbidden by policy (`AC-KIT-015.11`).

**Consequences:** The guard catches careless inclusion of contact data, not a determined or subtle leak; the policy, not the regex, carries the rest. Some non-personal numbers are refused; the remedy is trimming the state, not the opt-in. The opt-in exists so lifting the policy later is a decision recorded in the FRD, not a package release.

### ADR-003: Token size is estimated as characters ÷ 3, and the estimate refuses

**Context:** Jev's tokenizer is not available to the package. The limits (32,000 state plus longest question; 64,000 per request) are relayed from TypeSafe documentation.

**Decision:** Estimate tokens as `ceil(chars / 3)`, measuring each question as its serialized JSON, and refuse before sending when either limit is exceeded.

**Consequences:** English runs near 4 characters per token, so the estimate over-counts and refuses some requests Jev would accept — the safe direction, since a rejected request costs an attempt and returns nothing. If a consumer hits this on real inputs, the ratio is re-measured against Jev and revised here, not made configurable.

### ADR-004: Full jitter with a Retry-After floor, bounded by attempts and by a budget checked before every wait

**Context:** 429s under load are correlated across callers; fixed or equal-jitter backoff re-synchronizes them. A request path needs a hard ceiling on latency, and the gateway can ask for waits longer than any request can afford.

**Decision:** Wait `random() × min(maxDelayMs, baseDelayMs × 2^(n−1))` before retry n, raised to `Retry-After` when present. Stop when attempts reach `maxAttempts`, when the budget has elapsed, or when the next wait would end past the budget. Each attempt's timeout is clipped to the budget remaining. Defaults: 5 attempts, 3,000 ms attempt timeout, 8,000 ms budget, 250 ms base, 4,000 ms cap.

**Consequences:** A call's wall time is bounded by the budget plus one in-flight response read. A long `Retry-After` ends the call immediately rather than being ignored or obeyed past the budget. 408 is retried because it is a timeout by definition; 500/502/504 are retried by HTTP semantics although only 429 and 503 were observed.

### ADR-005: Zero runtime dependencies, injected transport and clock, no Node-only APIs

**Context:** Consumers run in Node scripts, Next.js routes and possibly edge functions. `@paver/supabase` keeps its root export `next`-free for the same reason, so a plain Node script can import it (kit `CLAUDE.md`, Gotchas).

**Decision:** Use global `fetch`, `AbortController`, `setTimeout` and `Response` only; read the environment through `globalThis.process?.env`; compile with `types: []` so a Node-only API is a type error. `fetch`, `now`, `sleep` and `random` are injectable.

**Consequences:** The build is a single ~14 KB ESM file with no imports. Tests assert timing exactly with a fake clock. The package cannot use Node's `AbortSignal.timeout` conveniences or `process` typings, which costs a few lines.

### ADR-006: The package ships no default threshold

**Context:** The pilot showed 0.5 produces 5 false alarms on "is the customer upset" and 0.75 produces none. A default would be a guess that looks like a measurement.

**Decision:** `decide` requires both thresholds on every call; `decideChoice` requires `minConfidence`. No threshold constant is exported.

**Consequences:** Every consumer measures its own cut-offs on a labeled sample, which the jev skill already requires before shipping a question. The README example shows values but labels them as the consumer's.

### ADR-007: Builders and `decide` throw on programmer error; `ask` never throws

**Context:** A choice question with one option, or thresholds with `no ≥ yes`, is a bug in the caller's code, fixed once. A network failure is an event in production, handled every time.

**Decision:** Builders throw `RangeError` and `decide` throws `RangeError` on malformed input. `ask` re-runs the builders' `questionProblem` check and returns `invalid_request` for a hand-built malformed question.

**Consequences:** Programmer errors fail loudly at the line that caused them, in development. The never-throws guarantee is scoped to the call, which is where the fallback matters.

### ADR-008: The request body is rebuilt from known fields, and that rebuilt object is what is sized, scanned and sent

**Context:** Revision 1 scanned `instructions` and `criteria` but serialized the caller's question objects as given. Question keys and any extra field a caller attached therefore left the process unscanned; an email used as a question key would have been sent.

**Decision:** `#JevRequestPreflight` builds `WireQuestions` — `type`, `instructions`, `criteria` per question — and the size check, the scan (every string, keys included, recursively) and `JSON.stringify` all read that one object. Extra fields are dropped, not scanned-and-refused.

**Consequences:** A field the gateway does not define cannot leave, whatever it holds. A caller that relies on sending an undocumented field gets it silently dropped; none is documented today. Scanning and sending one object means the two cannot drift apart.

## Known Risks

**The gateway is the only route to Jev, and it is congested.** Retries raise the success rate; they do not create availability. `#JevDecisionClient` forces the fallback branch; it cannot make the fallback correct.

**The personal-data net has holes by design.** Names, addresses and free-text details pass it (ADR-002). The policy in `@REQ-KIT-015` and the jev skill is the control; the scanner is a backstop.

**The size limits are relayed, not measured.** If TypeSafe's real limits differ, `#JevRequestPreflight` either refuses requests Jev would take or lets through requests Jev rejects as `rejected` 4xx. Neither is silent.

**No consumer yet.** This Blueprint is composed by no consumer Blueprint. The first consumer's Blueprint should compose it and name its fallback path.
