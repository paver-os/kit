# @paver/jev

Guarded client for TypeSafe AI's **Jev** through Vercel AI Gateway. Jev writes no text: you give it a `state` string — and, since v0.2.0, images — plus named, typed questions, and it returns a calibrated answer per question in about 0.3–0.5 s.

- **Requirement:** `@REQ-KIT-013` … `@REQ-KIT-017` (`.paver/requirements/frds/REQ-KIT-013-paver-jev-guarded-decision-client.md`)
- **Blueprint:** `@blueprint:paver-jev-guarded-decision-client`
- **Model:** `typesafe-ai/jev-1.14.0` (pinned; override with `createJevClient({ model })`) on `POST https://ai-gateway.vercel.sh/v1/decisions`.
- **Runtime:** Node 20+ (built v0.2.0 verified on 20.19.2 and 22.23.1, live text + image calls, 2026-10-31), or any runtime with global `fetch`. Tests and the smoke script need Node 22 (`--experimental-strip-types`). Zero runtime dependencies.

```json
"@paver/jev": "github:paver-os/kit#jev-v0.2.1"
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
| Zero data retention | **Required on every call** (`providerOptions.gateway.zeroDataRetention: true`), not configurable off. No ZDR provider on the route → `no_zdr_provider` |
| Images | ≤ 128 per call, each ≤ 5 MB decoded, JPEG / PNG / WebP / GIF, detail `low` (default) / `high` / `auto`; otherwise `invalid_request`, unsent. Each counts ~1,100 estimated tokens at `low`, 4,400 at `high`/`auto` (unmeasured) toward the size limit |
| Refused question | Comes back as `{ type: "refusal", refused: true }` under its key; the other answers are normal; `decide` / `decideChoice` return `"unsure"` |

**No customer or personal text goes to Jev.** The personal-data scan still runs over the state and question text on every call. Images cannot be scanned; they are allowed because every call enforces zero data retention. `typesafe-ai/jev-1.14.0` lists `zdr: all` (measured 2026-10-31), but lifting the personal-data guard is an operator decision not yet taken: `allowPersonalData: true` stays forbidden by policy (AC-KIT-015.11).

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

`r.answers.area.choice` is typed as `"build" | "test" | "deploy"` once a refusal is ruled out (`isRefused`); reading `r.answers` before checking `r.ok`, or a value before ruling out the refusal, is a type error.

## Images

```ts
import { readFile } from "node:fs/promises";

const r = await jev.ask("Catalog photo.", {
  product: choice("What product is shown?", { sunglasses: "Sunglasses or eyewear", hat: "A hat or cap", other: "Something else" }),
  person: noul("Is a person visible?"),
}, { images: [{ data: new Uint8Array(await readFile("shot.jpg")), mediaType: "image/jpeg" }] }); // detail "low"

if (r.ok && !isRefused(r.answers.product)) console.log(r.answers.product.choice, r.usage.cost);
```

`data` is bytes or base64 **without** a `data:` prefix; external URLs are not supported. The state may be `""` when images are attached. Resize to ~512 px before sending — detail `low` is the measured case.

**Dimensions (v0.2.1).** Jev 1.14.0 answers 400 "Invalid image dimensions" when the short edge is under ~280 px or the aspect ratio exceeds ~5:1 (measured 2026-11-01). The client reads width × height from the JPEG / PNG / WebP / GIF header and refuses such an image before any call, as `invalid_request` naming the image index and size (`JEV_MIN_SHORT_EDGE = 280`, `JEV_MAX_ASPECT = 5`; `imageSize(bytes)` is exported). An image whose header cannot be parsed is sent and the gateway decides; if it then answers "Invalid image dimensions", that is also `invalid_request`, not retried. Pad or crop thin images to ≥ 280 px and ≤ 5:1 first.

**Cost per image** (measured 2026-10-31, $0.000000042 per input token): a 512 px JPEG at `low` with three short questions read 1,117–1,120 input tokens, **$0.000047 per call**; a text-only call of two questions read 374 tokens, $0.000016.

## API

| Export | Signature |
|---|---|
| `createJevClient` | `(config?: JevClientConfig) => JevClient` |
| `JevClient.ask` | `(state: string, questions: Qs, options?: { images?: JevImage[]; allowPersonalData?: true }) => Promise<JevResult<Qs>>` |
| `noul` | `(instructions: string, criteria?: { true: string; false: string }) => NoulQuestion` |
| `choice` | `(instructions: string, options: Record<K, string>) => ChoiceQuestion<K>` (2–255 options) |
| `score` | `(instructions: string, levels: readonly string[]) => ScoreQuestion` (2–10 levels) |
| `decide` | `(p: number \| NoulAnswer \| RefusedAnswer, t: { yesAtOrAbove: number; noAtOrBelow: number }) => "yes" \| "no" \| "unsure"` |
| `decideChoice` | `(answer: ChoiceAnswer<K> \| RefusedAnswer, f: { minConfidence: number }) => K \| "unsure"` |
| `isRefused` | `(answer) => answer is RefusedAnswer` |
| `JEV_MODEL` · `JEV_ENDPOINT` | `"typesafe-ai/jev-1.14.0"` · `"https://ai-gateway.vercel.sh/v1/decisions"` |
| `MAX_IMAGES` · `MAX_IMAGE_BYTES` · `IMAGE_TOKEN_ESTIMATE` · `estimateImageTokens` | image limits and the size estimate |
| `JEV_MIN_SHORT_EDGE` · `JEV_MAX_ASPECT` · `imageSize` · `imageDimensionProblem` | image dimension guard (v0.2.1) |
| `detectPersonalData` | `(text: string) => ("email" \| "phone" \| "ssn" \| "card")[]` |
| `estimateTokens` | `(text: string) => number` |

`JevClientConfig`: `model` (`typesafe-ai/jev-1.14.0`), `apiKey`, `fetch`, `maxAttempts` (5), `attemptTimeoutMs` (3000), `totalBudgetMs` (8000), `baseDelayMs` (250), `maxDelayMs` (4000), plus injectable `now` / `sleep` / `random` for tests.

`JevResult`: `{ ok: true, answers, usage: { inputTokens, outputTokens, cost?, marketCost?, provider? }, attempts, elapsedMs }` or `{ ok: false, failure: { kind, message, sent, status?, lastOutcome?, detected?, estimatedTokens?, limit? }, attempts, elapsedMs }`. A cost the gateway did not report is `undefined`, never `0`.

Failure kinds: `personal_data` · `state_too_large` · `invalid_request` · `missing_key` (all unsent) · `auth` · `rejected` · `no_zdr_provider` · `exhausted` · `bad_response`.

## Upgrading from v0.1

| Change | What a caller does |
|---|---|
| Wire moved to `/v1/decisions`, model `typesafe-ai/jev-1.14.0`, ZDR required | Nothing — the builders and answer shapes are unchanged |
| Every answer type is now `X \| RefusedAnswer` | Pass answers straight to `decide` / `decideChoice` (unchanged), or narrow with `isRefused(a)` before reading `a.choice` / `a.noul` / `a.score` |
| New failure kind `no_zdr_provider` | Treat like `rejected` (deterministic; do not retry) |

## Live smoke

One real call over a synthetic build-log state; does nothing without `JEV_LIVE=1`.

```bash
JEV_LIVE=1 AI_GATEWAY_API_KEY=… node --experimental-strip-types packages/jev/scripts/smoke.ts
```
