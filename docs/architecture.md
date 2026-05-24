# Architecture

> Authoritative version: `ARCHITECTURE.md` at the repo root. That file cites file:line for every claim. This document is the prose overview.

## Request flow — Web

```mermaid
sequenceDiagram
  participant User
  participant Web as Next.js (RSC + Client)
  participant API as /api/enhance (Route Handler)
  participant Enhancer as @prompt-forge/enhancer
  participant Patterns as @prompt-forge/patterns
  participant Provider as @prompt-forge/providers
  participant LLM as Ollama / Lemonade / llama.cpp / OpenAI / Anthropic

  User->>Web: paste prompt, submit form
  Web->>API: POST /api/enhance { request, provider }
  API->>API: Zod validation
  API->>Provider: createProviderClient(providerConfig)
  API->>Enhancer: enhance(client, request)
  Enhancer->>Patterns: classifyTask(rawPrompt)
  Enhancer->>Patterns: selectPatterns(rawPrompt, taskKind, opts)
  Enhancer->>Provider: client.chat(metaPromptMessages)
  Provider->>LLM: HTTP POST /chat/completions or /api/chat or /v1/messages
  LLM-->>Provider: ChatResponse
  Provider-->>Enhancer: Result<ChatResponse>
  alt reflect = true
    Enhancer->>Provider: client.chat(reflectionMessages)
    Provider->>LLM: HTTP POST
    LLM-->>Provider: ChatResponse
  end
  Enhancer-->>API: EnhancementResponse
  API-->>Web: JSON (cause stripped from errors)
  Web-->>User: rendered enhanced prompt
```

## Request flow — MCP

```mermaid
sequenceDiagram
  participant Client as MCP client (Claude Desktop / Code / curl)
  participant Transport as stdio.ts OR http.ts
  participant Handler as handleMcpRequest
  participant Enhancer as @prompt-forge/enhancer
  participant Patterns as @prompt-forge/patterns
  participant Provider as @prompt-forge/providers
  participant LLM

  Client->>Transport: JSON-RPC 2.0 frame

  Note over Transport: HTTP only — gates run in order:
  alt PROMPTFORGE_MCP_TOKEN is set
    Transport->>Transport: Authorization: Bearer <token>?
    alt missing or wrong
      Transport-->>Client: 401 { error code -32001 }
    end
  end
  alt body > maxBodyBytes (default 256 KiB)
    Transport-->>Client: 413 { error code -32600 }
  end

  Transport->>Handler: handleMcpRequest(payload)
  Handler->>Handler: isJsonRpc check, then dispatch by method

  alt method = "tools/call" name = "enhance_prompt"
    Handler->>Handler: EnhanceArgsSchema.safeParse
    Handler->>Provider: factory(provider) — createProviderClient by default
    Handler->>Enhancer: enhance(client, request)
    Enhancer->>Patterns: classify + select
    Enhancer->>Provider: client.chat (1× draft, +1× if reflect)
    Provider->>LLM: HTTP fetch
    LLM-->>Provider: response
    Provider-->>Enhancer: Result
    Enhancer-->>Handler: EnhancementResponse
  else method = "resources/list"
    Handler-->>Transport: { resources: [...22 catalog entries] }
  else method = "resources/read"
    Handler->>Patterns: findPatternBySlug(slug from uri)
    Handler-->>Transport: { contents: [{ markdown directive }] }
  end

  alt HTTP + Accept: text/event-stream
    Transport-->>Client: event: message\ndata: <json>\n\n
  else HTTP + Accept: application/json
    Transport-->>Client: 200 application/json
  else stdio
    Transport-->>Client: NDJSON line on stdout
  end
```

GET `/mcp` opens an SSE channel separately for server → client notifications (`apps/mcp/src/http.ts:106-141`); the current server uses it only for keep-alives.

## Dependency graph

```mermaid
graph TD
  web[apps/web] --> core
  web --> config
  web --> enhancer
  web --> providers

  mcp[apps/mcp] --> core
  mcp --> enhancer
  mcp --> patterns
  mcp --> providers

  enhancer --> core
  enhancer --> patterns
  enhancer --> providers

  patterns --> core
  providers --> core
  config --> core
```

`core` is the only package no other package depends on for its own dependencies — every other package imports types and the `Result` helpers from it. `apps/web` does **not** import `patterns` directly; the enhancer is the only caller of the pattern catalog from the web surface. `apps/mcp` imports `patterns` directly because `resources/list` and `resources/read` enumerate the catalog without going through the enhancer.

## Why this shape

The split between `patterns`, `providers`, and `enhancer` exists so that:

- The pattern catalog can be edited without touching any IO code.
- A new provider (Together, Fireworks, Groq, Mistral La Plateforme) is added by writing a single `ProviderClient` implementation, not by modifying the enhancer.
- The enhancer is one pure orchestration function that takes a `ProviderClient` and a request — it has no opinion on where the LLM lives.
- The web app is the only package that depends on Next.js and React. The packages compile to ESM and have no framework-specific code, so they could be reused from a CLI, a server-side worker, or a different frontend.

## Trust boundaries

| Boundary               | Trust level | Notes                                                  |
| ---------------------- | ----------- | ------------------------------------------------------ |
| Browser localStorage   | Untrusted (user-owned, but persists) | API keys live here. Never sent except to the matching provider on submit. |
| Browser → /api/enhance | Server validates with Zod | Schema gates protect against malformed payloads.       |
| /api/enhance → LLM     | Trusted egress | Only the configured `baseUrl` is contacted.            |
| LLM response → user    | Untrusted text | Rendered as `pre`/text only — never `dangerouslySetInnerHTML`. |

The `Dual LLM Pattern` in our catalog is the conceptual basis for this — the enhancer treats LLM output as data, never as control flow.
