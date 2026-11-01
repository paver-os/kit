/**
 * #DecisionsWire (@REQ-KIT-017) — translation between the caller's v0.1
 * shapes and the gateway's OpenAI-compatible `/v1/decisions` wire, verified
 * live 2026-10-31:
 *
 *   noul   → `predicate` (instructions only; true/false criteria are folded
 *            into the instructions, since predicate has no criteria field)
 *   choice → `choice` with `choices: [{value, description}]`
 *   score  → `score`  with `levels:  [{label}]`
 *
 * Questions become a NAMED ARRAY; answers come back in question order with the
 * same `name`, and are mapped back to the caller's keys by name — never by
 * position. Zero data retention is always requested (AC-KIT-017.3): there is
 * deliberately no parameter that turns it off.
 */
import type { JevImage, JevImageDetail, JevImageMediaType, JevQuestion } from "./types.ts";
import { imageDimensionProblem, imageSize } from "./guards.ts";

// ── Wire shapes ──────────────────────────────────────────────────────────────

export type WireQuestion =
  | { type: "predicate"; name: string; instructions: string }
  | { type: "choice"; name: string; instructions: string; choices: { value: string; description: string }[] }
  | { type: "score"; name: string; instructions: string; levels: { label: string }[] };

export type WirePart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail: JevImageDetail };

export interface WireBody {
  model: string;
  input: string | { role: "user"; content: WirePart[] }[];
  questions: WireQuestion[];
  providerOptions: { gateway: { zeroDataRetention: true } };
}

/** The gateway's own name for "no provider on this route satisfies your ZDR requirement". */
export const NO_ZDR_ERROR_TYPE = "no_providers_available";

// ── Questions ────────────────────────────────────────────────────────────────

/**
 * The questions exactly as they go on the wire. Only known fields are copied
 * (AC-KIT-015.20), so an extra field a caller attached can neither carry data
 * out nor escape the scan. Callers must pass questions that passed `questionProblem`.
 */
export function wireQuestions(questions: Record<string, JevQuestion>): WireQuestion[] {
  return Object.entries(questions).map(([name, q]): WireQuestion => {
    if (q.type === "noul") {
      const instructions =
        q.criteria === undefined
          ? q.instructions
          : `${q.instructions}\nAnswer yes if: ${q.criteria.true}\nAnswer no if: ${q.criteria.false}`;
      return { type: "predicate", name, instructions };
    }
    if (q.type === "choice") {
      return {
        type: "choice",
        name,
        instructions: q.instructions,
        choices: Object.entries(q.criteria).map(([value, description]) => ({ value, description: String(description) })),
      };
    }
    return { type: "score", name, instructions: q.instructions, levels: q.criteria.map((label) => ({ label })) };
  });
}

// ── Images ───────────────────────────────────────────────────────────────────

export const MAX_IMAGES = 128;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_MEDIA_TYPES: readonly JevImageMediaType[] = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const IMAGE_DETAILS: readonly JevImageDetail[] = ["low", "high", "auto"];

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** A validated image, ready for the wire: base64 payload, decoded size, detail resolved. */
export interface PreparedImage {
  base64: string;
  bytes: number;
  mediaType: JevImageMediaType;
  detail: JevImageDetail;
}

/** Returns the reason the image list is unusable, or the prepared images (AC-KIT-017.7 – .10). Never throws. */
export function prepareImages(images: unknown): { problem: string } | { images: PreparedImage[] } {
  if (images === undefined) return { images: [] };
  if (!Array.isArray(images)) return { problem: "images must be an array" };
  if (images.length > MAX_IMAGES) return { problem: `at most ${MAX_IMAGES} images per call (got ${images.length})` };
  const out: PreparedImage[] = [];
  for (const [i, raw] of images.entries()) {
    const img = raw as Partial<JevImage> | null;
    if (typeof img !== "object" || img === null) return { problem: `image ${i} is not an object` };
    if (!IMAGE_MEDIA_TYPES.includes(img.mediaType as JevImageMediaType)) {
      return { problem: `image ${i}: mediaType must be one of ${IMAGE_MEDIA_TYPES.join(", ")}` };
    }
    const detail = img.detail ?? "low";
    if (!IMAGE_DETAILS.includes(detail)) return { problem: `image ${i}: detail must be one of ${IMAGE_DETAILS.join(", ")}` };
    let base64: string;
    let bytes: number;
    if (img.data instanceof Uint8Array) {
      bytes = img.data.byteLength;
      if (bytes > MAX_IMAGE_BYTES) return { problem: `image ${i} is ${bytes} bytes; the limit is ${MAX_IMAGE_BYTES}` };
      base64 = bytesToBase64(img.data);
    } else if (typeof img.data === "string") {
      base64 = img.data.replace(/\s+/g, "");
      if (base64.startsWith("data:")) return { problem: `image ${i}: pass base64 without the data: prefix` };
      if (base64.length % 4 !== 0 || !BASE64.test(base64)) return { problem: `image ${i}: data is not base64` };
      bytes = (base64.length / 4) * 3 - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
      if (bytes > MAX_IMAGE_BYTES) return { problem: `image ${i} is ${bytes} bytes; the limit is ${MAX_IMAGE_BYTES}` };
    } else {
      return { problem: `image ${i}: data must be a Uint8Array or a base64 string` };
    }
    if (bytes === 0) return { problem: `image ${i} is empty` };
    const header = img.data instanceof Uint8Array ? img.data : base64ToBytes(base64);
    const dims = imageDimensionProblem(i, imageSize(header));
    if (dims) return { problem: dims };
    out.push({ base64, bytes, mediaType: img.mediaType as JevImageMediaType, detail });
  }
  return { images: out };
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** Base64 without Node's Buffer (ADR-005: no Node-only APIs). Chunked so a 5 MB image never overflows the call stack. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

// ── Body ─────────────────────────────────────────────────────────────────────

/**
 * Text-only calls send `input` as the plain state string; a call with images
 * sends one user message whose parts are the state (when non-empty) then each
 * image in order (AC-KIT-017.6).
 */
export function wireBody(model: string, state: string, questions: WireQuestion[], images: PreparedImage[]): WireBody {
  const input: WireBody["input"] =
    images.length === 0
      ? state
      : [
          {
            role: "user",
            content: [
              ...(state.trim() === "" ? [] : [{ type: "input_text" as const, text: state }]),
              ...images.map(
                (img): WirePart => ({ type: "input_image", image_url: `data:${img.mediaType};base64,${img.base64}`, detail: img.detail }),
              ),
            ],
          },
        ];
  return { model, input, questions, providerOptions: { gateway: { zeroDataRetention: true } } };
}

// ── Answers ──────────────────────────────────────────────────────────────────

/**
 * Translates one wire answer back to the caller's v0.1 shape, validating
 * every field the caller's answer type promises (AC-KIT-013.10, AC-KIT-016.14,
 * .15, .25, .26). Returns the translated answer or the reason it is unusable.
 */
export function readAnswer(q: JevQuestion, raw: Record<string, unknown> | null): { problem: string } | { answer: unknown } {
  if (!raw) return { problem: "missing" };
  if (raw.type === "refusal") return { answer: { type: "refusal", refused: true } };
  const wireType = q.type === "noul" ? "predicate" : q.type;
  if (raw.type !== wireType) return { problem: `type ${String(raw.type)} does not match question type ${wireType}` };
  switch (q.type) {
    case "noul":
      return isProbability(raw.probability)
        ? { answer: { type: "noul", noul: raw.probability } }
        : { problem: "predicate probability is not in 0..1" };
    case "choice": {
      if (typeof raw.choice !== "string" || !Object.hasOwn(q.criteria, raw.choice)) return { problem: "choice is not an offered option" };
      if (!isProbability(raw.confidence)) return { problem: "confidence is not in 0..1" };
      const probs = probabilityList(raw.probabilities, new Set(Object.keys(q.criteria)), (p) => p.value);
      if ("problem" in probs) return probs;
      return { answer: { type: "choice", choice: raw.choice, probabilities: probs.map, confidence: raw.confidence } };
    }
    case "score": {
      const top = q.criteria.length - 1;
      if (typeof raw.score !== "number" || !Number.isFinite(raw.score)) return { problem: "score is not a number" };
      if (raw.score < 0 || raw.score > top) return { problem: `score is outside 0..${top}` };
      if (!isProbability(raw.confidence)) return { problem: "confidence is not in 0..1" };
      const levels = new Set(q.criteria.map((_, i) => String(i)));
      const probs = probabilityList(raw.probabilities, levels, (p) => (typeof p.value === "number" ? String(p.value) : undefined));
      if ("problem" in probs) return probs;
      const legend = Object.fromEntries(q.criteria.map((label, i) => [String(i), label]));
      return { answer: { type: "score", score: raw.score, probabilities: probs.map, confidence: raw.confidence, legend } };
    }
  }
}

/** A wire probability list `[{value, probability}]` → `Record<key, p>`; every key known, every p in 0..1. */
function probabilityList(
  raw: unknown,
  allowed: Set<string>,
  keyOf: (p: Record<string, unknown>) => unknown,
): { problem: string } | { map: Record<string, number> } {
  if (!Array.isArray(raw)) return { problem: "probabilities are missing" };
  const map: Record<string, number> = {};
  for (const item of raw) {
    const p = asRecord(item);
    const key = p ? keyOf(p) : undefined;
    if (!p || typeof key !== "string" || !allowed.has(key)) return { problem: `probability for unknown option "${String(key)}"` };
    if (!isProbability(p.probability)) return { problem: `probability for "${key}" is not in 0..1` };
    map[key] = p.probability as number;
  }
  return { map };
}

function isProbability(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
}

export function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
