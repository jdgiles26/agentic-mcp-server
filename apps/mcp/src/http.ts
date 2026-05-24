import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { handleMcpRequest, type ProviderClientFactory } from "./server.js";

export type HttpServerOptions = {
  port?: number;
  host?: string;
  providerClientFactory?: ProviderClientFactory;
  maxBodyBytes?: number;
  corsOrigin?: string;
  authToken?: string;
  sseKeepAliveMs?: number;
};

export type HttpServerHandle = {
  port: number;
  close: () => Promise<void>;
};

const DEFAULT_MAX_BODY_BYTES = 262144; // 256 KiB
const DEFAULT_CORS_ORIGIN = "*";
const DEFAULT_SSE_KEEPALIVE_MS = 15000;

const writeSseEvent = (res: ServerResponse, event: string, data: string) => {
  res.write(`event: ${event}\n`);
  for (const line of data.split("\n")) res.write(`data: ${line}\n`);
  res.write("\n");
};

type ReadBodyResult = { ok: true; body: string } | { ok: false; reason: "too-large" };

const readBody = (req: IncomingMessage, maxBytes: number): Promise<ReadBodyResult> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    let exceeded = false;
    const finish = (result: ReadBodyResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    req.on("data", (c: Buffer) => {
      if (exceeded) return;
      total += c.length;
      if (total > maxBytes) {
        exceeded = true;
        finish({ ok: false, reason: "too-large" });
        // Don't keep buffering further chunks, but let the request drain
        // naturally so the response we write is delivered cleanly.
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (exceeded) return;
      finish({ ok: true, body: Buffer.concat(chunks).toString("utf8") });
    });
    req.on("close", () => {
      if (settled || exceeded) return;
      // Client hung up before we got 'end' and we never exceeded — treat as error.
      settled = true;
      reject(new Error("client closed connection"));
    });
    req.on("error", (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });

const send = (
  res: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
) => {
  res.writeHead(status, { "content-type": "application/json", ...extraHeaders });
  res.end(JSON.stringify(body));
};

export const startHttpServer = async (
  options: HttpServerOptions = {},
): Promise<HttpServerHandle> => {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const corsOrigin = options.corsOrigin ?? DEFAULT_CORS_ORIGIN;
  const corsHeaders: Record<string, string> = {
    "access-control-allow-origin": corsOrigin,
  };

  const server = createServer(async (req, res) => {
    if (!req.url || !req.url.startsWith("/mcp")) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": corsOrigin,
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type, mcp-protocol-version",
        "access-control-max-age": "86400",
      });
      res.end();
      return;
    }
    if (req.method === "GET") {
      const accept = req.headers.accept ?? "";
      if (!accept.includes("text/event-stream")) {
        res.writeHead(405, corsHeaders);
        res.end();
        return;
      }
      if (options.authToken) {
        const got = req.headers.authorization ?? "";
        if (got !== `Bearer ${options.authToken}`) {
          send(
            res,
            401,
            { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } },
            corsHeaders,
          );
          return;
        }
      }
      const sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "mcp-session-id": sessionId,
        ...corsHeaders,
      });
      // Initial keep-alive comment so clients see the channel open immediately.
      res.write(`: open ${sessionId}\n\n`);
      const keepAlive = setInterval(() => {
        if (res.writableEnded) return;
        res.write(": keep-alive\n\n");
      }, options.sseKeepAliveMs ?? DEFAULT_SSE_KEEPALIVE_MS);
      req.on("close", () => clearInterval(keepAlive));
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405, corsHeaders);
      res.end();
      return;
    }
    if (options.authToken) {
      const got = req.headers.authorization ?? "";
      const expected = `Bearer ${options.authToken}`;
      if (got !== expected) {
        send(
          res,
          401,
          {
            jsonrpc: "2.0",
            id: null,
            error: { code: -32001, message: "Unauthorized" },
          },
          corsHeaders,
        );
        return;
      }
    }
    let body: string;
    try {
      const read = await readBody(req, maxBodyBytes);
      if (!read.ok) {
        send(
          res,
          413,
          {
            jsonrpc: "2.0",
            id: null,
            error: { code: -32600, message: "Request body too large" },
          },
          corsHeaders,
        );
        return;
      }
      body = read.body;
    } catch {
      send(
        res,
        400,
        { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
        corsHeaders,
      );
      return;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      send(
        res,
        400,
        { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
        corsHeaders,
      );
      return;
    }
    const result = await handleMcpRequest(payload, {
      ...(options.providerClientFactory
        ? { providerClientFactory: options.providerClientFactory }
        : {}),
    });
    if (result === undefined) {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }
    const wantsSse = (req.headers.accept ?? "").includes("text/event-stream");
    if (wantsSse) {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        ...corsHeaders,
      });
      writeSseEvent(res, "message", JSON.stringify(result));
      res.end();
      return;
    }
    send(res, 200, result, corsHeaders);
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
  const host = process.env.HOST ?? "127.0.0.1";
  const authToken = process.env.PROMPTFORGE_MCP_TOKEN;
  startHttpServer({ port, host, ...(authToken ? { authToken } : {}) }).then((h) => {
    const auth = authToken ? " (auth required)" : "";
    process.stderr.write(`promptforge mcp http listening on http://${host}:${h.port}/mcp${auth}\n`);
  });
}
