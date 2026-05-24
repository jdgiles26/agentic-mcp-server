import { ok } from "@prompt-forge/core";
import type { ProviderClient } from "@prompt-forge/providers";
import { describe, expect, it } from "vitest";
import { handleProviderTestRequest } from "./handler.js";

const okStub = (
  content = "pong",
  usage?: { completionTokens?: number; promptTokens?: number },
): ProviderClient => ({
  async chat() {
    return ok({ content, ...(usage ? { usage } : {}) });
  },
});

describe("POST /api/providers/test handler", () => {
  it("returns 400 for malformed JSON", async () => {
    const req = new Request("http://localhost/api/providers/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const r = await handleProviderTestRequest(req, () => okStub());
    expect(r.status).toBe(400);
    const body = (await r.json()) as any;
    expect(body.error.code).toBe("VALIDATION");
  });

  it("returns 400 when provider is missing", async () => {
    const req = new Request("http://localhost/api/providers/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const r = await handleProviderTestRequest(req, () => okStub());
    expect(r.status).toBe(400);
    const body = (await r.json()) as any;
    expect(body.error.code).toBe("VALIDATION");
  });

  it("returns 200 with model + tokens on happy path", async () => {
    const req = new Request("http://localhost/api/providers/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: {
          kind: "ollama",
          baseUrl: "http://localhost:11434",
          model: "x",
        },
      }),
    });
    const r = await handleProviderTestRequest(req, () => okStub("pong", { completionTokens: 4 }));
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.model).toBe("x");
    expect(body.tokens).toBe(4);
  });

  it("returns 200 with tokens=null when usage absent", async () => {
    const req = new Request("http://localhost/api/providers/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: {
          kind: "ollama",
          baseUrl: "http://localhost:11434",
          model: "y",
        },
      }),
    });
    const r = await handleProviderTestRequest(req, () => okStub());
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.model).toBe("y");
    expect(body.tokens).toBeNull();
  });

  it("maps PROVIDER_AUTH to 500 (pinning current mapping)", async () => {
    const failing: ProviderClient = {
      async chat() {
        return {
          ok: false as const,
          error: { code: "PROVIDER_AUTH" as const, message: "bad key" },
        };
      },
    };
    const req = new Request("http://localhost/api/providers/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: {
          kind: "openai",
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-4o-mini",
          apiKey: "sk-x",
        },
      }),
    });
    const r = await handleProviderTestRequest(req, () => failing);
    expect(r.status).toBe(500);
    const body = (await r.json()) as any;
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("PROVIDER_AUTH");
  });

  it("maps PROVIDER_UNREACHABLE to 502 and strips cause", async () => {
    const failing: ProviderClient = {
      async chat() {
        return {
          ok: false as const,
          error: {
            code: "PROVIDER_UNREACHABLE" as const,
            message: "fetch failed",
            cause: new Error("secret /etc/hosts"),
          },
        };
      },
    };
    const req = new Request("http://localhost/api/providers/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: {
          kind: "ollama",
          baseUrl: "http://localhost:11434",
          model: "x",
        },
      }),
    });
    const r = await handleProviderTestRequest(req, () => failing);
    expect(r.status).toBe(502);
    const body = (await r.json()) as any;
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("PROVIDER_UNREACHABLE");
    expect(body.error.cause).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("/etc/hosts");
  });

  it("sends a tiny ping chat with maxTokens=8", async () => {
    let seen: any = null;
    const client: ProviderClient = {
      async chat(req) {
        seen = req;
        return ok({ content: "pong" });
      },
    };
    const req = new Request("http://localhost/api/providers/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: {
          kind: "ollama",
          baseUrl: "http://localhost:11434",
          model: "z",
        },
      }),
    });
    const r = await handleProviderTestRequest(req, () => client);
    expect(r.status).toBe(200);
    expect(seen.maxTokens).toBe(8);
    expect(seen.messages).toEqual([{ role: "user", content: "ping" }]);
  });
});
