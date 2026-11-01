---
owner: builder
blocks: []
blocked-by: []
open-blockers: []
---

# WO-KIT-004: `@paver/jev` v0.2.0 — images, zero data retention, versioned model

> **Repo:** `paver-os/kit` · **Allocated 2026-10-31**, placed in `in-progress/` the same day on operator
> direction (Tony, via the main thread: "We want every Paver product to identify images with it cheaply").

## Summary

TypeSafe released Jev 1.14.0 (`typesafe-ai/jev-1.14.0`, 2026-10-14): it accepts images, the gateway lists
it `zdr: all`, and it costs the same per input token as plain `typesafe-ai/jev` (which lists `zdr: some`
and is text-only). This Work Order moves `@paver/jev` to the gateway's OpenAI-compatible `/v1/decisions`
wire on the versioned model, requires zero data retention on every call, adds image input with
pre-send guards, surfaces refused questions as a typed answer, and reports the answering provider —
while keeping the v0.1 builders and answer shapes, so existing callers (`createJevClient`, `choice`,
`decideChoice`, `JevClient`) compile unchanged. Released as `jev-v0.2.0`.

## In Scope

- `packages/jev/src/wire.ts` (new, `#DecisionsWire`): question and answer translation, image preparation, the body builder.
- `client.ts`, `guards.ts`, `types.ts`, `decide.ts`, `index.ts`, `result-type.typecheck.ts`, `fixtures.ts`, the existing suites, and `decisions.test.ts` (new).
- `packages/jev/README.md`, `package.json` (0.2.0); the kit `README.md` / `CLAUDE.md` package rows.
- FRD Revision 3 (`REQ-KIT-017` added; AC-KIT-013.11, .12, AC-KIT-015.20, AC-KIT-016.10 re-cut; a dated note under AC-KIT-015.11).

## Out of Scope

- Lifting AC-KIT-015.11 or changing the personal-data guard's default — an operator decision.
- Bumping any consumer's pin (Surf stays on `jev-v0.1.1` until its own change).
- Detail `original`, image URLs, image resizing.
- Revising `@blueprint:paver-jev-guarded-decision-client` — drift logged below for Boris.

## Requirements

Cited verbatim from `@artifact:projects/kit/.paver/requirements/frds/REQ-KIT-013-paver-jev-guarded-decision-client.md` (**Revision 3**).

**REQ-KIT-017: Calls use the versioned Jev with zero data retention, and may carry images**

- **AC-KIT-017.1:** The package shall send every attempt as a `POST` to `https://ai-gateway.vercel.sh/v1/decisions`.
- **AC-KIT-017.2:** The package shall send the model id `typesafe-ai/jev-1.14.0` unless the caller sets a `model` when creating the client, in which case it shall send that id.
- **AC-KIT-017.3:** Every attempt's body shall carry `providerOptions.gateway.zeroDataRetention` set to `true`.
- **AC-KIT-017.4:** No client configuration value and no call option shall remove or change the field named in AC-KIT-017.3.
- **AC-KIT-017.5:** When an attempt returns status 400 with error type `no_providers_available`, the call shall resolve to a `no_zdr_provider` failure carrying the status, with `sent` true, after that one attempt.
- **AC-KIT-017.6:** The ask function shall accept an optional list of images. A call with no image shall send the state as a plain-string `input`; a call with one or more images shall send one user message whose parts are the state as `input_text` (omitted when the state is empty) followed by each image as `input_image`, in the caller's order.
- **AC-KIT-017.7:** The package shall send each image as `data:<media type>;base64,<data>` with the caller's detail, or `low` when the caller gives none.
- **AC-KIT-017.8:** When a call carries more than 128 images, the call shall resolve to an `invalid_request` failure with `sent` false.
- **AC-KIT-017.9:** When an image's media type is not `image/jpeg`, `image/png`, `image/webp` or `image/gif`, or its detail is not `low`, `high` or `auto`, the call shall resolve to an `invalid_request` failure with `sent` false.
- **AC-KIT-017.10:** When an image is empty, exceeds 5 MB (5,242,880 bytes) decoded, or its string data is not bare base64 (a `data:` prefix, a URL or a non-base64 character), the call shall resolve to an `invalid_request` failure with `sent` false.
- **AC-KIT-017.11:** The size check of AC-KIT-015.15 and AC-KIT-015.16 shall count each image as part of the state: 1,100 estimated tokens at detail `low`, and 4,400 at `high` or `auto`.
- **AC-KIT-017.12:** When a call carries images, the personal-data scan of AC-KIT-015.1 shall still run over the state and every question string.
- **AC-KIT-017.13:** The package shall not run the personal-data scan over image data.
- **AC-KIT-017.14:** When the response answers a question with type `refusal`, the success result shall carry `{ type: "refusal", refused: true }` under that question's key and the other questions' answers unchanged.
- **AC-KIT-017.15:** The package shall match each answer to its question by the answer's `name`; when no answer carries a question's name, the call shall resolve to a `bad_response` failure.
- **AC-KIT-017.16:** `decide` and `decideChoice` shall return `"unsure"` for a refused answer, and `decide` shall accept a noul answer as well as a bare probability.
- **AC-KIT-017.17:** When the response carries `provider_metadata.gateway.routing.finalProvider`, a success result's usage shall report it as `provider`; otherwise `provider` shall be undefined.
- **AC-KIT-017.18:** The package shall send a noul question as `predicate` with its true and false criteria appended to its instructions, a choice question as `choice` with `choices: [{ value, description }]`, and a score question as `score` with `levels: [{ label }]`, as an array named by the caller's keys; and it shall return answers in the shapes of REQ-KIT-016 (a choice's probabilities keyed by option, a score's keyed by level index).
- **AC-KIT-017.19:** Each answer's type shall be a union with the refused answer, so that a TypeScript caller cannot read an answer's value without first ruling the refusal out.

Re-cut in Revision 3 and re-verified here: AC-KIT-013.11, AC-KIT-013.12, AC-KIT-015.20, AC-KIT-016.10.

## Blueprints

`@blueprint:paver-jev-guarded-decision-client` (Revision 2) — ADR-001, -002, -003, -005, -007, -008 hold
unchanged; ADR-008's "rebuilt from known fields" now applies to the `/v1/decisions` shape.
`@blueprint:paver-os-kit-platform` — build, test and built-artifact tag conventions.

**Drift for Boris (not edited by the Builder):** the Blueprint still names the `systemone` endpoint and
`#SystemOneResponseReader`; v0.2.0 adds `#DecisionsWire` (`wire.ts`) and an image-preparation step
inside `#JevRequestPreflight`. Needs a Revision 3.

## E2E Acceptance Tests

Test names in `packages/jev/src/*.test.ts`; each carries its AC ids in a comment above it.

- **COV_KIT_052** — covers AC-KIT-017.1, AC-KIT-017.2, AC-KIT-017.3, AC-KIT-017.17, AC-KIT-013.11, AC-KIT-013.12 — endpoint, default and overridden model, ZDR, provider. Tests: `client.test.ts` "success: …"; `decisions.test.ts` "model: …", "usage: provider is undefined …"
- **COV_KIT_053** — covers AC-KIT-017.3, AC-KIT-017.4, AC-KIT-017.5 — ZDR on every attempt and shape, not switchable off, `no_zdr_provider`, other 400 stays `rejected`. Tests: `decisions.test.ts` "zdr: …" (×4)
- **COV_KIT_054** — covers AC-KIT-017.6, AC-KIT-017.7, AC-KIT-016.10 — image body shape, detail default, image-only call, text-only string input. Tests: `decisions.test.ts` "images: bytes …", "images: base64 strings …", "images: with images an empty state …", "images: without images …"
- **COV_KIT_055** — covers AC-KIT-017.8, AC-KIT-017.9, AC-KIT-017.10, AC-KIT-017.11 — image guards and their boundaries, image token estimate. Tests: `decisions.test.ts` "images: count, media type …", "images: exactly 128 …", "images: 29 low images fit …"
- **COV_KIT_056** — covers AC-KIT-017.12, AC-KIT-017.13 — text still scanned with images; image data not scanned. Tests: `decisions.test.ts` "images: personal data …", "images: base64 image data …"
- **COV_KIT_057** — covers AC-KIT-017.15, AC-KIT-017.18, AC-KIT-015.20 — translation both ways, match by name. Tests: `decisions.test.ts` "wire: …" (×3); `hardening.test.ts` "wire: an extra field …"
- **COV_KIT_058** — covers AC-KIT-017.14, AC-KIT-017.16 — refusal mapping and decision helpers. Tests: `decisions.test.ts` "refusal: …" (×2)
- **COV_KIT_059** — covers AC-KIT-017.19, AC-KIT-017.5 — compile-time: refusal must be ruled out; `no_zdr_provider` in the failure set. Tests: `src/result-type.typecheck.ts` via `pnpm -r exec tsc --noEmit`.

**Mutation, 2026-10-31:** replacing the body's `providerOptions: { gateway: { zeroDataRetention: true } }`
with an empty `gateway` object reds 4 tests ("success: …", "zdr: zeroDataRetention true is on every
attempt …", "zdr: a caller-supplied option cannot turn …", "wire: an extra field …"); `wire.ts` restored
byte-identical (`cmp`), suite back to 98/98.

## Verification

| Signal | Command (kit root, Node 22.23.1, pnpm 9) | Result 2026-10-31 |
|---|---|---|
| Build | `pnpm -r build` | exit 0; `packages/jev/dist/index.js` has 0 import lines |
| Types | `pnpm -r exec tsc --noEmit` | exit 0, incl. `result-type.typecheck.ts` |
| Tests | `pnpm -r test` | jev **98 run of 98 written** (`grep -c '^test('`: 35 + 20 + 23 + 17 + 3); supabase 5/5; contracts 6/6 |
| Live, Node 22.23.1 | built `dist/` from a scratch script, key from `paver/.env.local` | text: `failed` 0.96, `area` = test (conf 1), 374 in / 54 out tokens, $0.000015708; sunglasses photo: `product` = sunglasses (1.0), `person` 0.04, `sharp` 1.78, 1,120 in tokens, $0.00004704; hat photo (empty state): `product` = hat (1.0), `person` 0.03, `sharp` 1.92, 1,117 in tokens, $0.000046914; every call 1 attempt, provider `typesafe-ai` |
| Live, Node 20.19.2 | same script | same three verdicts (`failed` 0.97, sunglasses, hat), all `ok` |

## Notes

- Not measured: token cost of `high` / `auto` images (estimate set 4× `low`); a live refusal answer (shape from gateway docs).
- Type change for callers that read answer fields directly: every answer is now `X | RefusedAnswer`. Surf's
  `lib/filing/jev-disambiguate.ts` reads `a.choice` / `a.confidence` after `decideChoice`; it will need an
  `isRefused(a)` narrowing when it bumps its pin. It stays on `jev-v0.1.1` today, so nothing breaks now.

## Lifecycle

- 2026-10-31 — allocated in `in-progress/`; built test-first; gates green; mutation proven; live calls on Node 22 and 20; released `jev-v0.2.0`; moved to `done/`.
