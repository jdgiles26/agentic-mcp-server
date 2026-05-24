# Development guide

## Prerequisites

| Tool      | Version            |
| --------- | ------------------ |
| Node.js   | 20.11+             |
| pnpm      | 9.12.0             |
| Make      | any (optional)     |

For local LLM development, install at least one of: Ollama, Lemonade.app, or llama.cpp's `llama-server`.

## First-time bootstrap

```bash
git clone <repo>
cd prompt-forge
pnpm install
pnpm typecheck
pnpm test
pnpm dev          # http://localhost:3000
```

Open `/settings`, configure a provider, click **Test connection**, then go to `/` and submit a prompt.

## Recommended TDD development order

This is the order we developed the project in. It is the same order recommended for anyone reading this from scratch. Each step has its tests written first; each step's tests must pass before the next begins.

- [x] **Step 1 — `@prompt-forge/core`.** Write `result.test.ts`, `types.test.ts`, `logger.test.ts`. Implement until green.
- [x] **Step 2 — `@prompt-forge/patterns`.** Write `catalog.test.ts` (invariants only — no implementations needed yet). Then write `classify.test.ts` and `select.test.ts`. Build the catalog and the two pure functions until green.
- [x] **Step 3 — `@prompt-forge/providers`.** Write `http.test.ts` first (so the timeout/error model is locked in). Then `openai-compatible.test.ts`, `ollama.test.ts`, `anthropic.test.ts`, `factory.test.ts`. Use `scriptedFetch` as the test fixture — never the real `fetch`.
- [x] **Step 4 — `@prompt-forge/config`.** Write `store.test.ts`. Pure helpers + memory store + localStorage store, all in one test file because they share the schema.
- [x] **Step 5 — `@prompt-forge/enhancer`.** Write `prompt-builder.test.ts` for the pure builders, then `enhance.test.ts` using a scripted `ProviderClient` (a real implementation of the type, not a mock).
- [x] **Step 6 — `apps/web`.** Write `app/api/enhance/route.test.ts` first — that's the contract the UI talks to. Then `components/enhance-form.test.tsx`. Implement the routes and components until green.
- [x] **Step 7 — Manual integration.** Spin up Ollama locally, configure it via `/settings`, submit a prompt, verify the rewrite is sane. (The hermetic test suite cannot prove this for you.)

## Project conventions

### Code style

- Strict TypeScript everywhere — `noUncheckedIndexedAccess` is on, so `arr[0]` is `T | undefined` and you have to handle it.
- `type` aliases over `interface` unless declaration merging is required.
- Discriminated unions for variants. `Result<T, E>` is the canonical example.
- Named exports only — Next.js pages/layouts and route handlers are the only place a default export appears (Next.js requires it).
- Functional patterns: pure functions, immutable data structures, no global mutable state.
- Errors flow as `Result`; throw only at IO boundaries where a Result wrapper would obscure the call site, then immediately wrap with `fromThrowable`.

### Logging

Use `createLogger('scope-name')`. Never `console.log` directly outside the logger. Secrets are redacted automatically.

### Commits

Conventional Commits. Subject under 72 chars.

```
feat(patterns): add Tree-of-Thought to the catalog
fix(providers): map 408 to PROVIDER_TIMEOUT, not PROVIDER_BAD_RESPONSE
refactor(enhancer): extract reflection messages into prompt-builder
test(web): cover empty-form submit gating
docs(providers): document Lemonade default Bearer token
```

### Branches

- `feat/<short-description>` — new functionality
- `fix/<issue-id>-<description>` — bug fixes
- `refactor/<area>-<description>` — internal restructuring
- `docs/<area>` — docs-only changes

### PRs

The body must answer three questions, in this order:

1. **What changed.** A bullet list, no prose.
2. **Why.** Motivating problem or constraint.
3. **How to test.** Exact commands the reviewer can paste.

No AI-generated walls of text. The review surface should fit on one screen.

## Useful commands

```bash
# Run a single test file
pnpm --filter @prompt-forge/enhancer exec vitest run src/enhance.test.ts

# Watch one package's tests
pnpm --filter @prompt-forge/enhancer test:watch

# Build everything in the dependency-correct order
pnpm build

# Format the whole repo (Biome)
pnpm format

# Wipe all caches
make clean
```

## Adding a new feature

The repo's grain rewards small, vertical changes. A typical feature lands as four sequential commits:

1. `test(<package>):` failing test that encodes the new behavior.
2. `feat(<package>):` implementation that turns the test green.
3. `feat(web):` UI surface, if any.
4. `docs(<package or area>):` updated package or pattern docs.

Each commit should be independently reviewable.
