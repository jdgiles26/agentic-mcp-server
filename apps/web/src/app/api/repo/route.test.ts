import { ok } from "@prompt-forge/core";
import type { ProviderClient } from "@prompt-forge/providers";
import { describe, expect, it } from "vitest";
import { handleRepoRequest } from "./handler.js";

const ollamaProvider = { kind: "ollama", baseUrl: "http://localhost:11434", model: "llama3" };

const contentOutput =
  '<<<FILE:src/index.ts>>>\nconsole.log("hi");\n<<<ENDFILE>>>\n<<<FILE:README.md>>>\n# Repo\n<<<ENDFILE>>>';

const makeStub = (responses: string[]): ProviderClient => {
  let call = 0;
  return {
    async chat() {
      return ok({ content: responses[call++] ?? "" });
    },
  };
};

const makeRequest = (body: unknown) =>
  new Request("http://localhost/api/repo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/repo handler", () => {
  it("returns 400 for malformed JSON", async () => {
    const req = new Request("http://localhost/api/repo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const r = await handleRepoRequest(req, () => makeStub([]));
    expect(r.status).toBe(400);
  });

  it("returns 400 when objective is missing", async () => {
    const r = await handleRepoRequest(
      makeRequest({ provider: ollamaProvider }),
      () => makeStub([]),
    );
    expect(r.status).toBe(400);
    const body = (await r.json()) as any;
    expect(body.error.code).toBe("VALIDATION");
  });

  it("returns 400 when objective is too short (< 20 chars)", async () => {
    const r = await handleRepoRequest(
      makeRequest({ objective: "short", provider: ollamaProvider }),
      () => makeStub([]),
    );
    expect(r.status).toBe(400);
  });

  it("returns 400 when provider is missing", async () => {
    const r = await handleRepoRequest(
      makeRequest({ objective: "build a todo REST API with TypeScript" }),
      () => makeStub([]),
    );
    expect(r.status).toBe(400);
  });

  it("returns 200 with files and fileCount on happy path", async () => {
    const r = await handleRepoRequest(
      makeRequest({ objective: "build a todo REST API with TypeScript", provider: ollamaProvider }),
      () => makeStub([contentOutput]),
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(body.fileCount).toBe(2);
    expect(body.files).toHaveLength(2);
    expect(body.files[0].path).toBe("src/index.ts");
  });

  it("returns 502 when provider is unreachable", async () => {
    const failing: ProviderClient = {
      async chat() {
        return { ok: false as const, error: { code: "PROVIDER_UNREACHABLE" as const, message: "down" } };
      },
    };
    const r = await handleRepoRequest(
      makeRequest({ objective: "build a todo REST API with TypeScript", provider: ollamaProvider }),
      () => failing,
    );
    expect(r.status).toBe(502);
  });

  it("returns 500 when LLM returns bad response format", async () => {
    const r = await handleRepoRequest(
      makeRequest({ objective: "build a todo REST API with TypeScript", provider: ollamaProvider }),
      () => makeStub(["no markers"]),
    );
    expect(r.status).toBe(500);
    const body = (await r.json()) as any;
    expect(body.error.code).toBe("PROVIDER_BAD_RESPONSE");
  });

  it("never leaks cause in error response", async () => {
    const failing: ProviderClient = {
      async chat() {
        return {
          ok: false as const,
          error: {
            code: "PROVIDER_UNREACHABLE" as const,
            message: "down",
            cause: new Error("internal /etc/passwd path"),
          },
        };
      },
    };
    const r = await handleRepoRequest(
      makeRequest({ objective: "build a todo REST API with TypeScript", provider: ollamaProvider }),
      () => failing,
    );
    expect(r.status).toBe(502);
    const text = await r.text();
    expect(text).not.toContain("/etc/passwd");
  });
});
