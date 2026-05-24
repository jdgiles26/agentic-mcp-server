import { describe, expect, it } from "vitest";
import { createAnthropicClient } from "./anthropic.js";
import { jsonResponse, scriptedFetch } from "./test-fixtures.js";

describe("Anthropic native client", () => {
  it("POSTs to /v1/messages with anthropic headers", async () => {
    let seenReq: Request | undefined;
    const fetchImpl = scriptedFetch(async (req) => {
      seenReq = req;
      return jsonResponse({
        content: [{ type: "text", text: "hello back" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 5, output_tokens: 7 },
      });
    });
    const client = createAnthropicClient(
      {
        kind: "anthropic",
        baseUrl: "https://api.anthropic.com",
        model: "claude-3-5-sonnet-20240620",
        apiKey: "sk-ant-test",
      },
      fetchImpl,
    );
    const r = await client.chat({
      messages: [{ role: "user", content: "hi" }],
    });
    expect(r.ok).toBe(true);
    expect(seenReq?.url).toBe("https://api.anthropic.com/v1/messages");
    expect(seenReq?.headers.get("x-api-key")).toBe("sk-ant-test");
    expect(seenReq?.headers.get("anthropic-version")).toBe("2023-06-01");
    expect(seenReq?.headers.get("content-type")).toBe("application/json");
    const body = (await seenReq!.json()) as {
      model: string;
      max_tokens: number;
      messages: unknown;
      system?: string;
    };
    expect(body.model).toBe("claude-3-5-sonnet-20240620");
    expect(body.max_tokens).toBe(4096);
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(body.system).toBeUndefined();
    if (r.ok) {
      expect(r.value.content).toBe("hello back");
      expect(r.value.finishReason).toBe("stop");
      expect(r.value.usage?.promptTokens).toBe(5);
      expect(r.value.usage?.completionTokens).toBe(7);
    }
  });

  it("concatenates system messages and filters them from messages", async () => {
    let seenBody:
      | { system?: string; messages: Array<{ role: string; content: string }> }
      | undefined;
    const fetchImpl = scriptedFetch(async (req) => {
      seenBody = (await req.json()) as typeof seenBody;
      return jsonResponse({
        content: [{ type: "text", text: "ok" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    });
    const client = createAnthropicClient(
      {
        kind: "anthropic",
        baseUrl: "https://api.anthropic.com",
        model: "claude-3-opus",
        apiKey: "k",
      },
      fetchImpl,
    );
    await client.chat({
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "system", content: "Be concise." },
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
        { role: "user", content: "again" },
      ],
    });
    expect(seenBody?.system).toBe("You are helpful.\n\nBe concise.");
    expect(seenBody?.messages).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "user", content: "again" },
    ]);
  });

  it("uses provided maxTokens when given", async () => {
    let seenBody: { max_tokens: number } | undefined;
    const fetchImpl = scriptedFetch(async (req) => {
      seenBody = (await req.json()) as typeof seenBody;
      return jsonResponse({
        content: [{ type: "text", text: "ok" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    });
    const client = createAnthropicClient(
      {
        kind: "anthropic",
        baseUrl: "https://api.anthropic.com",
        model: "claude-3",
        apiKey: "k",
      },
      fetchImpl,
    );
    await client.chat({
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 256,
    });
    expect(seenBody?.max_tokens).toBe(256);
  });

  it("maps stop_reason to finishReason", async () => {
    const make = (reason: string) =>
      scriptedFetch(async () =>
        jsonResponse({
          content: [{ type: "text", text: "x" }],
          stop_reason: reason,
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      );
    const cfg = {
      kind: "anthropic" as const,
      baseUrl: "https://api.anthropic.com",
      model: "m",
      apiKey: "k",
    };
    const cases: Array<[string, "stop" | "length" | "tool_use" | "other"]> = [
      ["end_turn", "stop"],
      ["max_tokens", "length"],
      ["tool_use", "tool_use"],
      ["stop_sequence", "other"],
      ["something_else", "other"],
    ];
    for (const [raw, mapped] of cases) {
      const client = createAnthropicClient(cfg, make(raw));
      const r = await client.chat({ messages: [{ role: "user", content: "x" }] });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.finishReason).toBe(mapped);
    }
  });

  it("returns CONFIG_MISSING without calling fetch when apiKey absent", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response("{}");
    }) as typeof fetch;
    // Bypass discriminated union apiKey requirement via cast for test purposes
    const client = createAnthropicClient(
      {
        kind: "anthropic",
        baseUrl: "https://api.anthropic.com",
        model: "m",
      } as unknown as Parameters<typeof createAnthropicClient>[0],
      fetchImpl,
    );
    const r = await client.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(called).toBe(false);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("CONFIG_MISSING");
      expect(r.error.message).toBe("anthropic requires an apiKey");
    }
  });

  it("returns PROVIDER_BAD_RESPONSE on empty content array", async () => {
    const fetchImpl = scriptedFetch(async () =>
      jsonResponse({ content: [], stop_reason: "end_turn" }),
    );
    const client = createAnthropicClient(
      {
        kind: "anthropic",
        baseUrl: "https://api.anthropic.com",
        model: "m",
        apiKey: "k",
      },
      fetchImpl,
    );
    const r = await client.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PROVIDER_BAD_RESPONSE");
  });

  it("returns PROVIDER_BAD_RESPONSE when first content block is not text", async () => {
    const fetchImpl = scriptedFetch(async () =>
      jsonResponse({
        content: [{ type: "image", text: "ignored" }],
        stop_reason: "end_turn",
      }),
    );
    const client = createAnthropicClient(
      {
        kind: "anthropic",
        baseUrl: "https://api.anthropic.com",
        model: "m",
        apiKey: "k",
      },
      fetchImpl,
    );
    const r = await client.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PROVIDER_BAD_RESPONSE");
  });

  it("returns PROVIDER_BAD_RESPONSE when first content block has no text", async () => {
    const fetchImpl = scriptedFetch(async () =>
      jsonResponse({
        content: [{ type: "text" }],
        stop_reason: "end_turn",
      }),
    );
    const client = createAnthropicClient(
      {
        kind: "anthropic",
        baseUrl: "https://api.anthropic.com",
        model: "m",
        apiKey: "k",
      },
      fetchImpl,
    );
    const r = await client.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PROVIDER_BAD_RESPONSE");
  });

  it("maps 401 to PROVIDER_AUTH", async () => {
    const fetchImpl = scriptedFetch(
      async () =>
        new Response(JSON.stringify({ error: "nope" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = createAnthropicClient(
      {
        kind: "anthropic",
        baseUrl: "https://api.anthropic.com",
        model: "m",
        apiKey: "k",
      },
      fetchImpl,
    );
    const r = await client.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PROVIDER_AUTH");
  });
});
