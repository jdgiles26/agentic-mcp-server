# PromptForge

A web app that rewrites coding-assistant prompts using strategies from
[awesome-agentic-patterns](https://github.com/nibzard/awesome-agentic-patterns).

You paste the prompt you would normally send to Claude, Cursor, Aider, or any
agentic coding tool. PromptForge classifies the task, picks the most relevant
agentic patterns from the catalog, and uses your configured LLM (local or
cloud) to produce a sharper, more structured rewrite that you can copy back
into your assistant of choice.

| Local providers          | Cloud providers     |
| ------------------------ | ------------------- |
| Ollama (port 11434)      | OpenAI API          |
| Lemonade.app (port 13305)| Anthropic API       |
| llama.cpp server (port 8080) |                 |

## TL;DR — running it locally

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

Open [http://localhost:3000/settings](http://localhost:3000/settings) and
configure at least one provider. Click **Test connection** to verify it is
reachable. Then go back to `/`, paste a prompt, and submit.

## Repo layout

```
prompt-forge/
├── apps/
│   └── web/                 Next.js 15 app (App Router, RSC default)
├── packages/
│   ├── core/                Result type, AppError, schemas, structured logger
│   ├── patterns/            Catalog of 22 agentic patterns + classifier + selector
│   ├── providers/           Ollama, Lemonade, llama.cpp, OpenAI, Anthropic clients
│   ├── config/              AppConfig + storage adapters (memory / localStorage)
│   └── enhancer/            Pipeline that ties classifier → selector → provider
├── docs/
│   ├── architecture.md
│   ├── packages.md
│   ├── providers.md
│   ├── patterns.md
│   ├── tdd-strategy.md
│   └── development.md
├── Makefile
├── biome.json
├── tsconfig.base.json
├── pnpm-workspace.yaml
└── package.json
```

## Development commands

| Command            | What it does                                        |
| ------------------ | --------------------------------------------------- |
| `make install`     | `pnpm install`                                      |
| `make dev`         | Start the Next.js dev server                        |
| `make test`        | Run every package's vitest suite                    |
| `make typecheck`   | `tsc --noEmit` across the monorepo                  |
| `make lint`        | Biome lint + format check                           |
| `make build`       | Build all packages and the web app                  |
| `make ci`          | Everything above, in order                          |

## Documentation

- [Architecture](./docs/architecture.md) — how the packages compose
- [Packages](./docs/packages.md) — purpose, public API, and tests for each package
- [Providers](./docs/providers.md) — endpoint defaults, auth, and protocol notes
- [Patterns](./docs/patterns.md) — how the catalog drives the rewrite
- [TDD strategy](./docs/tdd-strategy.md) — what we test, what we don't, and why
- [Development](./docs/development.md) — onboarding, conventions, release flow

## License

Apache-2.0.
