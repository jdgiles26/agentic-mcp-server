import { describe, expect, it } from "vitest";
import { createOpenAICompatibleClient } from "./openai-compatible.js";
import { scriptedFetch, jsonResponse } from "./test-fixtures.js";

describe("OpenAI-compatible client", () => {
  it("POSTs to /chat/completions with bearer auth", async () => {
    let seenReq: Request | undefined;
    const fetchImpl = scriptedFetch(async (req) => {
      seenReq = req;
      return jsonResponse({
        choices: [{ message: { content: "hi", role: "assistant" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 2 },
      });
    });
    const client = createOpenAICompatibleClient(
      {
        kind: "openai",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        apiKey: "sk-test",
      },
      { fetchImpl },
    );
    const r = await client.chat({
      messages: [{ role: "user", content: "ping" }],
    });
    expect(r.ok).toBe(true);
    expect(seenReq?.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(seenReq?.headers.get("authorization")).toBe("Bearer sk-test");
    const body = (await seenReq!.json()) as { model: string; messages: unknown };
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages).toEqual([{ role: "user", content: "ping" }]);
    if (r.ok) {
      expect(r.value.content).toBe("hi");
      expect(r.value.finishReason).toBe("stop");
      expect(r.value.usage?.promptTokens).toBe(1);
    }
  });

  it("maps 401 to PROVIDER_AUTH", async () => {
    const fetchImpl = scriptedFetch(async () =>
      new Response(JSON.stringify({ error: "nope" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = createOpenAICompatibleClient(
      { kind: "openai", baseUrl: "https://x/v1", model: "m", apiKey: "k" },
      { fetchImpl },
    );
    const r = await client.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PROVIDER_AUTH");
  });

  it("maps 429 to PROVIDER_RATE_LIMIT", async () => {
    const fetchImpl = scriptedFetch(async () =>
      new Response("{}", { status: 429, headers: { "content-type": "application/json" } }),
    );
    const client = createOpenAICompatibleClient(
      { kind: "openai", baseUrl: "https://x/v1", model: "m", apiKey: "k" },
      { fetchImpl },
    );
    const r = await client.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PROVIDER_RATE_LIMIT");
  });

  it("maps empty choices to PROVIDER_BAD_RESPONSE", async () => {
    const fetchImpl = scriptedFetch(async () => jsonResponse({ choices: [] }));
    const client = createOpenAICompatibleClient(
      { kind: "openai", baseUrl: "https://x/v1", model: "m", apiKey: "k" },
      { fetchImpl },
    );
    const r = await client.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PROVIDER_BAD_RESPONSE");
  });

  it("uses lemonade default bearer when no apiKey", async () => {
    let seenAuth: string | null = null;
    const fetchImpl = scriptedFetch(async (req) => {
      seenAuth = req.headers.get("authorization");
      return jsonResponse({
        choices: [{ message: { content: "x", role: "assistant" }, finish_reason: "stop" }],
      });
    });
    const client = createOpenAICompatibleClient(
      { kind: "lemonade", baseUrl: "http://localhost:13305/api/v1", model: "x" },
      { fetchImpl },
    );
    await client.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(seenAuth).toBe("Bearer lemonade");
  });

  it("returns PROVIDER_UNREACHABLE when fetch throws TypeError", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("network down");
    }) as typeof fetch;
    const client = createOpenAICompatibleClient(
      { kind: "openai", baseUrl: "https://x/v1", model: "m", apiKey: "k" },
      { fetchImpl },
    );
    const r = await client.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PROVIDER_UNREACHABLE");
  });
});
