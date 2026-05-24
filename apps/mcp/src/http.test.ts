import { describe, expect, it, afterEach } from "vitest";
import { ok } from "@prompt-forge/core";
import type { ProviderClient } from "@prompt-forge/providers";
import { startHttpServer } from "./http.js";

const stubProvider = (content: string): ProviderClient => ({
  async chat() {
    return ok({ content });
  },
});

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

describe("HTTP transport", () => {
  it("accepts a JSON-RPC POST and returns the result", async () => {
    const server = await startHttpServer({
      port: 0,
      providerClientFactory: () => stubProvider("```prompt\nhello\n```"),
    });
    close = server.close;
    const res = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.id).toBe(1);
    expect(body.result.tools[0].name).toBe("enhance_prompt");
  });

  it("returns 200 with -32600 for malformed payload", async () => {
    const server = await startHttpServer({
      port: 0,
      providerClientFactory: () => stubProvider("x"),
    });
    close = server.close;
    const res = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"not":"jsonrpc"}',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe(-32600);
  });

  it("returns 400 on non-JSON body", async () => {
    const server = await startHttpServer({
      port: 0,
      providerClientFactory: () => stubProvider("x"),
    });
    close = server.close;
    const res = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json at all{",
    });
    expect(res.status).toBe(400);
  });

  it("returns 405 for non-POST methods on /mcp", async () => {
    const server = await startHttpServer({
      port: 0,
      providerClientFactory: () => stubProvider("x"),
    });
    close = server.close;
    const res = await fetch(`http://127.0.0.1:${server.port}/mcp`);
    expect(res.status).toBe(405);
  });
});
