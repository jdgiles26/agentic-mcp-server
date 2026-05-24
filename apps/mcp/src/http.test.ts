import { ok } from "@prompt-forge/core";
import type { ProviderClient } from "@prompt-forge/providers";
import { afterEach, describe, expect, it } from "vitest";
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

  it("rejects bodies above the default 256 KiB limit with 413", async () => {
    const server = await startHttpServer({
      port: 0,
      providerClientFactory: () => stubProvider("x"),
    });
    close = server.close;
    const big = "a".repeat(300_000);
    const res = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: big,
    });
    expect(res.status).toBe(413);
    const body = (await res.json()) as any;
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBeNull();
    expect(body.error.code).toBe(-32600);
    expect(body.error.message).toBe("Request body too large");
  });

  it("honors a custom maxBodyBytes setting", async () => {
    const server = await startHttpServer({
      port: 0,
      maxBodyBytes: 1024,
      providerClientFactory: () => stubProvider("x"),
    });
    close = server.close;
    const body = "b".repeat(2000);
    const res = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(res.status).toBe(413);
    const parsed = (await res.json()) as any;
    expect(parsed.error.code).toBe(-32600);
  });

  it("accepts a body exactly at the maxBodyBytes limit", async () => {
    // Build a JSON-RPC request whose serialized form is exactly 1024 bytes.
    const base = { jsonrpc: "2.0", id: 1, method: "tools/list", params: { pad: "" } };
    const baseLen = JSON.stringify(base).length;
    const pad = "p".repeat(1024 - baseLen);
    const payload = JSON.stringify({ ...base, params: { pad } });
    expect(payload.length).toBe(1024);

    const server = await startHttpServer({
      port: 0,
      maxBodyBytes: 1024,
      providerClientFactory: () => stubProvider("x"),
    });
    close = server.close;
    const res = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.id).toBe(1);
    expect(json.result.tools[0].name).toBe("enhance_prompt");
  });

  it("responds to OPTIONS /mcp with CORS preflight headers", async () => {
    const server = await startHttpServer({
      port: 0,
      providerClientFactory: () => stubProvider("x"),
    });
    close = server.close;
    const res = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: "OPTIONS",
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(res.headers.get("access-control-allow-headers")).toBe(
      "content-type, mcp-protocol-version",
    );
    expect(res.headers.get("access-control-max-age")).toBe("86400");
  });

  it("sets access-control-allow-origin on POST responses", async () => {
    const server = await startHttpServer({
      port: 0,
      providerClientFactory: () => stubProvider("```prompt\nx\n```"),
    });
    close = server.close;
    const res = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("HTTP transport — auth (PROMPTFORGE_MCP_TOKEN)", () => {
  it("returns 401 when authToken is configured and the request lacks Authorization", async () => {
    const server = await startHttpServer({
      port: 0,
      authToken: "s3cret",
      providerClientFactory: () => stubProvider("x"),
    });
    close = server.close;
    const res = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe(-32001);
  });

  it("returns 401 when Authorization carries the wrong token", async () => {
    const server = await startHttpServer({
      port: 0,
      authToken: "s3cret",
      providerClientFactory: () => stubProvider("x"),
    });
    close = server.close;
    const res = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer wrong" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 when Authorization carries the right token", async () => {
    const server = await startHttpServer({
      port: 0,
      authToken: "s3cret",
      providerClientFactory: () => stubProvider("```prompt\nx\n```"),
    });
    close = server.close;
    const res = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer s3cret" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.result.tools[0].name).toBe("enhance_prompt");
  });

  it("does NOT require auth for OPTIONS preflight (browsers can't send credentials in preflight)", async () => {
    const server = await startHttpServer({
      port: 0,
      authToken: "s3cret",
      providerClientFactory: () => stubProvider("x"),
    });
    close = server.close;
    const res = await fetch(`http://127.0.0.1:${server.port}/mcp`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
  });

  it("no authToken configured = no auth required (back-compat)", async () => {
    const server = await startHttpServer({
      port: 0,
      providerClientFactory: () => stubProvider("```prompt\nx\n```"),
    });
    close = server.close;
    const res = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(res.status).toBe(200);
  });
});

describe("HTTP transport — Streamable HTTP (SSE)", () => {
  it("POST with Accept: text/event-stream returns the response as a single SSE event", async () => {
    const server = await startHttpServer({
      port: 0,
      providerClientFactory: () => stubProvider("```prompt\nx\n```"),
    });
    close = server.close;
    const res = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    const text = await res.text();
    expect(text).toMatch(/^event: message\n/);
    expect(text).toContain("data: ");
    expect(text).toContain('"tools"');
    expect(text.endsWith("\n\n")).toBe(true);
  });

  it("POST without Accept defaults to application/json (back-compat)", async () => {
    const server = await startHttpServer({
      port: 0,
      providerClientFactory: () => stubProvider("```prompt\nx\n```"),
    });
    close = server.close;
    const res = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("GET /mcp with Accept: text/event-stream opens an SSE channel and emits a keep-alive", async () => {
    const server = await startHttpServer({
      port: 0,
      sseKeepAliveMs: 50,
      providerClientFactory: () => stubProvider("x"),
    });
    close = server.close;
    const controller = new AbortController();
    const res = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      headers: { accept: "text/event-stream" },
      signal: controller.signal,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    expect(res.headers.get("mcp-session-id")).toBeTruthy();
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    // First chunk should be either the initial keep-alive comment or the endpoint event
    expect(text.length).toBeGreaterThan(0);
    expect(text.includes(":") || text.includes("event:")).toBe(true);
    controller.abort();
    await reader.cancel().catch(() => {});
  });

  it("GET /mcp without Accept: text/event-stream returns 405", async () => {
    const server = await startHttpServer({
      port: 0,
      providerClientFactory: () => stubProvider("x"),
    });
    close = server.close;
    const res = await fetch(`http://127.0.0.1:${server.port}/mcp`);
    expect(res.status).toBe(405);
  });
});
