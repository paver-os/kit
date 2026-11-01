/**
 * v0.2.0 — the `/v1/decisions` wire, images, zero data retention, refusals
 * (@REQ-KIT-017). Each test carries its AC ids in a comment above it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createJevClient, choice, decide, decideChoice, isRefused, noul, score, MAX_IMAGE_BYTES } from "./index.ts";
import type { JevClientConfig, JevImage } from "./index.ts";
import { scriptedFetch, fakeClock, okBody, TEST_KEY, type Scripted } from "./fixtures.ts";

const STATE = "Product photo from the Madson catalog shoot.";
const QS = { sunglasses: noul("Is a pair of sunglasses visible?") };
const OK = okBody({ sunglasses: { type: "noul", noul: 0.9 } });
// 4 bytes: FF D8 FF E0 (a JPEG's first bytes) → base64 "/9j/4A=="
const JPEG: JevImage = { data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), mediaType: "image/jpeg" };

function client(script: Scripted[], cfg: Partial<JevClientConfig> = {}) {
  const f = scriptedFetch(script);
  const clock = fakeClock();
  const c = createJevClient({ apiKey: TEST_KEY, fetch: f.fetch, now: clock.now, sleep: clock.sleep, random: () => 0.5, ...cfg });
  return { c, calls: f.calls };
}

type Body = { model: string; input: unknown; questions: unknown[]; providerOptions: unknown };
const body = (calls: { body: unknown }[], i = 0) => calls[i]!.body as Body;

// ── Images: body shape ──────────────────────────────────────────────────────

// AC-KIT-017.6, .7 — bytes become a base64 data URL after the text part, detail low by default
test("images: bytes are sent as a base64 data URL after the state text, detail low by default", async () => {
  const { c, calls } = client([{ status: 200, body: OK }]);
  const r = await c.ask(STATE, QS, { images: [JPEG] });
  assert.equal(r.ok, true);
  assert.deepEqual(body(calls).input, [
    {
      role: "user",
      content: [
        { type: "input_text", text: STATE },
        { type: "input_image", image_url: "data:image/jpeg;base64,/9j/4A==", detail: "low" },
      ],
    },
  ]);
});

// AC-KIT-017.6, .7 — base64 strings pass through, order and detail are kept
test("images: base64 strings pass through in order with their own detail and media type", async () => {
  const { c, calls } = client([{ status: 200, body: OK }]);
  await c.ask(STATE, QS, {
    images: [
      { data: "iVBORw0KGgo=", mediaType: "image/png", detail: "high" },
      { data: "UklGRg==", mediaType: "image/webp", detail: "auto" },
    ],
  });
  const content = (body(calls).input as { content: { image_url?: string; detail?: string }[] }[])[0]!.content;
  assert.deepEqual(
    content.slice(1).map((p) => [p.image_url, p.detail]),
    [
      ["data:image/png;base64,iVBORw0KGgo=", "high"],
      ["data:image/webp;base64,UklGRg==", "auto"],
    ],
  );
});

// AC-KIT-017.6 — an image-only call: empty state allowed, no text part sent
test("images: with images an empty state is allowed and no text part is sent", async () => {
  const { c, calls } = client([{ status: 200, body: OK }]);
  const r = await c.ask("", QS, { images: [JPEG] });
  assert.equal(r.ok, true);
  const content = (body(calls).input as { content: { type: string }[] }[])[0]!.content;
  assert.deepEqual(content.map((p) => p.type), ["input_image"]);
});

// AC-KIT-017.6 — text-only calls keep the plain-string input
test("images: without images the input is the plain state string", async () => {
  const { c, calls } = client([{ status: 200, body: OK }]);
  await c.ask(STATE, QS, { images: [] });
  assert.equal(body(calls).input, STATE);
});

// ── Images: guards ──────────────────────────────────────────────────────────

// AC-KIT-017.8, .9, .10 — every malformed image list is refused unsent
test("images: count, media type, detail, emptiness, size and encoding are refused as invalid_request, unsent", async () => {
  const { c, calls } = client([{ status: 200, body: OK }]);
  const bad: unknown[] = [
    Array.from({ length: 129 }, () => JPEG),
    [{ ...JPEG, mediaType: "image/tiff" }],
    [{ ...JPEG, detail: "original" }],
    [{ data: new Uint8Array(0), mediaType: "image/jpeg" }],
    [{ data: "", mediaType: "image/jpeg" }],
    [{ data: new Uint8Array(MAX_IMAGE_BYTES + 1), mediaType: "image/jpeg" }],
    [{ data: "A".repeat(4 * Math.ceil((MAX_IMAGE_BYTES + 1) / 3)), mediaType: "image/jpeg" }],
    [{ data: "data:image/jpeg;base64,/9j/4A==", mediaType: "image/jpeg" }],
    [{ data: "not base64!", mediaType: "image/jpeg" }],
    [{ data: "https://example.com/a.jpg", mediaType: "image/jpeg" }],
    [{ data: 42, mediaType: "image/jpeg" }],
    [null],
    "not an array",
  ];
  for (const images of bad) {
    const r = await c.ask(STATE, QS, { images: images as JevImage[] });
    assert.equal(!r.ok && r.failure.kind, "invalid_request", JSON.stringify(images).slice(0, 80));
    assert.equal(!r.ok && r.failure.sent, false);
  }
  assert.equal(calls.length, 0);
});

// AC-KIT-017.8, .10 — the boundaries themselves are accepted
test("images: exactly 128 images and an image of exactly 5 MB are accepted", async () => {
  const many = client([{ status: 200, body: OK }], {});
  // 128 low images estimate 140,800 tokens — over the size limit — so this
  // boundary is asserted at the guard, not by sending: the refusal must be
  // state_too_large, never invalid_request.
  const r128 = await many.c.ask(STATE, QS, { images: Array.from({ length: 128 }, () => JPEG) });
  assert.equal(!r128.ok && r128.failure.kind, "state_too_large");
  const big = client([{ status: 200, body: OK }]);
  const r5 = await big.c.ask(STATE, QS, { images: [{ data: new Uint8Array(MAX_IMAGE_BYTES), mediaType: "image/jpeg" }] });
  assert.equal(r5.ok, true);
  assert.equal(big.calls.length, 1);
});

// AC-KIT-017.11 — images count toward the size estimate
test("images: 29 low images fit and 30 exceed the 32,000-token estimate", async () => {
  const { c, calls } = client([{ status: 200, body: OK }]);
  const ok = await c.ask("x", QS, { images: Array.from({ length: 29 }, () => JPEG) });
  assert.equal(ok.ok, true);
  const over = await c.ask("x", QS, { images: Array.from({ length: 30 }, () => JPEG) });
  assert.equal(!over.ok && over.failure.kind, "state_too_large");
  assert.equal(!over.ok && over.failure.estimatedTokens! > 32_000, true);
  assert.equal(calls.length, 1);
});

// AC-KIT-017.12 — the text is still scanned when images ride along
test("images: personal data in the state is still refused when images are attached", async () => {
  const { c, calls } = client([{ status: 200, body: OK }]);
  const r = await c.ask("Photo sent by jane.doe@example.com", QS, { images: [JPEG] });
  assert.equal(!r.ok && r.failure.kind, "personal_data");
  assert.equal(calls.length, 0);
});

// AC-KIT-017.13 — image bytes are not scanned (base64 can look like a phone number)
test("images: base64 image data is not run through the personal-data scan", async () => {
  const { c, calls } = client([{ status: 200, body: OK }]);
  const r = await c.ask(STATE, QS, { images: [{ data: "AAA/+18015550142", mediaType: "image/jpeg" }] });
  assert.equal(r.ok, true);
  assert.equal(calls.length, 1);
});

// ── Zero data retention ─────────────────────────────────────────────────────

// AC-KIT-017.3 — every attempt, every shape, every model, requires ZDR
test("zdr: zeroDataRetention true is on every attempt, with or without images, under a model override", async () => {
  const { c, calls } = client([{ status: 503 }, { status: 429 }, { status: 200, body: OK }], { model: "typesafe-ai/jev" });
  await c.ask(STATE, QS);
  await c.ask(STATE, QS, { images: [JPEG] });
  assert.ok(calls.length >= 4, `only ${calls.length} attempts`);
  for (let i = 0; i < calls.length; i += 1) {
    assert.deepEqual(body(calls, i).providerOptions, { gateway: { zeroDataRetention: true } }, `attempt ${i + 1}`);
    assert.equal(body(calls, i).model, "typesafe-ai/jev");
  }
});

// AC-KIT-017.4 — the config has no switch that turns it off
test("zdr: a caller-supplied option cannot turn zero data retention off", async () => {
  const { c, calls } = client([{ status: 200, body: OK }], {
    zeroDataRetention: false,
    providerOptions: { gateway: { zeroDataRetention: false } },
  } as unknown as Partial<JevClientConfig>);
  await c.ask(STATE, QS, { zeroDataRetention: false } as never);
  assert.deepEqual(body(calls).providerOptions, { gateway: { zeroDataRetention: true } });
});

// AC-KIT-017.5 — no ZDR provider is its own typed failure, not retried
test("zdr: 400 no_providers_available resolves no_zdr_provider after one attempt", async () => {
  const { c, calls } = client([
    { status: 400, body: { error: { type: "no_providers_available", message: "ZDR requested: 0 attempts support ZDR" } } },
  ]);
  const r = await c.ask(STATE, QS);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.failure.kind, "no_zdr_provider");
  assert.equal(r.failure.status, 400);
  assert.equal(r.failure.sent, true);
  assert.equal(calls.length, 1);
});

// AC-KIT-017.5, AC-KIT-013.21 — any other 400 stays rejected
test("zdr: a 400 invalid_request_error stays rejected", async () => {
  const { c } = client([
    { status: 400, body: { error: { type: "invalid_request_error", message: "Images must be base64", param: "input[0]" } } },
  ]);
  const r = await c.ask(STATE, QS);
  assert.equal(!r.ok && r.failure.kind, "rejected");
  assert.match(!r.ok ? r.failure.message : "", /invalid_request_error/);
});

// ── Model and endpoint ──────────────────────────────────────────────────────

// AC-KIT-017.2 — the model may be overridden
test("model: config.model overrides the default model id", async () => {
  const { c, calls } = client([{ status: 200, body: OK }], { model: "typesafe-ai/jev-1.15.0" });
  await c.ask(STATE, QS);
  assert.equal(body(calls).model, "typesafe-ai/jev-1.15.0");
});

// ── Translation both ways ───────────────────────────────────────────────────

// AC-KIT-017.18 — caller questions → wire questions
test("wire: noul → predicate (criteria folded in), choice → choices array, score → levels array, as a named array", () => {
  const { c, calls } = client([{ status: 200, body: OK }]);
  return c
    .ask(STATE, {
      person: noul("Is a person visible?", { true: "A face or body is in frame", false: "Only product" }),
      product: choice("What is the product?", { sunglasses: "Eyewear", hat: "Headwear" }),
      quality: score("How sharp is the photo?", ["blurry", "ok", "crisp"]),
    })
    .then(() => {
      assert.deepEqual(body(calls).questions, [
        {
          type: "predicate",
          name: "person",
          instructions: "Is a person visible?\nAnswer yes if: A face or body is in frame\nAnswer no if: Only product",
        },
        {
          type: "choice",
          name: "product",
          instructions: "What is the product?",
          choices: [
            { value: "sunglasses", description: "Eyewear" },
            { value: "hat", description: "Headwear" },
          ],
        },
        { type: "score", name: "quality", instructions: "How sharp is the photo?", levels: [{ label: "blurry" }, { label: "ok" }, { label: "crisp" }] },
      ]);
    });
});

// AC-KIT-017.15, .18 — wire answers → caller answers, matched by name not position
test("wire: answers are mapped back by name (not position) into the v0.1 shapes", async () => {
  const qs = {
    person: noul("Is a person visible?"),
    product: choice("What is the product?", { sunglasses: "Eyewear", hat: "Headwear" }),
    quality: score("How sharp is the photo?", ["blurry", "ok", "crisp"]),
  };
  const wire = [
    {
      type: "score",
      name: "quality",
      score: 1.3,
      confidence: 0.62,
      probabilities: [
        { value: 0, label: "blurry", probability: 0.08 },
        { value: 1, label: "ok", probability: 0.54 },
        { value: 2, label: "crisp", probability: 0.38 },
      ],
    },
    {
      type: "choice",
      name: "product",
      choice: "sunglasses",
      confidence: 1,
      probabilities: [
        { value: "sunglasses", probability: 1 },
        { value: "hat", probability: 0 },
      ],
    },
    { type: "predicate", name: "person", probability: 0.05 },
  ];
  const { c } = client([{ status: 200, body: okBody(wire) }]);
  const r = await c.ask(STATE, qs);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.answers.person, { type: "noul", noul: 0.05 });
  assert.deepEqual(r.answers.product, { type: "choice", choice: "sunglasses", probabilities: { sunglasses: 1, hat: 0 }, confidence: 1 });
  assert.deepEqual(r.answers.quality, {
    type: "score",
    score: 1.3,
    probabilities: { "0": 0.08, "1": 0.54, "2": 0.38 },
    confidence: 0.62,
    legend: { "0": "blurry", "1": "ok", "2": "crisp" },
  });
});

// AC-KIT-013.9 — answers keyed only by position (no name) are not trusted
test("wire: an answer without its question's name is bad_response", async () => {
  const { c } = client([{ status: 200, body: okBody([{ type: "predicate", probability: 0.5 }]) }]);
  const r = await c.ask(STATE, QS);
  assert.equal(!r.ok && r.failure.kind, "bad_response");
});

// AC-KIT-017.17 — provider absent is undefined, not invented
test("usage: provider is undefined when routing carries no finalProvider", async () => {
  const { c } = client([{ status: 200, body: okBody({ sunglasses: { type: "noul", noul: 0.9 } }, { provider_metadata: { gateway: { cost: "0.000044772" } } }) }]);
  const r = await c.ask(STATE, QS);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.usage.provider, undefined);
  assert.equal(r.usage.cost, 0.000044772);
});

// ── Refusals ────────────────────────────────────────────────────────────────

// AC-KIT-017.14, .16 — one refused question; the others answered; helpers say unsure
test("refusal: a refused question surfaces as { refused: true }; the others are answered; decide helpers return unsure", async () => {
  const qs = {
    person: noul("Is a person visible?"),
    product: choice("What is the product?", { sunglasses: "Eyewear", hat: "Headwear" }),
  };
  const wire = [
    { type: "refusal", name: "person" },
    { type: "choice", name: "product", choice: "hat", confidence: 0.9, probabilities: [{ value: "hat", probability: 0.9 }] },
  ];
  const { c } = client([{ status: 200, body: okBody(wire) }]);
  const r = await c.ask(STATE, qs);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.answers.person, { type: "refusal", refused: true });
  assert.equal(isRefused(r.answers.person), true);
  assert.equal(isRefused(r.answers.product), false);
  assert.equal(decide(r.answers.person, { yesAtOrAbove: 0.8, noAtOrBelow: 0.2 }), "unsure");
  assert.equal(decideChoice(r.answers.product, { minConfidence: 0.6 }), "hat");
  assert.equal(decideChoice({ type: "refusal", refused: true }, { minConfidence: 0 }), "unsure");
});

// AC-KIT-017.16 — decide accepts a noul answer as well as a number
test("refusal: decide reads a noul answer's probability the same as the bare number", () => {
  const t = { yesAtOrAbove: 0.8, noAtOrBelow: 0.2 };
  assert.equal(decide({ type: "noul", noul: 0.9 }, t), "yes");
  assert.equal(decide({ type: "noul", noul: 0.1 }, t), "no");
  assert.equal(decide(0.9, t), "yes");
});
