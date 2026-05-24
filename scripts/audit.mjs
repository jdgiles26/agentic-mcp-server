#!/usr/bin/env node
// Drift detector. Re-scans code, re-reads docs, emits DRIFT.md.
// Citations are file:line so claims are checkable.
// Severity: HIGH (broken claim or wiring), MED (stale fact), LOW (nit).

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const findings = [];

const add = (severity, area, message, evidence) => {
  findings.push({ severity, area, message, evidence });
};

const readLines = (path) => readFileSync(path, "utf8").split("\n");

const walk = (dir, pred) => {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === ".next" || name === ".git") continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p, pred));
    else if (pred(p)) out.push(p);
  }
  return out;
};

// --- 1. Inventory workspace packages ----------------------------------------

const workspaces = [];
for (const sub of ["packages", "apps"]) {
  for (const name of readdirSync(join(ROOT, sub))) {
    const pj = join(ROOT, sub, name, "package.json");
    if (existsSync(pj)) {
      const pkg = JSON.parse(readFileSync(pj, "utf8"));
      workspaces.push({
        path: join(ROOT, sub, name),
        rel: `${sub}/${name}`,
        name: pkg.name,
        deps: pkg.dependencies ?? {},
        devDeps: pkg.devDependencies ?? {},
        scripts: pkg.scripts ?? {},
      });
    }
  }
}

// --- 2. Imports per workspace (real) ----------------------------------------

const importSitesFor = (pkgPath) => {
  const files = walk(
    join(pkgPath, "src"),
    (p) =>
      (p.endsWith(".ts") || p.endsWith(".tsx")) &&
      !p.endsWith(".test.ts") &&
      !p.endsWith(".test.tsx"),
  );
  const imported = new Set();
  for (const f of files) {
    const lines = readLines(f);
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/from\s+["']([^"'.][^"']*)["']/);
      if (m)
        imported.add(
          m[1].startsWith("@") ? m[1].split("/").slice(0, 2).join("/") : m[1].split("/")[0],
        );
    }
  }
  return imported;
};

// --- 3. Unused / undeclared deps --------------------------------------------

const ALWAYS_USED = new Set([
  "typescript",
  "vitest",
  "tsx",
  "@types/node",
  "@types/react",
  "@types/react-dom",
  "happy-dom",
  "@playwright/test",
  "@testing-library/react",
  "@testing-library/dom",
  "@testing-library/jest-dom",
  "@biomejs/biome",
  "next",
  "react-dom",
]);

const ESC = String.fromCharCode(27); // ESC, the lead byte of ANSI escapes
const ANSI_RE = new RegExp(`${ESC}\\[[0-9;]*m`, "g");
const stripAnsi = (s) => s.replace(ANSI_RE, "");

for (const ws of workspaces) {
  if (ws.rel === "apps/web") continue; // Next.js scans files; skip — handled below
  const imported = importSitesFor(ws.path);
  for (const dep of Object.keys(ws.deps)) {
    if (ALWAYS_USED.has(dep)) continue;
    if (!imported.has(dep) && !imported.has(dep.startsWith("@") ? dep : dep.split("/")[0])) {
      add(
        "MED",
        "deps",
        `${ws.name} declares "${dep}" in dependencies but no src/* file imports it`,
        `${ws.rel}/package.json`,
      );
    }
  }
}

// apps/web special-case: src is broader (app/, components/)
{
  const ws = workspaces.find((w) => w.rel === "apps/web");
  if (ws) {
    const files = walk(
      join(ws.path, "src"),
      (p) =>
        (p.endsWith(".ts") || p.endsWith(".tsx")) &&
        !p.endsWith(".test.ts") &&
        !p.endsWith(".test.tsx"),
    );
    const imported = new Set();
    for (const f of files) {
      for (const line of readLines(f)) {
        const m = line.match(/from\s+["']([^"'.][^"']*)["']/);
        if (m)
          imported.add(
            m[1].startsWith("@") ? m[1].split("/").slice(0, 2).join("/") : m[1].split("/")[0],
          );
      }
    }
    for (const dep of Object.keys(ws.deps)) {
      if (ALWAYS_USED.has(dep)) continue;
      if (!imported.has(dep)) {
        add(
          "MED",
          "deps",
          `${ws.name} declares "${dep}" in dependencies but no apps/web/src/* file imports it`,
          `${ws.rel}/package.json`,
        );
      }
    }
    // Next config transpilePackages must list every workspace dep that's actually used
    const nextCfg = readFileSync(join(ws.path, "next.config.mjs"), "utf8");
    for (const dep of Object.keys(ws.deps).filter((d) => d.startsWith("@prompt-forge/"))) {
      const declared = nextCfg.includes(`"${dep}"`);
      const used = imported.has(dep);
      if (declared && !used) {
        add(
          "LOW",
          "deps",
          `next.config.mjs lists "${dep}" in transpilePackages but it is unused`,
          `${ws.rel}/next.config.mjs`,
        );
      }
    }
  }
}

// --- 4. Catalog count vs README claim --------------------------------------

const catalogSrc = readFileSync(join(ROOT, "packages/patterns/src/catalog.ts"), "utf8");
const slugMatches = [...catalogSrc.matchAll(/^\s+slug:\s*"([^"]+)"/gm)];
const catalogCount = slugMatches.length;
const readmeSrc = readFileSync(join(ROOT, "README.md"), "utf8");

for (const claim of [
  { re: /catalog of (\d+)/i, label: "catalog of N" },
  { re: /(\d+)\s+catalog patterns/i, label: "N catalog patterns" },
  { re: /(\d+)-entry catalog/i, label: "N-entry catalog" },
]) {
  const m = readmeSrc.match(claim.re);
  if (m) {
    const claimed = Number(m[1]);
    if (claimed !== catalogCount) {
      add(
        "HIGH",
        "patterns",
        `README claims "${claim.label} = ${claimed}" but PATTERN_CATALOG has ${catalogCount} entries`,
        `README.md vs packages/patterns/src/catalog.ts`,
      );
    }
  }
}

// docs/patterns.md count claim
const patternsDoc = readFileSync(join(ROOT, "docs/patterns.md"), "utf8");
{
  const m = patternsDoc.match(/(\d+)\s+patterns/i);
  if (m && Number(m[1]) !== catalogCount) {
    add(
      "MED",
      "patterns",
      `docs/patterns.md claims "${m[1]} patterns" but catalog has ${catalogCount}`,
      "docs/patterns.md:3",
    );
  }
}

// --- 5. Test count claims ---------------------------------------------------

let testTotals = null;
try {
  const out = execSync(`cd "${ROOT}" && pnpm -r --workspace-concurrency=1 test 2>&1`, {
    encoding: "utf8",
  });
  const clean = stripAnsi(out);
  const matches = [...clean.matchAll(/Tests\s+(\d+)\s+passed/g)];
  testTotals = matches.reduce((a, m) => a + Number(m[1]), 0);
} catch {
  // fall through — leave null
}

if (testTotals !== null) {
  const m = readmeSrc.match(/(\d+)\s+hermetic tests/i);
  if (m && Number(m[1]) !== testTotals) {
    add(
      "MED",
      "tests",
      `README claims "${m[1]} hermetic tests" but actual vitest count is ${testTotals}`,
      "README.md:19",
    );
  }
}

// --- 6. Script-name references in docs that don't exist in any package -----

const allScripts = new Set();
for (const ws of workspaces)
  for (const s of Object.keys(ws.scripts)) allScripts.add(`${ws.name}:${s}`);
for (const s of Object.keys(
  JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts ?? {},
)) {
  allScripts.add(`root:${s}`);
}

const docFiles = ["docs/development.md", "docs/tdd-strategy.md", "docs/packages.md"];
for (const doc of docFiles) {
  const lines = readLines(join(ROOT, doc));
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // pnpm --filter @x test:watch  → pkg=@x script=test:watch
    const m1 = line.match(
      /pnpm\s+--filter\s+(@?[a-z0-9/-]+)\s+(test[:a-z]*|format|build|dev|typecheck)\b/,
    );
    if (m1) {
      const [, pkg, script] = m1;
      if (!allScripts.has(`${pkg}:${script}`)) {
        add(
          "LOW",
          "docs",
          `${doc}:${i + 1} references "pnpm --filter ${pkg} ${script}" but that script does not exist`,
          `${doc}:${i + 1}`,
        );
      }
    }
    // pnpm dev / pnpm format / pnpm test  → root script
    const m2 = line.match(/^[^#]*\bpnpm\s+(dev|format|build|test|typecheck|lint)\b(?!\s*--filter)/);
    if (m2) {
      const script = m2[1];
      if (!allScripts.has(`root:${script}`)) {
        add(
          "LOW",
          "docs",
          `${doc}:${i + 1} suggests "pnpm ${script}" but the root package.json has no "${script}" script`,
          `${doc}:${i + 1}`,
        );
      }
    }
  }
}

// --- 7. Provider list consistency ------------------------------------------

const providersDoc = readFileSync(join(ROOT, "docs/providers.md"), "utf8");
const factorySrc = readFileSync(join(ROOT, "packages/providers/src/factory.ts"), "utf8");
const baseUrlsMatch = factorySrc.match(/DEFAULT_BASE_URLS[^{]*\{([^}]+)\}/s);
const codeKinds = baseUrlsMatch
  ? [...baseUrlsMatch[1].matchAll(/^\s*(\w+):/gm)].map((m) => m[1])
  : [];
for (const kind of codeKinds) {
  if (!new RegExp(`\\b${kind}\\b`).test(providersDoc)) {
    add(
      "MED",
      "providers",
      `Provider kind "${kind}" is in DEFAULT_BASE_URLS but not mentioned in docs/providers.md`,
      `packages/providers/src/factory.ts → docs/providers.md`,
    );
  }
}

// --- 8. apps/mcp documentation coverage ------------------------------------

const packagesDoc = readFileSync(join(ROOT, "docs/packages.md"), "utf8");
if (!/apps\/mcp|@prompt-forge\/mcp/.test(packagesDoc)) {
  add(
    "HIGH",
    "docs",
    "docs/packages.md does not document apps/mcp (the MCP server) at all — the package exists in code but is invisible to anyone reading the docs",
    "docs/packages.md",
  );
}

const archDoc = readFileSync(join(ROOT, "docs/architecture.md"), "utf8");
if (!/\bmcp\b/i.test(archDoc)) {
  add(
    "HIGH",
    "docs",
    "docs/architecture.md sequence diagram only covers the web flow; the MCP transports (stdio + HTTP + SSE) are missing entirely",
    "docs/architecture.md:5-34",
  );
}

// --- 9. Dependency graph claim vs code -------------------------------------

if (/web\[apps\/web\]\s*-->\s*patterns/.test(archDoc)) {
  // is patterns actually imported by any web src file?
  const webFiles = walk(
    join(ROOT, "apps/web/src"),
    (p) =>
      (p.endsWith(".ts") || p.endsWith(".tsx")) &&
      !p.endsWith(".test.ts") &&
      !p.endsWith(".test.tsx"),
  );
  const importsPatterns = webFiles.some((f) =>
    readFileSync(f, "utf8").includes("@prompt-forge/patterns"),
  );
  if (!importsPatterns) {
    add(
      "HIGH",
      "docs",
      'docs/architecture.md dependency graph shows web → patterns, but no apps/web/src/*.ts(x) file imports "@prompt-forge/patterns"',
      "docs/architecture.md:40-44",
    );
  }
}

// --- 10. Logger wiring -----------------------------------------------------

const loggerCallsites = walk(
  join(ROOT, "packages"),
  (p) =>
    (p.endsWith(".ts") || p.endsWith(".tsx")) &&
    !p.endsWith(".test.ts") &&
    !p.endsWith(".test.tsx"),
)
  .concat(
    walk(
      join(ROOT, "apps"),
      (p) =>
        (p.endsWith(".ts") || p.endsWith(".tsx")) &&
        !p.endsWith(".test.ts") &&
        !p.endsWith(".test.tsx"),
    ),
  )
  .filter((p) => !p.endsWith("logger.ts"))
  .filter((p) => readFileSync(p, "utf8").includes("createLogger("));

if (loggerCallsites.length === 0) {
  add(
    "MED",
    "logger",
    "docs/development.md:51 says \"Use createLogger('scope-name'). Never console.log directly outside the logger.\" — but no production code actually calls createLogger() anywhere",
    "packages/core/src/logger.ts is exported but unwired",
  );
}

// --- 11. Tailwind / Zustand claims -----------------------------------------

const tddDoc = readFileSync(join(ROOT, "docs/tdd-strategy.md"), "utf8");
const hasTailwindCode = walk(
  ROOT,
  (p) => p.endsWith(".ts") || p.endsWith(".tsx") || p.endsWith(".css") || p.endsWith(".mjs"),
).some((p) => /tailwind|@tailwind/i.test(readFileSync(p, "utf8")));
const hasZustand = walk(
  ROOT,
  (p) => p.endsWith(".ts") || p.endsWith(".tsx") || p.endsWith(".json"),
).some((p) => (p.includes("/node_modules/") ? false : /zustand/i.test(readFileSync(p, "utf8"))));

if (/Tailwind/.test(tddDoc) && !hasTailwindCode) {
  add(
    "LOW",
    "stack",
    "docs/tdd-strategy.md lists Tailwind v4 as a skipped concern but the repo has no Tailwind code",
    "docs/tdd-strategy.md:24",
  );
}
if (/Zustand/.test(tddDoc) && !hasZustand) {
  add(
    "LOW",
    "stack",
    "docs/tdd-strategy.md lists Zustand internals as a skipped concern but the repo has no Zustand dependency or usage",
    "docs/tdd-strategy.md:26",
  );
}

// --- 12. pnpm version pin --------------------------------------------------

const devDoc = readFileSync(join(ROOT, "docs/development.md"), "utf8");
const pinnedM = devDoc.match(/pnpm\s*\|\s*(\d+\.\d+\.\d+)/);
const rootPj = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const rootPm = rootPj.packageManager?.match(/pnpm@(\S+)/)?.[1];
if (pinnedM && rootPm && pinnedM[1] !== rootPm) {
  add(
    "LOW",
    "tooling",
    `docs/development.md pins pnpm ${pinnedM[1]} but root package.json declares pnpm@${rootPm}`,
    "docs/development.md:8 vs package.json:15",
  );
}

// --- 13. E2E claim --------------------------------------------------------

if (/real local Ollama instance/i.test(tddDoc)) {
  const e2e = readFileSync(join(ROOT, "apps/web/e2e/enhance.spec.ts"), "utf8");
  if (e2e.includes("page.route") && e2e.includes("/api/enhance")) {
    add(
      "MED",
      "tests",
      "docs/tdd-strategy.md:18 says E2E runs against a real local Ollama, but apps/web/e2e/enhance.spec.ts mocks /api/enhance via page.route — no real LLM is contacted",
      "docs/tdd-strategy.md:18 vs apps/web/e2e/enhance.spec.ts:38-50",
    );
  }
}

// --- Emit -----------------------------------------------------------------

const now = new Date().toISOString();
let sha = "(no git)";
try {
  sha = execSync(`cd "${ROOT}" && git rev-parse --short HEAD`, { encoding: "utf8" }).trim();
} catch {}

findings.sort((a, b) => {
  const order = { HIGH: 0, MED: 1, LOW: 2 };
  if (order[a.severity] !== order[b.severity]) return order[a.severity] - order[b.severity];
  return a.area.localeCompare(b.area);
});

const groups = { HIGH: [], MED: [], LOW: [] };
for (const f of findings) groups[f.severity].push(f);

let md = `# DRIFT.md\n\n`;
md += `Generated by \`scripts/audit.mjs\`. Re-run with \`/audit\` or it fires automatically on every \`git commit\`.\n\n`;
md += `**Generated**: ${now}  \n`;
md += `**Commit**: ${sha}  \n`;
md += `**Findings**: ${groups.HIGH.length} HIGH, ${groups.MED.length} MED, ${groups.LOW.length} LOW\n\n`;
md += `Severity: HIGH = doc actively contradicts shipped behavior or wiring is broken. MED = stale fact that will mislead a reader. LOW = nit.\n\n`;

for (const sev of ["HIGH", "MED", "LOW"]) {
  if (groups[sev].length === 0) continue;
  md += `## ${sev}\n\n`;
  for (let i = 0; i < groups[sev].length; i++) {
    const f = groups[sev][i];
    md += `### ${sev}-${String(i + 1).padStart(2, "0")} · ${f.area}\n\n`;
    md += `${f.message}\n\n`;
    md += `**Evidence**: \`${f.evidence}\`\n\n`;
  }
}

md += `---\n\n`;
md += `## What this script checks\n\n`;
md += `1. Declared deps in package.json vs actual imports under src/\n`;
md += `2. Catalog size claim vs \`grep slug: packages/patterns/src/catalog.ts\`\n`;
md += `3. Test-count claims in README vs live \`pnpm -r test\` output\n`;
md += `4. Doc references to \`pnpm <script>\` vs the actual scripts in every package.json\n`;
md += `5. Every \`ProviderKind\` in code appears in docs/providers.md\n`;
md += `6. \`apps/mcp\` is mentioned in docs/packages.md and docs/architecture.md\n`;
md += `7. Dependency-graph claims in docs/architecture.md match real imports\n`;
md += `8. \`createLogger\` is wired into production code if docs say it should be\n`;
md += `9. Stack components named in docs/tdd-strategy.md actually exist in the repo\n`;
md += `10. pnpm version pin in docs vs root package.json\n`;
md += `11. E2E claim "real local Ollama" vs whether the spec mocks /api/enhance\n\n`;
md += `Things this script does NOT check: prose accuracy of directive text, mermaid diagram correctness,\n`;
md += `whether tests actually test the right thing, runtime behavior of the live system.\n`;

writeFileSync(join(ROOT, "DRIFT.md"), md);
console.error(
  `DRIFT.md written — ${findings.length} findings (${groups.HIGH.length}H/${groups.MED.length}M/${groups.LOW.length}L)`,
);
