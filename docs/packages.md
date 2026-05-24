# Packages

This is the canonical reference for what each workspace package does, what it exports, and what its tests cover.

---

## `@prompt-forge/core`

**Purpose.** Shared types, the `Result<T, E>` discriminated union, the `AppError` model, and a structured logger. Has zero runtime dependencies on the other packages.

**Public API.**

| Symbol                                | Purpose                                              |
| ------------------------------------- | ---------------------------------------------------- |
| `Result<T, E>`                        | Discriminated-union result type                      |
| `ok`, `err`, `isOk`, `isErr`          | Result constructors and guards                       |
| `map`, `flatMap`, `mapErr`, `unwrapOr`| Result combinators                                   |
| `fromThrowable`                       | Wrap a throwing async fn into a Result               |
| `AppError`, `appError`, `AppErrorCode`| Uniform error type with discriminated `code` field   |
| `ProviderConfigSchema`, `ProviderConfig` | Provider config Zod schema and inferred type      |
| `ChatRequestSchema`, `ChatResponse`   | Chat request/response shapes                         |
| `Pattern`, `PatternCategory`, `TaskKind` | Pattern catalog entry types                       |
| `EnhancementRequestSchema`, `EnhancementResponse` | Pipeline IO contracts                    |
| `createLogger(scope, bindings?)`      | JSON structured logger with secret redaction         |

**Tests (`vitest run` in `packages/core`).**

- `result.test.ts` — covers `ok`/`err` branches, `map`, `flatMap`, `mapErr`, `unwrapOr`, and `fromThrowable` for both throwing and non-throwing async fns.
- `types.test.ts` — exhaustive Zod parse / reject cases for `ProviderConfigSchema`, `ChatMessageSchema`, `EnhancementRequestSchema`, and `TaskKindSchema`.
- `logger.test.ts` — captures stdout/stderr, asserts JSON shape, redaction of `apiKey`/`Authorization`/`token`/`password` keys at any nesting level, and child-logger binding inheritance.

---

## `@prompt-forge/patterns`

**Purpose.** The curated catalog of agentic patterns from `awesome-agentic-patterns`, plus the heuristic classifier and the pattern selector. All pure functions — no IO.

**Public API.**

| Symbol                              | Purpose                                                |
| ----------------------------------- | ------------------------------------------------------ |
| `PATTERN_CATALOG`                   | The full readonly catalog                              |
| `findPatternBySlug(slug)`           | Lookup by slug                                         |
| `allPatterns()`                     | Returns the catalog                                    |
| `classifyTask(rawPrompt) → TaskKind`| Heuristic classifier (deterministic)                   |
| `selectPatterns(rawPrompt, taskKind, opts)` | Top-N pattern picker (deterministic)           |

**Tests.**

- `catalog.test.ts` — invariants on every entry: unique slugs, non-empty fields, markdown headers in directives, links to `agentic-patterns.com`, presence of canonical patterns (`plan-then-execute`, `spec-as-test`, `reflection-loop`, etc.), category coverage.
- `classify.test.ts` — labelled examples for every TaskKind; asserts that a refactor + add prompt resolves to `refactor` (the higher-weighted rule); empty input returns `unknown`; deterministic.
- `select.test.ts` — `maxPatterns` bound; pinned/excluded slugs honored; taskKind-fallback when no triggers match; deduplication; deterministic.

---

## `@prompt-forge/providers`

**Purpose.** Uniform `ProviderClient` interface with implementations for every supported provider. Every implementation receives a `fetch`-like function so tests run without real network calls.

**Public API.**

| Symbol                                       | Purpose                                              |
| -------------------------------------------- | ---------------------------------------------------- |
| `ProviderClient`                             | Interface every provider conforms to                 |
| `createProviderClient(config, options?)`     | Factory that picks the right implementation          |
| `createOllamaClient(config, fetchImpl?)`     | Native Ollama `/api/chat` client                     |
| `createOpenAICompatibleClient(config, opts?)`| OpenAI / Lemonade / llama.cpp                        |
| `createAnthropicClient(config, fetchImpl?)`  | Anthropic `/v1/messages` client                      |
| `requestJson(req, fetchImpl)`                | Typed fetch wrapper with timeout / error mapping     |
| `DEFAULT_BASE_URLS`                          | `Record<ProviderKind, string>` of canonical endpoints|
| `scriptedFetch(responder)`                   | Test fixture — a real fetch impl for tests           |

**Tests.**

- `http.test.ts` — covers `PROVIDER_TIMEOUT` (abort), `PROVIDER_BAD_RESPONSE` (non-JSON), `PROVIDER_UNREACHABLE` (TypeError on fetch).
- `openai-compatible.test.ts` — asserts request shape (URL, body, headers, Bearer token), Lemonade's "Bearer lemonade" default, error-code mapping for 401 / 429 / zero-choices.
- `ollama.test.ts` — asserts native `/api/chat` body shape, `eval_count` → token usage, empty-content rejection.
- `anthropic.test.ts` — asserts `/v1/messages` POST, `x-api-key` + `anthropic-version` headers, system-message splitting, `stop_reason: max_tokens` → `finishReason: length`, `CONFIG_MISSING` when no key.
- `factory.test.ts` — every provider kind routes correctly; OpenAI without key → `CONFIG_MISSING`; default base URLs surface for the UI.

**Endpoint defaults.**

```
ollama     http://localhost:11434           (uses native /api/chat)
lemonade   http://localhost:13305/api/v1    (OpenAI-compatible)
llamacpp   http://localhost:8080/v1         (OpenAI-compatible)
openai     https://api.openai.com/v1
anthropic  https://api.anthropic.com        (uses native /v1/messages)
```

---

## `@prompt-forge/config`

**Purpose.** App configuration model and storage adapters. Keeps user-supplied provider configs in browser localStorage on the client and never writes them server-side.

**Public API.**

| Symbol                                  | Purpose                                          |
| --------------------------------------- | ------------------------------------------------ |
| `AppConfigSchema`, `AppConfig`          | Top-level config shape (Zod + TS)                |
| `emptyAppConfig()`                      | Returns a parsed empty config with defaults      |
| `ConfigStore`                           | `{ load, save }` interface                       |
| `createMemoryStore(initial?)`           | In-memory implementation (for tests)             |
| `createLocalStorageStore(storage, key?)`| Browser `localStorage` implementation            |
| `upsertProvider(config, provider)`      | Pure helper                                      |
| `removeProvider(config, kind)`          | Pure helper                                      |
| `setActiveProvider(config, kind)`       | Pure helper                                      |
| `getActiveProviderConfig(config)`       | Pure helper                                      |

**Tests.**

- `store.test.ts` — schema parse / reject; immutable upsert/remove (input config not mutated); auto-select first provider; fallback to remaining provider when active is removed; localStorage round-trip; `CONFIG_INVALID` on corrupt storage.

---

## `@prompt-forge/enhancer`

**Purpose.** The orchestration layer. One function — `enhance(client, request, options?)` — that runs the full pipeline.

**Public API.**

| Symbol                                  | Purpose                                          |
| --------------------------------------- | ------------------------------------------------ |
| `enhance(client, request, options?)`    | The main pipeline                                |
| `buildEnhancementMessages(args)`        | Pure function — builds the meta-prompt           |
| `buildReflectionMessages(...)`          | Pure function — builds reflection messages       |
| `extractRewrittenPrompt(rawResponse)`   | Pure function — extracts ` ```prompt ` block     |

**Tests.**

- `prompt-builder.test.ts` — exact message count and roles; every selected pattern's directive + source URL embedded; raw prompt fenced as data; task-kind hint in the user message; `extractRewrittenPrompt` handles `\`\`\`prompt`, plain `\`\`\``, and no-fence fallback; round-trip every catalog entry through the builder.
- `enhance.test.ts` — happy path (draft + reflect); reflect=false uses one chat call; explicit `taskKind` override; pinned patterns surface in the response; `VALIDATION` for short prompts; provider error propagation; reflection failure is non-fatal (draft is kept); raw response without fences falls back gracefully.

---

## `apps/web`

**Purpose.** The Next.js 15 App Router web UI.

**Routes.**

- `GET /` — server component; renders `<EnhanceForm/>` (`src/app/page.tsx`).
- `GET /settings` — server component; renders `<ProviderSettings/>` (`src/app/settings/page.tsx`).
- `POST /api/enhance` — calls `handleEnhanceRequest` (`src/app/api/enhance/handler.ts:30`). Status mapping: `PROVIDER_UNREACHABLE`/`PROVIDER_TIMEOUT` → 502; `VALIDATION` → 400; else → 500. `cause` is stripped before serialization (`handler.ts:39-46`).
- `POST /api/providers/test` — `handleProviderTestRequest`. Sends a 16-token "ping" chat to verify reachability.

**Tests.**

- `app/api/enhance/route.test.ts` — 6 cases: malformed JSON (400), invalid request shape (400), missing provider (400), happy path with rewritten prompt, `cause`-stripping on errors, `temperature` forwarding.
- `app/api/providers/test/handler.test.ts` — 7 cases including the `PROVIDER_AUTH → 500` mapping and the `cause`-strip assertion.
- `components/enhance-form.test.tsx` — 5 RTL tests via happy-dom + `jsx: "automatic"`.
- `e2e/enhance.spec.ts` — 4 Playwright tests against the built app. `/api/enhance` is mocked via `page.route` (no real LLM).

---

## `apps/mcp`

**Purpose.** Model Context Protocol server. JSON-RPC 2.0 over **two** transports (stdio + HTTP). Single tool: `enhance_prompt`. Each catalog pattern is also exposed as an MCP resource at `promptforge://patterns/<slug>`. Pure orchestration — every chat call goes through `@prompt-forge/enhancer` and `@prompt-forge/providers`; the server has no LLM knowledge of its own.

**Public API.**

| Symbol | File:line |
| --- | --- |
| `handleMcpRequest(payload, deps?)` — protocol-agnostic JSON-RPC dispatcher | `src/server.ts:112-224` |
| `JsonRpcRequest`, `JsonRpcResponse` types | `src/server.ts:18-30` |
| `ProviderClientFactory` type | `src/server.ts:12` |
| `runStdioServer(opts?)` — NDJSON over stdin/stdout | `src/stdio.ts:11-39` |
| `startHttpServer(opts?)` — POST JSON, POST SSE, GET SSE, OPTIONS | `src/http.ts:81-240` |
| Bin shims (spawn `tsx` against the TS sources) | `bin/stdio.mjs`, `bin/http.mjs` |

**Tool: `enhance_prompt`.** Provider config is supplied per call. Input schema declared at `src/server.ts:51-87`. Required: `rawPrompt` (≥10 chars), `provider`. Optional: `taskKind`, `maxPatterns` (1–10), `pinnedSlugs`, `excludedSlugs`, `reflect`, `temperature` (0–2).

**Resources.** `resources/list` enumerates all 22 catalog entries (`src/server.ts:177-186`). `resources/read promptforge://patterns/<slug>` returns the directive markdown plus a source link (`src/server.ts:188-212`). Unknown slug or non-`promptforge://` URI → `-32602`.

**HTTP transport — environment knobs.**

| Var | Default | Effect |
| --- | --- | --- |
| `PORT` | `8787` | bind port |
| `HOST` | `127.0.0.1` | bind address — set to `0.0.0.0` only with `PROMPTFORGE_MCP_TOKEN` set |
| `PROMPTFORGE_MCP_TOKEN` | unset | when set, every POST and GET requires `Authorization: Bearer <token>` or returns 401 `-32001`. OPTIONS preflight is never gated. |

**HTTP transport — fixed behavior.**

- 256 KiB POST body limit (configurable via `maxBodyBytes`); over → 413 `-32600` (`src/http.ts:42-52, 167-178`).
- CORS preflight on OPTIONS (`src/http.ts:96-104`); `access-control-allow-origin` on every response (default `*`, configurable).
- POST with `Accept: text/event-stream` returns the response as a single SSE `event: message` frame (`src/http.ts:212-223`).
- GET with `Accept: text/event-stream` opens an SSE channel with an `Mcp-Session-Id` header and a 15 s keep-alive (`src/http.ts:106-141`).

**Tests.**

- `src/server.test.ts` — 12 cases: `initialize` advertises `{tools:{}, resources:{}}`, `tools/list` lists `enhance_prompt`, `tools/call` happy path, malformed JSON-RPC → -32600, unknown tool/method → -32601, `resources/list` count + URIs, `resources/read` valid slug + unknown slug + non-promptforge scheme.
- `src/http.test.ts` — 18 cases: 405 on GET without SSE, 404 on wrong path, 400 on bad JSON, 413 over body limit, exact-at-limit accepts, CORS preflight + every-response header, POST/JSON happy path, POST/SSE branch, GET SSE channel + `Mcp-Session-Id`, bearer auth on POST + GET (missing/wrong/right), OPTIONS never gated, no-token = no auth required.
- `src/stdio.test.ts` — 3 cases: NDJSON round-trip, notifications suppressed, parse-error line.

**stdio caveat.** No auth gate. stdio inherits the local user's process trust boundary — the assumption is that anyone who can write to the server's stdin is already inside the trust circle.
