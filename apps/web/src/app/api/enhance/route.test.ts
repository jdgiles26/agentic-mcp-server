import { ok } from "@prompt-forge/core";
import type { ProviderClient } from "@prompt-forge/providers";
import { describe, expect, it } from "vitest";
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

  it("never serializes the underlying cause in an error response", async () => {
    const failingProvider: ProviderClient = {
      async chat() {
        return {
          ok: false as const,
          error: {
            code: "PROVIDER_UNREACHABLE" as const,
            message: "fetch failed",
            cause: new Error("internal /etc/hosts path"),
          },
        };
      },
    };
    const req = new Request("http://localhost/api/enhance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rawPrompt: "build a settings page for provider configs",
        provider: { kind: "ollama", baseUrl: "http://localhost:11434", model: "x" },
      }),
    });
    const r = await handleEnhanceRequest(req, () => failingProvider);
    expect(r.status).toBe(502);
    const body = (await r.json()) as any;
    expect(body.error.code).toBe("PROVIDER_UNREACHABLE");
    expect(body.error.cause).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("/etc/hosts");
  });

  it("forwards optional temperature through to the chat call", async () => {
    let seen: { temperature?: number } = {};
    const client: ProviderClient = {
      async chat(req) {
        seen = req;
        return ok({ content: "```prompt\nx\n```" });
      },
    };
    const req = new Request("http://localhost/api/enhance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rawPrompt: "build a settings page for provider configs",
        temperature: 0.3,
        provider: { kind: "ollama", baseUrl: "http://x", model: "y" },
      }),
    });
    const r = await handleEnhanceRequest(req, () => client);
    expect(r.status).toBe(200);
    expect(seen.temperature).toBe(0.3);
  });
});
