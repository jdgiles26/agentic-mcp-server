#!/usr/bin/env bash
# Merges .claude/hooks.audit.json into .claude/settings.json.
# Run once to enable the post-commit DRIFT.md auto-refresh.
# Requires `jq`.

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SETTINGS="$ROOT/.claude/settings.json"
HOOK="$ROOT/.claude/hooks.audit.json"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required. brew install jq" >&2
  exit 1
fi

tmp="$(mktemp)"
jq -s '.[0] * .[1]' "$SETTINGS" "$HOOK" > "$tmp"
mv "$tmp" "$SETTINGS"
echo "Installed audit hook into $SETTINGS."
echo "It runs scripts/audit.mjs in the background on every \`git commit\`."
