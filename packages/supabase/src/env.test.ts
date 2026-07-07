import { test } from "node:test";
import assert from "node:assert/strict";
import { stripEnvNewline } from "./env.ts";

const URL = "https://abcd.supabase.co";

// AC-KIT-003.5
test("strips a real trailing newline", () => {
  assert.equal(stripEnvNewline(`${URL}\n`), URL);
});

test("strips a literal backslash-n suffix", () => {
  assert.equal(stripEnvNewline(`${URL}\\n`), URL);
});

test("strips CRLF", () => {
  assert.equal(stripEnvNewline(`${URL}\r\n`), URL);
});

test("leaves a clean value unchanged (idempotent)", () => {
  assert.equal(stripEnvNewline(URL), URL);
});

test("applying the guard twice equals applying it once", () => {
  assert.equal(stripEnvNewline(stripEnvNewline(`${URL}\n`)), stripEnvNewline(`${URL}\n`));
});
