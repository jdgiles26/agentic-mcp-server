import { describe, expect, it } from "vitest";
import { createAnthropicClient } from "./anthropic.js";
import { createOllamaClient } from "./ollama.js";
import { createOpenAICompatibleClient } from "./openai-compatible.js";

/**
 * Live integration tests gated by env vars. These hit real LLM endpoints
 * and are skipped by default.
 *
 *   LIVE_OLLAMA=1                          → hits localhost:11434
 *   LIVE_OPENAI=1 OPENAI_API_KEY=sk-...    → hits api.openai.com
 *   LIVE_ANTHROPIC=1 ANTHROPIC_API_KEY=... → hits api.anthropic.com
 */

const ping = {
  messages: [{ role: "user" as const, content: "Reply with the single word: pong" }],
  maxTokens: 16,
};

describe.skipIf(!process.env.LIVE_OLLAMA)("LIVE ollama", () => {
  it("returns a non-empty completion", async () => {
    const client = createOllamaClient({
      kind: "ollama",
      baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
      model: process.env.OLLAMA_MODEL ?? "llama3.1:8b",
    });
    const r = await client.chat(ping);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.content.length).toBeGreaterThan(0);
  }, 60_000);
});

describe.skipIf(!process.env.LIVE_OPENAI)("LIVE openai", () => {
  it("returns a non-empty completion", async () => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("LIVE_OPENAI set but OPENAI_API_KEY missing");
    const client = createOpenAICompatibleClient({
      kind: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      apiKey: key,
    });
    const r = await client.chat(ping);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.content.length).toBeGreaterThan(0);
  }, 60_000);
});

describe.skipIf(!process.env.LIVE_ANTHROPIC)("LIVE anthropic", () => {
  it("returns a non-empty completion", async () => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("LIVE_ANTHROPIC set but ANTHROPIC_API_KEY missing");
    const client = createAnthropicClient({
      kind: "anthropic",
      baseUrl: "https://api.anthropic.com",
      model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
      apiKey: key,
    });
    const r = await client.chat(ping);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.content.length).toBeGreaterThan(0);
  }, 60_000);
});
