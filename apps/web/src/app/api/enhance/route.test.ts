import { describe, expect, it } from "vitest";
import { ok } from "@prompt-forge/core";
import type { ProviderClient } from "@prompt-forge/providers";
import { handleEnhanceRequest } from "./handler.js";

const stub = (content: string): ProviderClient => ({
  async chat() {
    return ok({ content });
  },
});

describe("POST /api/enhance handler", () => {
  it("returns 400 for malformed JSON", async () => {
    const req = new Request("http://localhost/api/enhance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const r = await handleEnhanceRequest(req, () => stub("x"));
    expect(r.status).toBe(400);
  });

  it("returns 400 for invalid request shape", async () => {
    const req = new Request("http://localhost/api/enhance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rawPrompt: "hi" }),
    });
    const r = await handleEnhanceRequest(req, () => stub("x"));
    expect(r.status).toBe(400);
  });

  it("returns 400 for missing provider config", async () => {
    const req = new Request("http://localhost/api/enhance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rawPrompt: "a real long enough prompt" }),
    });
    const r = await handleEnhanceRequest(req, () => stub("x"));
    expect(r.status).toBe(400);
  });

  it("returns 200 with the rewritten prompt on happy path", async () => {
    const req = new Request("http://localhost/api/enhance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rawPrompt: "build a settings page for provider configs",
        provider: {
          kind: "ollama",
          baseUrl: "http://localhost:11434",
          model: "llama3.1:8b",
        },
      }),
    });
    const r = await handleEnhanceRequest(req, () => stub("```prompt\nhello rewrite\n```"));
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(body.rewrittenPrompt).toBe("hello rewrite");
    expect(body.selectedPatterns.length).toBeGreaterThan(0);
  });
});
