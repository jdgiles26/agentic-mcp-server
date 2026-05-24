#!/usr/bin/env node
// Spawn tsx against the TS entrypoint so the shim works without a prior build step.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tsxBin = require.resolve("tsx/package.json").replace(/package\.json$/, "dist/cli.mjs");
const srcPath = fileURLToPath(new URL("../src/stdio.ts", import.meta.url));

const child = spawn(process.execPath, [tsxBin, srcPath, ...process.argv.slice(2)], {
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
