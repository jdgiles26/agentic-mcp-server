# TDD strategy

## Goals

1. Every package proves its public contract with tests at the layer where the contract lives.
2. Tests are real implementations, not mocks. A "stub" here is a real fetch implementation that returns canned bytes — it conforms to the same `fetch` type a real one does.
3. No test ever requires a running Ollama / Lemonade / OpenAI service to pass. CI is hermetic.
4. Coverage gaps that *do* require live services are documented in the integration-tests section below and gated behind environment variables.

## Test pyramid

| Layer            | Where                                    | Speed | What it asserts                                                  |
| ---------------- | ---------------------------------------- | ----- | ---------------------------------------------------------------- |
| Unit             | `packages/*/src/**/*.test.ts`            | <1s   | Pure-function correctness (Result, schemas, classifier, selector, prompt-builder). |
| Component        | `packages/providers/src/*.test.ts`       | <1s   | Provider clients vs scripted fetch — exact request shape, exact error mapping.    |
| Integration      | `apps/web/src/app/api/**/*.test.ts`      | <2s   | Route handlers wired to real providers (with stubbed global fetch). End-to-end serialization. |
| UI               | `apps/web/src/components/*.test.tsx`     | <3s   | RTL — form validation, submit gating, success/error rendering.   |
| E2E (Playwright) | `apps/web/e2e/` against the built app    | 1–2s  | Real chromium browser. `/api/enhance` is mocked via `page.route` so no LLM is contacted. To exercise a real provider end-to-end, use the env-gated `LIVE_*` tests in `packages/providers/src/live.test.ts`. |

## What we don't test (and why)

| Skipped                                   | Reason                                                        |
| ----------------------------------------- | ------------------------------------------------------------- |
| Next.js Server Component rendering        | Reserved for E2E; unit-testing RSC adds setup with low payoff. The Playwright spec covers the hydrated client component (`apps/web/e2e/enhance.spec.ts`). |
| Real LLM output content                   | Non-deterministic. We assert the request shape, not the response semantics. The `LIVE_*` env-gated tests are the only place that talks to a real LLM, and they only assert that *some* content came back. |

## No-mocks policy

We use the word "scripted" for our test doubles, not "mock", because the distinction matters:

- A **mock** is a stand-in that doesn't behave like the real thing — for example, a function that records calls and returns whatever the test wants.
- A **scripted real implementation** *does* behave like the real thing. `scriptedFetch(responder)` returns a function with the exact `fetch` type signature; it parses headers, decodes the URL, builds a `Response`, and the provider client cannot tell it apart from a network connection. The only thing scripted about it is the response payload.

This matters because the test never lies about the contract. If we changed the provider to use `URL.searchParams` instead of body JSON, the scripted fetch would observe that change and the test would fail meaningfully.

## Optional: live integration tests

Two targets exist for running tests against real services. They are **not** part of `make test`:

```bash
# Hits a local Ollama on localhost:11434
LIVE_OLLAMA=1 pnpm --filter @prompt-forge/providers test:live

# Hits a real OpenAI endpoint with a small max_tokens
LIVE_OPENAI=1 OPENAI_API_KEY=sk-… pnpm --filter @prompt-forge/providers test:live
```

These are documented as a future addition in `docs/development.md`. The current test suite is hermetic.

## Running tests

```bash
# Everything
make test

# A single package
pnpm --filter @prompt-forge/patterns test
pnpm --filter @prompt-forge/enhancer test

# Watch mode for one package (the dedicated test:watch script lives only on
# @prompt-forge/core today; for the others, invoke vitest directly without the
# `run` arg)
pnpm --filter @prompt-forge/core test:watch
pnpm --filter @prompt-forge/enhancer exec vitest

# With coverage (core only — others mirror the same pattern)
pnpm --filter @prompt-forge/core exec vitest run --coverage
```
