.PHONY: install dev dev-mcp-http dev-mcp-stdio test test-live test-e2e test-e2e-install typecheck lint format build clean ci

install:
	pnpm install

dev:
	pnpm --filter @prompt-forge/web dev

dev-mcp-http:
	pnpm --filter @prompt-forge/mcp start:http

dev-mcp-stdio:
	pnpm --filter @prompt-forge/mcp start:stdio

test:
	pnpm -r --workspace-concurrency=1 test

test-live:
	pnpm --filter @prompt-forge/providers test:live

test-e2e-install:
	pnpm --filter @prompt-forge/web test:e2e:install

test-e2e:
	pnpm --filter @prompt-forge/web test:e2e

typecheck:
	pnpm -r typecheck

lint:
	pnpm exec biome check .

format:
	pnpm exec biome format --write .

build:
	pnpm -r build

clean:
	find . -type d \( -name node_modules -o -name dist -o -name .next -o -name coverage -o -name test-results -o -name playwright-report \) -prune -exec rm -rf {} +

ci: install typecheck lint test build
