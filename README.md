# @paver/jev

Guarded client for TypeSafe AI's **Jev** ("System One") through Vercel AI Gateway. Jev writes no text: you give it a `state` string and named, typed questions, and it returns a calibrated answer per question in about 0.4 s.

- **Requirement:** `@REQ-KIT-013` … `@REQ-KIT-016` (`.paver/requirements/frds/REQ-KIT-013-paver-jev-guarded-decision-client.md`)
- **Blueprint:** `@blueprint:paver-jev-guarded-decision-client`
- **Runtime:** Node 22+, or any runtime with global `fetch`. Zero runtime dependencies.

```json
"@paver/jev": "github:paver-os/kit#jev-v0.1.0"
```

## Rules the package enforces

| Rule | What happens |
|---|---|
| Never throws on a failed call | `ask` resolves to `{ ok: false, failure }` — your code must branch |
| Gateway 429 / 5xx / timeouts | Retried with full-jitter backoff, honouring `Retry-After`, max 5 attempts, 8 s budget |
| 401 / 403 / other 4xx | Returned at once as `auth` / `rejected` — not retried |
| Email, phone, SSN, card number anywhere in the request body — state, question keys, question text | Refused before sending (`personal_data`). A bare 7-digit `555-1234` is deliberately not flagged |
| Extra fields on a question object | Dropped — only `type`, `instructions`, `criteria` are sent |
| State too big (≈ chars ÷ 3 > 32k tokens with the longest question, or > 64k total) | Refused before sending (`state_too_large`) |
| Key | Read from `AI_GATEWAY_API_KEY` at call time; never logged, never in a result |

**No customer or personal text goes to Jev** until TypeSafe offers zero data retention. `allowPersonalData: true` exists so the guard can be lifted later by operator decision; setting it today is forbidden by policy (AC-KIT-015.11).

## Usage — always with a fallback

```ts
import { createJevClient, noul, choice, decide, decideChoice } from "@paver/jev";

const jev = createJevClient(); // reads AI_GATEWAY_API_KEY

const r = await jev.ask(buildLog, {
  failed: noul("Did the CI run fail?", { true: "A step failed", false: "Every step passed" }),
  area: choice("Which stage failed?", { build: "Install or compile", test: "Tests", deploy: "Deploy" }),
});

if (!r.ok) {
  // Jev unavailable, refused, or malformed — take the path that works without it.
  return routeToHuman(buildLog, r.failure.kind);
}

// Thresholds are yours: measure them on 30–50 labeled examples. There is no default.
const failed = decide(r.answers.failed.noul, { yesAtOrAbove: 0.8, noAtOrBelow: 0.2 });
const area = decideChoice(r.answers.area, { minConfidence: 0.6 }); // "build" | "test" | "deploy" | "unsure"

if (failed === "unsure" || area === "unsure") return routeToHuman(buildLog, "unsure");
```

`r.answers.area.choice` is typed as `"build" | "test" | "deploy"`; reading `r.answers` before checking `r.ok` is a type error.

## API

| Export | Signature |
|---|---|
| `createJevClient` | `(config?: JevClientConfig) => JevClient` |
| `JevClient.ask` | `(state: string, questions: Qs, options?: { allowPersonalData?: true }) => Promise<JevResult<Qs>>` |
| `noul` | `(instructions: string, criteria?: { true: string; false: string }) => NoulQuestion` |
| `choice` | `(instructions: string, options: Record<K, string>) => ChoiceQuestion<K>` (2–255 options) |
| `score` | `(instructions: string, levels: readonly string[]) => ScoreQuestion` (2–10 levels) |
| `decide` | `(p: number, t: { yesAtOrAbove: number; noAtOrBelow: number }) => "yes" \| "no" \| "unsure"` |
| `decideChoice` | `(answer: ChoiceAnswer<K>, f: { minConfidence: number }) => K \| "unsure"` |
| `detectPersonalData` | `(text: string) => ("email" \| "phone" \| "ssn" \| "card")[]` |
| `estimateTokens` | `(text: string) => number` |

`JevClientConfig`: `apiKey`, `fetch`, `maxAttempts` (5), `attemptTimeoutMs` (3000), `totalBudgetMs` (8000), `baseDelayMs` (250), `maxDelayMs` (4000), plus injectable `now` / `sleep` / `random` for tests.

`JevResult`: `{ ok: true, answers, usage: { inputTokens, outputTokens, cost?, marketCost? }, attempts, elapsedMs }` or `{ ok: false, failure: { kind, message, sent, status?, lastOutcome?, detected?, estimatedTokens?, limit? }, attempts, elapsedMs }`. A cost the gateway did not report is `undefined`, never `0`.

Failure kinds: `personal_data` · `state_too_large` · `invalid_request` · `missing_key` (all unsent) · `auth` · `rejected` · `exhausted` · `bad_response`.

## Live smoke

One real call over a synthetic build-log state; does nothing without `JEV_LIVE=1`.

```bash
JEV_LIVE=1 AI_GATEWAY_API_KEY=… node --experimental-strip-types packages/jev/scripts/smoke.ts
```
