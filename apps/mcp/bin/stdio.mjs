#!/usr/bin/env node
import { runStdioServer } from "../dist/stdio.js";
runStdioServer().catch((e) => {
  process.stderr.write(`stdio server error: ${e?.message ?? e}\n`);
  process.exit(1);
});
