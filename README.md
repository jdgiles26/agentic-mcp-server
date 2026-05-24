# PromptForge

Rewrites coding-assistant prompts using strategies from
[awesome-agentic-patterns](https://github.com/nibzard/awesome-agentic-patterns).
Paste a prompt, PromptForge classifies the task, selects relevant agentic patterns,
and asks your configured LLM to produce a sharper, structured rewrite.

Available as a **web app** *and* an **MCP server** (stdio + HTTP), so the same
enhancer pipeline can be called from a browser or from Claude Desktop / Claude Code.

| Local providers              | Cloud providers   |
| ---------------------------- | ----------------- |
| Ollama (port 11434)          | OpenAI API        |
| Lemonade.app (port 13305)    | Anthropic API     |
| llama.cpp server (port 8080) |                   |

## Run

```bash
pnpm install
pnpm test           # 90 tests, hermetic (no live LLM required)
pnpm typecheck

# Web app
pnpm --filter @prompt-forge/web dev    # http://localhost:3000

# MCP server — HTTP (default port 8787)
pnpm --filter @prompt-forge/mcp start:http

# MCP server — stdio (for Claude Desktop / Claude Code)
pnpm --filter @prompt-forge/mcp start:stdio
```

## MCP usage

The MCP server exposes one tool: **`enhance_prompt`**. Provider config is passed
per-call (no server-side keys), so you can drive any provider from any client.

### Claude Code / Desktop (stdio)

```json
{
  "mcpServers": {
    "promptforge": {
      "command": "pnpm",
      "args": ["--filter", "@prompt-forge/mcp", "exec", "tsx", "src/stdio.ts"],
      "cwd": "/absolute/path/to/this/repo"
    }
  }
}
```

### HTTP (curl example)

```bash
curl -s -X POST http://127.0.0.1:8787/mcp \
  -H 'content-type: application/json' \
  -d '{
    "jsonrpc":"2.0","id":1,"method":"tools/call",
    "params":{
      "name":"enhance_prompt",
      "arguments":{
        "rawPrompt":"refactor the auth module to use hooks",
        "reflect":true,
        "provider":{"kind":"ollama","baseUrl":"http://localhost:11434","model":"llama3.1:8b"}
      }
    }
  }'
```

## Repo layout

```
prompt-forge/
├── apps/
│   ├── web/        Next.js 15 app (form + /api/enhance)
│   └── mcp/        MCP server — JSON-RPC handler, stdio + HTTP transports
├── packages/
│   ├── core/       Result type, AppError, Zod schemas
│   ├── patterns/   Catalog + heuristic classifier + selector
│   ├── providers/  ProviderClient interface + Ollama + OpenAI-compatible
│   └── enhancer/   Pipeline: classify → select → chat (→ reflect) → extract
└── docs/           Architecture, packages, providers, patterns, TDD strategy
```

This is a vertical slice of the full design in `docs/`. Anthropic native client,
llama.cpp-specific tuning, multi-pattern catalog (22 entries), config persistence,
and a richer `/settings` page can be added incrementally — each follows the same
TDD loop documented in [`docs/tdd-strategy.md`](./docs/tdd-strategy.md).

## License

Apache-2.0.
