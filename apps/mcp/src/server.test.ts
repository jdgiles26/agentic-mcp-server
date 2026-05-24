import { describe, expect, it } from "vitest";
import { ok, type ChatRequest } from "@prompt-forge/core";
import type { ProviderClient } from "@prompt-forge/providers";
import { PATTERN_CATALOG } from "@prompt-forge/patterns";
import { handleMcpRequest, type ProviderClientFactory } from "./server.js";

const stubProvider = (content: string): ProviderClient => ({
  async chat(_req: ChatRequest) {
    return ok({ content });
  },
});

const fixedFactory =
  (content: string): ProviderClientFactory =>
  () =>
    stubProvider(content);

describe("MCP server handler", () => {
  it("responds to initialize", async () => {
    const r = await handleMcpRequest(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } },
      { providerClientFactory: fixedFactory("```prompt\nx\n```") },
    );
    expect(r?.id).toBe(1);
    expect(r?.result).toBeDefined();
    expect((r?.result as any).serverInfo.name).toBe("promptforge");
  });

  it("lists the enhance_prompt tool", async () => {
    const r = await handleMcpRequest(
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      { providerClientFactory: fixedFactory("```prompt\nx\n```") },
    );
    const tools = (r?.result as any).tools as Array<{ name: string }>;
    expect(tools.map((t) => t.name)).toContain("enhance_prompt");
  });

  it("invokes enhance_prompt with a valid provider config", async () => {
    const r = await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "enhance_prompt",
          arguments: {
            rawPrompt: "build a settings page for provider configs",
            provider: {
              kind: "ollama",
              baseUrl: "http://localhost:11434",
              model: "llama3.1:8b",
            },
          },
        },
      },
      { providerClientFactory: fixedFactory("```prompt\nrewritten output\n```") },
    );
    expect(r?.error).toBeUndefined();
    const content = (r?.result as any).content as Array<{ type: string; text: string }>;
    expect(content[0]?.type).toBe("text");
    expect(content[0]?.text).toContain("rewritten output");
  });

  it("returns an error for an invalid provider config", async () => {
    const r = await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "enhance_prompt",
          arguments: {
            rawPrompt: "build a thing",
            provider: { kind: "openai", baseUrl: "https://x", model: "m" },
          },
        },
      },
      { providerClientFactory: fixedFactory("```prompt\nx\n```") },
    );
    expect(r?.error).toBeDefined();
    expect(r?.error?.code).toBeLessThan(0);
  });

  it("returns MethodNotFound for unknown methods", async () => {
    const r = await handleMcpRequest(
      { jsonrpc: "2.0", id: 5, method: "nope", params: {} },
      { providerClientFactory: fixedFactory("```prompt\nx\n```") },
    );
    expect(r?.error?.code).toBe(-32601);
  });

  it("notifications (no id) return undefined and do not throw", async () => {
    const r = await handleMcpRequest(
      { jsonrpc: "2.0", method: "notifications/initialized", params: {} },
      { providerClientFactory: fixedFactory("```prompt\nx\n```") },
    );
    expect(r).toBeUndefined();
  });

  it("rejects malformed jsonrpc payloads", async () => {
    const r = await handleMcpRequest(
      { id: 7, method: "tools/list" } as any,
      { providerClientFactory: fixedFactory("```prompt\nx\n```") },
    );
    expect(r?.error?.code).toBe(-32600);
  });

  it("advertises both tools and resources capabilities on initialize", async () => {
    const r = await handleMcpRequest(
      { jsonrpc: "2.0", id: 10, method: "initialize", params: { protocolVersion: "2024-11-05" } },
      { providerClientFactory: fixedFactory("x") },
    );
    const caps = (r?.result as any).capabilities;
    expect(caps).toBeDefined();
    expect(caps.tools).toBeDefined();
    expect(caps.resources).toBeDefined();
  });

  it("resources/list returns one resource per catalog entry", async () => {
    const r = await handleMcpRequest(
      { jsonrpc: "2.0", id: 11, method: "resources/list", params: {} },
      { providerClientFactory: fixedFactory("x") },
    );
    expect(r?.error).toBeUndefined();
    const resources = (r?.result as any).resources as Array<{
      uri: string;
      name: string;
      mimeType: string;
      description: string;
    }>;
    expect(resources).toHaveLength(PATTERN_CATALOG.length);
    for (const res of resources) {
      expect(res.uri.startsWith("promptforge://patterns/")).toBe(true);
      expect(res.mimeType).toBe("text/markdown");
      expect(res.description.length).toBeGreaterThan(0);
      // description is first directive line, leading "## " stripped
      expect(res.description.startsWith("## ")).toBe(false);
      expect(res.description.includes("\n")).toBe(false);
    }
    const slugs = resources.map((r) => r.uri.replace("promptforge://patterns/", ""));
    for (const p of PATTERN_CATALOG) {
      expect(slugs).toContain(p.slug);
    }
  });

  it("resources/read returns the directive for a valid catalog URI", async () => {
    const sample = PATTERN_CATALOG[0]!;
    const r = await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 12,
        method: "resources/read",
        params: { uri: `promptforge://patterns/${sample.slug}` },
      },
      { providerClientFactory: fixedFactory("x") },
    );
    expect(r?.error).toBeUndefined();
    const contents = (r?.result as any).contents as Array<{
      uri: string;
      mimeType: string;
      text: string;
    }>;
    expect(contents).toHaveLength(1);
    expect(contents[0]!.uri).toBe(`promptforge://patterns/${sample.slug}`);
    expect(contents[0]!.mimeType).toBe("text/markdown");
    expect(contents[0]!.text).toContain(sample.directive);
    expect(contents[0]!.text).toContain(sample.sourceUrl);
  });

  it("resources/read returns -32602 for an unknown slug", async () => {
    const r = await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 13,
        method: "resources/read",
        params: { uri: "promptforge://patterns/does-not-exist" },
      },
      { providerClientFactory: fixedFactory("x") },
    );
    expect(r?.error?.code).toBe(-32602);
    expect(r?.error?.message).toContain("promptforge://patterns/does-not-exist");
  });

  it("resources/read rejects non-promptforge schemes with -32602", async () => {
    const r = await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 14,
        method: "resources/read",
        params: { uri: "http://evil/x" },
      },
      { providerClientFactory: fixedFactory("x") },
    );
    expect(r?.error?.code).toBe(-32602);
    expect(r?.error?.message).toContain("http://evil/x");
  });
});
