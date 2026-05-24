# Providers

PromptForge supports five providers behind one uniform `ProviderClient` interface. The unified shape lets the enhancer treat every provider identically.

## Defaults

| Kind        | Default base URL                       | Auth                              | Notes                                                |
| ----------- | -------------------------------------- | --------------------------------- | ---------------------------------------------------- |
| `ollama`    | `http://localhost:11434`               | none                              | Uses native `/api/chat` for richer telemetry         |
| `lemonade`  | `http://localhost:13305/api/v1`        | `Bearer lemonade` (default)       | OpenAI-compatible. AMD GPU/NPU optimization.         |
| `llamacpp`  | `http://localhost:8080/v1`             | none                              | OpenAI-compatible. Default `llama-server` endpoint.  |
| `openai`    | `https://api.openai.com/v1`            | `Bearer <user-key>` (required)    | OpenAI-compatible.                                   |
| `anthropic` | `https://api.anthropic.com`            | `x-api-key: <user-key>` (required)| Native `/v1/messages` (better stop-reason mapping).  |

## Why two flavors of client

`createOpenAICompatibleClient` handles Lemonade, llama.cpp, and OpenAI because all three accept the OpenAI Chat Completions request body. `createOllamaClient` and `createAnthropicClient` are thin natives because their canonical APIs return better-shaped telemetry than their OpenAI-compat aliases:

- Ollama returns `prompt_eval_count` + `eval_count` natively, which we map to a clean `usage` shape. The OpenAI-compat alias doesn't always populate the `usage` block.
- Anthropic's native `stop_reason` distinguishes `end_turn`, `max_tokens`, `tool_use`, and `stop_sequence`. OpenAI-shape only gives `stop`/`length`, losing information.

## Error mapping

| HTTP status / cause       | `AppErrorCode`            | Notes                                          |
| ------------------------- | ------------------------- | ---------------------------------------------- |
| 401 / 403                 | `PROVIDER_AUTH`           | Wrong API key, expired token                   |
| 408 / 504                 | `PROVIDER_TIMEOUT`        | Server-side timeout                            |
| 429                       | `PROVIDER_RATE_LIMIT`     | Backoff and retry at the caller's discretion   |
| 5xx                       | `PROVIDER_UNREACHABLE`    | Upstream is down or overloaded                 |
| `AbortError` (timeout)    | `PROVIDER_TIMEOUT`        | We aborted because `timeoutMs` elapsed         |
| `TypeError` (fetch)       | `PROVIDER_UNREACHABLE`    | Network unreachable / DNS / TLS                |
| Non-JSON content-type     | `PROVIDER_BAD_RESPONSE`   | Provider returned HTML or text                 |
| Zero choices / empty body | `PROVIDER_BAD_RESPONSE`   | Malformed but successful response              |

## Adding a new provider

1. Add the kind to `ProviderKindSchema` in `packages/core/src/types.ts`.
2. Create `packages/providers/src/<kind>.ts` exporting `create<Kind>Client(config, fetchImpl)`.
3. Wire it into `createProviderClient` in `factory.ts`. The `default` branch's exhaustiveness check will fail to compile until you do.
4. Add the default base URL to `DEFAULT_BASE_URLS`.
5. Write the test in `<kind>.test.ts`. Use `scriptedFetch` from `test-fixtures.ts`.
6. Add an entry to the table at the top of this file.
7. Add an option to the `PROVIDER_KINDS` array in `apps/web/src/components/provider-settings.tsx`.

The compile errors will guide you through every step.

## Local-only setup notes

**Ollama.** Install from [ollama.com](https://ollama.com) and pull a model:

```bash
ollama pull llama3.1:8b
ollama serve            # default port 11434
```

**Lemonade.** Install from [lemonade-server.ai](https://lemonade-server.ai). After install, the desktop service boots automatically on port 13305. Models are managed through the desktop UI.

**llama.cpp.** Build the server binary, then:

```bash
./llama-server -m model.gguf -c 4096 --port 8080
```

The server exposes `/v1/chat/completions` and `/v1/models`.
