#!/usr/bin/env node
import { startHttpServer } from "../dist/http.js";
const port = Number(process.env.PORT ?? 8787);
startHttpServer({ port }).then((h) => {
  process.stderr.write(`promptforge mcp http listening on http://127.0.0.1:${h.port}/mcp\n`);
});
