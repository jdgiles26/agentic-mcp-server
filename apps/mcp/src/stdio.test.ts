import { describe, expect, it } from "vitest";
import { Readable, Writable } from "node:stream";
import { ok } from "@prompt-forge/core";
import type { ProviderClient } from "@prompt-forge/providers";
import { runStdioServer } from "./stdio.js";

const stubProvider = (content: string): ProviderClient => ({
  async chat() {
    return ok({ content });
  },
});

const collectOutput = () => {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString("utf8"));
      cb();
    },
  });
  return { stream, chunks };
};

describe("stdio transport", () => {
  it("reads NDJSON requests and writes NDJSON responses", async () => {
    const input = Readable.from([
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) + "\n",
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "initialize", params: {} }) + "\n",
    ]);
    const out = collectOutput();
    await runStdioServer({
      stdin: input,
      stdout: out.stream,
      providerClientFactory: () => stubProvider("```prompt\nx\n```"),
    });
    const lines = out.chunks.join("").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0].id).toBe(1);
    expect(lines[0].result.tools[0].name).toBe("enhance_prompt");
    expect(lines[1].id).toBe(2);
    expect(lines[1].result.serverInfo.name).toBe("promptforge");
  });

  it("ignores notifications (no id) without writing a response", async () => {
    const input = Readable.from([
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n",
      JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list", params: {} }) + "\n",
    ]);
    const out = collectOutput();
    await runStdioServer({
      stdin: input,
      stdout: out.stream,
      providerClientFactory: () => stubProvider("x"),
    });
    const lines = out.chunks.join("").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    expect(lines).toHaveLength(1);
    expect(lines[0].id).toBe(9);
  });

  it("writes a parse-error response for invalid JSON line", async () => {
    const input = Readable.from(["{not json}\n"]);
    const out = collectOutput();
    await runStdioServer({
      stdin: input,
      stdout: out.stream,
      providerClientFactory: () => stubProvider("x"),
    });
    const lines = out.chunks.join("").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    expect(lines[0].error.code).toBe(-32700);
  });
});
