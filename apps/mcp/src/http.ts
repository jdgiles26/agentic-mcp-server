import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { handleMcpRequest, type ProviderClientFactory } from "./server.js";

export type HttpServerOptions = {
  port?: number;
  host?: string;
  providerClientFactory?: ProviderClientFactory;
};

export type HttpServerHandle = {
  port: number;
  close: () => Promise<void>;
};

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

export const startHttpServer = async (
  options: HttpServerOptions = {},
): Promise<HttpServerHandle> => {
  const server = createServer(async (req, res) => {
    if (!req.url || !req.url.startsWith("/mcp")) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return;
    }
    let payload: unknown;
    try {
      const raw = await readBody(req);
      payload = JSON.parse(raw);
    } catch {
      send(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      return;
    }
    const result = await handleMcpRequest(payload, {
      ...(options.providerClientFactory ? { providerClientFactory: options.providerClientFactory } : {}),
    });
    if (result === undefined) {
      res.writeHead(204);
      res.end();
      return;
    }
    send(res, 200, result);
  });

  await new Promise<void>((resolve) => {
    server.listen(options.port ?? 0, options.host ?? "127.0.0.1", () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
};

import { pathToFileURL as __pathToFileURL } from "node:url";
if (import.meta.url === __pathToFileURL(process.argv[1] ?? "").href) {
  const port = Number(process.env.PORT ?? 8787);
  startHttpServer({ port }).then((h) => {
    process.stderr.write(`promptforge mcp http listening on http://127.0.0.1:${h.port}/mcp\n`);
  });
}
