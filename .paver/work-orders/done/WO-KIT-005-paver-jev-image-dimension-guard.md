---
owner: builder
blocks: []
blocked-by: []
open-blockers: []
---

# WO-KIT-005: `@paver/jev` v0.2.1 — pre-send image dimension guard

> **Repo:** `paver-os/kit` · **Allocated 2026-11-01** (WO-KIT-004 is closed in `done/`). Traces to @REQ-KIT-017 (AC-KIT-017.20–.24).

## Summary

Jev 1.14.0 answers 400 "Invalid image dimensions" when an image's short edge is under ~280 px or its
aspect exceeds ~5:1 (measured 2026-11-01: OverlayPro pilot 7 of 9 raw crops refused, e.g. 35×522;
RACK inspo poster with a 270 px short side refused; 280 px accepted). v0.2.0 sent such images and
burned a call. v0.2.1 reads width × height from the header bytes (JPEG SOF, PNG IHDR, WebP
VP8/VP8L/VP8X, GIF), refuses before any attempt as `invalid_request`, passes unparseable headers
through, and maps a gateway 400 "Invalid image dimensions" to `invalid_request` without retry.

## In Scope

- `packages/jev/src/guards.ts` (`imageSize`, `imageDimensionProblem`, `JEV_MIN_SHORT_EDGE`, `JEV_MAX_ASPECT`), `wire.ts`, `client.ts`, `index.ts`, `dimensions.test.ts` (new).
- `packages/jev/README.md`, `package.json` (0.2.1); kit `README.md` / `CLAUDE.md` rows; FRD Revision 4.

## Verification

| Signal | Result 2026-11-01 (Node 22.23.1) |
|---|---|
| Build / types | `pnpm -r build` exit 0, dist 0 import lines; `pnpm -r exec tsc --noEmit` exit 0 |
| Tests | jev **105 run of 105 written** (`grep -c '^test('`: 35 + 20 + 23 + 17 + 3 + 7); supabase 5/5; contracts 6/6 |
| Mutation | `if (false && (short < … \|\| long / short > …))` in `guards.ts` reds 3 tests (279/280 boundary, 5:1 boundary, base64); restored byte-identical (`cmp`), 105/105 |
| Live, built dist | 512×512 sunglasses JPEG: `ok`, noul 0.97, 1,008 in tokens, $0.000042336, 1 attempt; synthetic 35×522 JPEG header: `invalid_request`, `sent` false, fetch never invoked |

## Lifecycle

- 2026-11-01 — allocated, built, gates green, mutation proven, live call ok; released `jev-v0.2.1`; moved to `done/`.
