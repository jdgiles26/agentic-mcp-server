import type { Readable, Writable } from "node:stream";
import { createInterface } from "node:readline";
import { handleMcpRequest, type ProviderClientFactory, type JsonRpcResponse } from "./server.js";

export type StdioOptions = {
  stdin?: Readable;
  stdout?: Writable;
  providerClientFactory?: ProviderClientFactory;
};

export const runStdioServer = async (opts: StdioOptions = {}): Promise<void> => {
  const stdin = opts.stdin ?? process.stdin;
  const stdout = opts.stdout ?? process.stdout;
  const rl = createInterface({ input: stdin, crlfDelay: Infinity });

  const writeLine = (resp: JsonRpcResponse) => {
    stdout.write(JSON.stringify(resp) + "\n");
  };

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let payload: unknown;
    try {
      payload = JSON.parse(trimmed);
    } catch {
      writeLine({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      });
      continue;
    }
    const result = await handleMcpRequest(payload, {
      ...(opts.providerClientFactory ? { providerClientFactory: opts.providerClientFactory } : {}),
    });
    if (result !== undefined) writeLine(result);
  }
};

import { pathToFileURL as __pathToFileURL } from "node:url";
if (import.meta.url === __pathToFileURL(process.argv[1] ?? "").href) {
  runStdioServer().catch((e) => {
    process.stderr.write(`stdio server error: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  });
}
