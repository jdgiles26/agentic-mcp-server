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

**Tests.**

- `app/api/enhance/route.test.ts` — direct invocation of the route handler with a real `Request` object and a stubbed global fetch. Covers malformed JSON (400), invalid provider config (400), short prompt (400), upstream unreachable (502), and happy path with the rewritten prompt extracted from the LLM-shaped response.
- `components/enhance-form.test.tsx` — RTL test that hydrates from localStorage, asserts the "no provider configured" alert, the disabled submit button when invalid, the successful end-to-end submit (stubbed `/api/enhance`), and the error rendering path.
