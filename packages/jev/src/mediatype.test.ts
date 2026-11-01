/**
 * v0.2.2 — JPEG / PNG only (AC-KIT-017.25–.27). Jev 1.14.0 answers 400
 * "media type ... not supported" for image/webp and image/gif (measured 2026-11-01).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createJevClient, noul } from "./index.ts";
import type { JevImage } from "./index.ts";
import { scriptedFetch, fakeClock, okBody, TEST_KEY, type Scripted } from "./fixtures.ts";

const QS = { product: noul("Is a product visible?") };
const OK = okBody({ product: { type: "noul", noul: 0.9 } });
function client(script: Scripted[] = [{ status: 200, body: OK }, { status: 200, body: OK }]) {
  const f = scriptedFetch(script);
  const clock = fakeClock();
  const c = createJevClient({ apiKey: TEST_KEY, fetch: f.fetch, now: clock.now, sleep: clock.sleep, random: () => 0.5 });
  return { c, calls: f.calls };
}
const BYTES = new Uint8Array([1, 2, 3, 4]);

// AC-KIT-017.25
for (const mediaType of ["image/webp", "image/gif"]) {
  test(`media type: ${mediaType} is refused as invalid_request with zero network calls`, async () => {
    const t = client();
    const r = await t.c.ask("", QS, { images: [{ data: BYTES, mediaType } as unknown as JevImage] });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.failure.kind, "invalid_request");
      assert.equal(r.failure.sent, false);
      assert.match(r.failure.message, new RegExp(`${mediaType}.*convert the image to JPEG or PNG`));
    }
    assert.equal(t.calls.length, 0);
  });
}

// AC-KIT-017.26
test("media type: image/jpeg and image/png are sent", async () => {
  for (const mediaType of ["image/jpeg", "image/png"] as const) {
    const t = client();
    const r = await t.c.ask("", QS, { images: [{ data: BYTES, mediaType }] });
    assert.equal(r.ok, true, mediaType);
    assert.equal(t.calls.length, 1);
  }
});

// AC-KIT-017.27
test("media type: a gateway 400 'media type ... not supported' is invalid_request after one attempt", async () => {
  const msg = "'TypeSafe AI decision image media type: image/webp' functionality not supported.";
  const t = client([
    { status: 400, body: { error: { type: "AI_UnsupportedFunctionalityError", message: msg } } },
    { status: 200, body: OK },
  ]);
  const r = await t.c.ask("", QS, { images: [{ data: BYTES, mediaType: "image/jpeg" }] });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.failure.kind, "invalid_request");
    assert.equal(r.failure.sent, true);
    assert.equal(r.failure.status, 400);
    assert.match(r.failure.message, /JPEG and PNG/);
  }
  assert.equal(t.calls.length, 1);
});
