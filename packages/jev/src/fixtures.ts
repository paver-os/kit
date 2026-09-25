/**
 * Test-only harness: a scripted fetch and a fake clock, so retry, backoff and
 * budget behaviour is asserted without real network or real waiting.
 * Not exported from the package entry, so tsup never bundles it.
 */
import type { FetchLike } from "./types.ts";

export const TEST_KEY = "vck_TEST_SECRET_KEY_0123456789abcdef";

export interface RecordedCall {
  url: string;
  method: string | undefined;
  headers: Record<string, string>;
  body: unknown;
}

/** One scripted outcome per attempt: a response, a thrown error, or a hang until aborted. */
export type Scripted =
  | { status: number; body?: unknown; headers?: Record<string, string>; rawBody?: string }
  | { throws: Error }
  | { hang: true };

export function scriptedFetch(script: Scripted[]): { fetch: FetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  let i = 0;
  const fetch: FetchLike = async (url, init) => {
    const headers: Record<string, string> = {};
    const h = init?.headers as Record<string, string> | undefined;
    if (h) for (const [k, v] of Object.entries(h)) headers[k.toLowerCase()] = v;
    calls.push({
      url: String(url),
      method: init?.method,
      headers,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    const step = script[Math.min(i, script.length - 1)];
    i += 1;
    if (!step) throw new Error("script exhausted");
    if ("throws" in step) throw step.throws;
    if ("hang" in step) {
      return new Promise<Response>((_, reject) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }
    const text = step.rawBody ?? (step.body === undefined ? "" : JSON.stringify(step.body));
    return new Response(text, { status: step.status, headers: step.headers });
  };
  return { fetch, calls };
}

/** A fake clock: `sleep` advances `now` instantly and records each wait. */
export function fakeClock(start = 1_000_000) {
  let t = start;
  const waits: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      waits.push(ms);
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
    waits,
  };
}

export function okBody(answers: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    model: "typesafe-ai/jev",
    answers,
    usage: { input_tokens: 326, output_tokens: 40 },
    provider_metadata: { gateway: { cost: "0", marketCost: "0.0000137" } },
    ...extra,
  };
}
