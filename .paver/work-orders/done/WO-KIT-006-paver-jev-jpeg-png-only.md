---
owner: builder
blocks: []
blocked-by: []
open-blockers: []
---

# WO-KIT-006: `@paver/jev` v0.2.2 — JPEG / PNG only

> **Repo:** `paver-os/kit` · **Allocated 2026-11-01** (WO-KIT-005 is closed in `done/`). Traces to @REQ-KIT-017 (AC-KIT-017.25–.27; .20 narrowed).

## Summary

Measured 2026-11-01 against `POST https://ai-gateway.vercel.sh/v1/decisions`, `typesafe-ai/jev-1.14.0`:
image/jpeg ok, image/png ok (p=0.98), image/webp and image/gif → 400 `AI_UnsupportedFunctionalityError`
"'TypeSafe AI decision image media type: …' functionality not supported." v0.2.1 allowed WebP / GIF, so
callers burned calls on guaranteed 400s (Closer's audit: 200 WebP failures). v0.2.2 narrows
`JevImageMediaType` to `"image/jpeg" | "image/png"` (type + runtime), refuses others unsent as
`invalid_request` telling the caller to convert, maps a gateway 400 "media type … not supported" to
`invalid_request` without retry, and removes the now-dead WebP / GIF header parsing from `imageSize`.
Type-narrowing change, intended: TS callers passing `"image/webp"` fail typecheck.

## In Scope

- `packages/jev/src/types.ts`, `wire.ts`, `guards.ts`, `client.ts`, `mediatype.test.ts` (new), `dimensions.test.ts`, `decisions.test.ts`.
- `packages/jev/README.md`, `package.json` (0.2.2); kit `README.md` / `CLAUDE.md` rows; FRD Revision 5.

## Verification

| Signal | Result 2026-11-01 (Node 22.23.1) |
|---|---|
| Build / types | `pnpm -r build` exit 0; `pnpm -r exec tsc --noEmit` exit 0 |
| Tests | jev **109 run of 109 written** (108 `test(` declarations; the media-type refusal is one declaration looped over webp + gif) |
| Mutation | adding `"image/webp"` to `IMAGE_MEDIA_TYPES` in `wire.ts` reds 1 test (webp refused, zero calls); restored byte-identical (`cmp`), 109/109 |

## Lifecycle

- 2026-11-01 — allocated, built, gates green, mutation proven; released `jev-v0.2.2`; moved to `done/`.
