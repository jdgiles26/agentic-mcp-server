import { describe, expect, it } from "vitest";
import { ok, type ChatRequest } from "@prompt-forge/core";
import type { ProviderClient } from "@prompt-forge/providers";
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
});
