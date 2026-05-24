import { describe, expect, it } from "vitest";
import { createProviderClient, DEFAULT_BASE_URLS } from "./factory.js";
import { jsonResponse, scriptedFetch } from "./test-fixtures.js";

describe("factory", () => {
  it("routes openai kind to OpenAI-compatible client", async () => {
    const fetchImpl = scriptedFetch(async (req) => {
      expect(req.url.endsWith("/chat/completions")).toBe(true);
      return jsonResponse({
        choices: [{ message: { content: "x", role: "assistant" }, finish_reason: "stop" }],
      });
    });
    const client = createProviderClient(
      { kind: "openai", baseUrl: "https://api.openai.com/v1", model: "m", apiKey: "k" },
      { fetchImpl },
    );
    const r = await client.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(r.ok).toBe(true);
  });

  it("routes ollama kind to ollama client", async () => {
    const fetchImpl = scriptedFetch(async (req) => {
      expect(req.url.endsWith("/api/chat")).toBe(true);
      return jsonResponse({
        message: { role: "assistant", content: "x" },
        done: true,
        prompt_eval_count: 0,
        eval_count: 0,
      });
    });
    const client = createProviderClient(
      { kind: "ollama", baseUrl: "http://localhost:11434", model: "m" },
      { fetchImpl },
    );
    const r = await client.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(r.ok).toBe(true);
  });

  it("routes lemonade kind to OpenAI-compatible client with default lemonade bearer", async () => {
    let seenReq: Request | undefined;
    const fetchImpl = scriptedFetch(async (req) => {
      seenReq = req;
      return jsonResponse({
        choices: [{ message: { content: "x", role: "assistant" }, finish_reason: "stop" }],
      });
    });
    const client = createProviderClient(
      { kind: "lemonade", baseUrl: "http://localhost:13305/api/v1", model: "m" },
      { fetchImpl },
    );
    const r = await client.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(r.ok).toBe(true);
    expect(seenReq?.url).toBe("http://localhost:13305/api/v1/chat/completions");
    expect(seenReq?.headers.get("authorization")).toBe("Bearer lemonade");
  });

  it("routes llamacpp kind to OpenAI-compatible client with no authorization header", async () => {
    let seenReq: Request | undefined;
    const fetchImpl = scriptedFetch(async (req) => {
      seenReq = req;
      return jsonResponse({
        choices: [{ message: { content: "x", role: "assistant" }, finish_reason: "stop" }],
      });
    });
    const client = createProviderClient(
      { kind: "llamacpp", baseUrl: "http://localhost:8080/v1", model: "m" },
      { fetchImpl },
    );
    const r = await client.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(r.ok).toBe(true);
    expect(seenReq?.url).toBe("http://localhost:8080/v1/chat/completions");
    expect(seenReq?.headers.get("authorization")).toBeNull();
  });

  it("exposes default base URLs for the UI", () => {
    expect(DEFAULT_BASE_URLS.ollama).toBe("http://localhost:11434");
    expect(DEFAULT_BASE_URLS.lemonade).toBe("http://localhost:13305/api/v1");
    expect(DEFAULT_BASE_URLS.llamacpp).toBe("http://localhost:8080/v1");
    expect(DEFAULT_BASE_URLS.openai).toBe("https://api.openai.com/v1");
    expect(DEFAULT_BASE_URLS.anthropic).toBe("https://api.anthropic.com");
  });
});
