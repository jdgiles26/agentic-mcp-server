# Architecture

## Request flow

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
  Provider->>LLM: HTTP POST /chat/completions or /api/chat
  LLM-->>Provider: ChatResponse
  Provider-->>Enhancer: Result<ChatResponse>
  alt reflect = true
    Enhancer->>Provider: client.chat(reflectionMessages)
    Provider->>LLM: HTTP POST
    LLM-->>Provider: ChatResponse
  end
  Enhancer-->>API: EnhancementResponse
  API-->>Web: JSON
  Web-->>User: rendered enhanced prompt
```

## Dependency graph

```mermaid
graph TD
  web[apps/web] --> core
  web --> enhancer
  web --> providers
  web --> config
  web --> patterns

  enhancer --> core
  enhancer --> patterns
  enhancer --> providers

  patterns --> core
  providers --> core
  config --> core
```

`core` is the only package no other package depends on for its own dependencies — every other package imports types and the `Result` helpers from it.

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
