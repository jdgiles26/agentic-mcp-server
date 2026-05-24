import { describe, expect, it } from "vitest";
import { requestJson } from "./http.js";
import { scriptedFetch, jsonResponse } from "./test-fixtures.js";

const url = "https://example.test/endpoint";

describe("requestJson", () => {
  it("maps 401 to PROVIDER_AUTH", async () => {
    const fetchImpl = scriptedFetch(async () =>
      new Response(JSON.stringify({ error: "no" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    const r = await requestJson({ url, body: {} }, fetchImpl);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PROVIDER_AUTH");
  });

  it("maps 429 to PROVIDER_RATE_LIMIT", async () => {
    const fetchImpl = scriptedFetch(async () =>
      new Response("{}", {
        status: 429,
        headers: { "content-type": "application/json" },
      }),
    );
    const r = await requestJson({ url, body: {} }, fetchImpl);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PROVIDER_RATE_LIMIT");
  });

  it("maps 504 to PROVIDER_TIMEOUT", async () => {
    const fetchImpl = scriptedFetch(async () =>
      new Response("{}", {
        status: 504,
        headers: { "content-type": "application/json" },
      }),
    );
    const r = await requestJson({ url, body: {} }, fetchImpl);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PROVIDER_TIMEOUT");
  });

  it("maps 500 to PROVIDER_UNREACHABLE", async () => {
    const fetchImpl = scriptedFetch(async () =>
      new Response("{}", {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );
    const r = await requestJson({ url, body: {} }, fetchImpl);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PROVIDER_UNREACHABLE");
  });

  it("returns PROVIDER_BAD_RESPONSE for non-JSON content-type", async () => {
    const fetchImpl = scriptedFetch(async () =>
      new Response("<html>nope</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    const r = await requestJson({ url, body: {} }, fetchImpl);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PROVIDER_BAD_RESPONSE");
  });

  it("returns PROVIDER_UNREACHABLE when fetch throws TypeError", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("network down");
    }) as typeof fetch;
    const r = await requestJson({ url, body: {} }, fetchImpl);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PROVIDER_UNREACHABLE");
  });

  it("returns PROVIDER_TIMEOUT when aborted via timeoutMs", async () => {
    const fetchImpl = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const signal = init?.signal;
      return new Promise<Response>((resolve, reject) => {
        const t = setTimeout(() => {
          resolve(jsonResponse({ ok: true }));
        }, 300);
        if (signal) {
          if (signal.aborted) {
            clearTimeout(t);
            reject(new DOMException("aborted", "AbortError"));
            return;
          }
          signal.addEventListener("abort", () => {
            clearTimeout(t);
            reject(new DOMException("aborted", "AbortError"));
          });
        }
      });
    }) as typeof fetch;
    const r = await requestJson({ url, body: {}, timeoutMs: 50 }, fetchImpl);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PROVIDER_TIMEOUT");
  });

  it("returns parsed JSON on 200 with application/json", async () => {
    const fetchImpl = scriptedFetch(async () => jsonResponse({ hello: "world" }));
    const r = await requestJson<{ hello: string }>({ url, body: {} }, fetchImpl);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.hello).toBe("world");
  });
});
