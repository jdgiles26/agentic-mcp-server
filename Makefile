.PHONY: install dev dev-mcp-http dev-mcp-stdio test typecheck lint format build clean ci

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

typecheck:
	pnpm -r typecheck

lint:
	pnpm exec biome check .

format:
	pnpm exec biome format --write .

build:
	pnpm -r build

clean:
	find . -type d \( -name node_modules -o -name dist -o -name .next -o -name coverage \) -prune -exec rm -rf {} +

ci: install typecheck lint test build
