/**
 * v0.2.1 — pre-send image dimension guard (AC-KIT-017.20–.24). Headers are
 * built in-test: the minimal bytes each format's size field needs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createJevClient, imageSize, noul, JEV_MIN_SHORT_EDGE, JEV_MAX_ASPECT } from "./index.ts";
import type { JevImage, JevImageMediaType } from "./index.ts";
import { scriptedFetch, fakeClock, okBody, TEST_KEY, type Scripted } from "./fixtures.ts";

const be16 = (v: number) => [(v >> 8) & 0xff, v & 0xff];
const be32 = (v: number) => [(v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
const asc = (s: string) => [...s].map((c) => c.charCodeAt(0));

function jpeg(w: number, h: number, sof = 0xc0): Uint8Array {
  // SOI, an APP0 segment to skip, then SOFn: len, precision, height, width, components.
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...be16(16), ...asc("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
    0xff, sof, ...be16(17), 8, ...be16(h), ...be16(w), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
}
const png = (w: number, h: number) =>
  new Uint8Array([0x89, ...asc("PNG"), 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), ...asc("IHDR"), ...be32(w), ...be32(h), 8, 6, 0, 0, 0]);
const QS = { product: noul("Is a product visible?") };
const OK = okBody({ product: { type: "noul", noul: 0.9 } });
function client(script: Scripted[] = [{ status: 200, body: OK }]) {
  const f = scriptedFetch(script);
  const clock = fakeClock();
  const c = createJevClient({ apiKey: TEST_KEY, fetch: f.fetch, now: clock.now, sleep: clock.sleep, random: () => 0.5 });
  return { c, calls: f.calls };
}
const img = (data: Uint8Array | string, mediaType: JevImageMediaType = "image/jpeg"): JevImage => ({ data, mediaType });

// AC-KIT-017.20 — every format's header is read
test("dimensions: reads width and height from JPEG and PNG headers", () => {
  assert.deepEqual(imageSize(jpeg(640, 480)), { width: 640, height: 480 });
  assert.deepEqual(imageSize(jpeg(300, 900, 0xc2)), { width: 300, height: 900 });
  assert.deepEqual(imageSize(png(1024, 512)), { width: 1024, height: 512 });
});

// AC-KIT-017.24
test("dimensions: the limits are exported as 280 px and 5:1", () => {
  assert.equal(JEV_MIN_SHORT_EDGE, 280);
  assert.equal(JEV_MAX_ASPECT, 5);
});

// AC-KIT-017.21 — short edge boundary, every format
test("dimensions: a 279 px short edge is refused unsent, naming the image and its size; 280 px is sent", async () => {
  const makers = [[jpeg, "image/jpeg"], [png, "image/png"]] as const;
  for (const [make, type] of makers) {
    const bad = client();
    const r = await bad.c.ask("", QS, { images: [img(make(600, 280), type), img(make(600, 279), type)] });
    assert.equal(r.ok, false, type);
    if (!r.ok) {
      assert.equal(r.failure.kind, "invalid_request");
      assert.equal(r.failure.sent, false);
      assert.match(r.failure.message, /image 1 is 600×279/);
    }
    assert.equal(bad.calls.length, 0, `no network on refusal (${type})`);
    const good = client();
    const g = await good.c.ask("", QS, { images: [img(make(600, 280), type)] });
    assert.equal(g.ok, true, type);
    assert.equal(good.calls.length, 1);
  }
});

// AC-KIT-017.21 — aspect boundary
test("dimensions: an aspect of exactly 5:1 is sent; 5.01:1 is refused unsent", async () => {
  const ok = client();
  assert.equal((await ok.c.ask("", QS, { images: [img(png(1400, 280), "image/png")] })).ok, true);
  assert.equal((await ok.c.ask("", QS, { images: [img(jpeg(300, 1500))] })).ok, true);
  for (const data of [png(1403, 280), jpeg(300, 1503)]) {
    const bad = client();
    const r = await bad.c.ask("", QS, { images: [img(data, data[0] === 0x89 ? "image/png" : "image/jpeg")] });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.failure.kind, "invalid_request");
      assert.equal(r.failure.sent, false);
      assert.match(r.failure.message, /image 0 is \d+×\d+: Invalid image dimensions/);
    }
    assert.equal(bad.calls.length, 0);
  }
});

// AC-KIT-017.21 — base64 string data is read too
test("dimensions: base64 string data is decoded and guarded the same way", async () => {
  const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
  const bad = client();
  const r = await bad.c.ask("", QS, { images: [img(b64(jpeg(35, 522)))] });
  assert.equal(r.ok, false);
  assert.equal(bad.calls.length, 0);
  const good = client();
  assert.equal((await good.c.ask("", QS, { images: [img(b64(jpeg(512, 512)))] })).ok, true);
});

// AC-KIT-017.22 — unparseable headers pass through to the gateway
test("dimensions: an image whose header cannot be read is sent, not refused", async () => {
  for (const data of [new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), new Uint8Array([1, 2, 3, 4, 5]), asc("RIFF\0\0\0\0WEBPJUNK").concat(Array(20).fill(0))]) {
    assert.equal(imageSize(data instanceof Uint8Array ? data : new Uint8Array(data)), null);
    const t = client();
    const r = await t.c.ask("", QS, { images: [img(data instanceof Uint8Array ? data : new Uint8Array(data), "image/png")] });
    assert.equal(r.ok, true);
    assert.equal(t.calls.length, 1);
  }
});

// AC-KIT-017.23 — gateway 400 "Invalid image dimensions" is invalid_request, not retried
test("dimensions: a gateway 400 Invalid image dimensions is invalid_request after one attempt", async () => {
  const t = client([
    { status: 400, body: { error: { type: "invalid_request_error", message: "Invalid image dimensions" } } },
    { status: 200, body: OK },
  ]);
  const r = await t.c.ask("", QS, { images: [img(new Uint8Array([1, 2, 3, 4]))] });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.failure.kind, "invalid_request");
    assert.equal(r.failure.sent, true);
    assert.equal(r.failure.status, 400);
    assert.match(r.failure.message, /Invalid image dimensions/);
    assert.match(r.failure.message, /280 px/);
  }
  assert.equal(r.attempts, 1);
  assert.equal(t.calls.length, 1);
});
