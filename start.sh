#!/usr/bin/env bash
# start.sh — unified launcher for PromptForge web app + MCP HTTP server
# Usage: ./start.sh [--dev] [--no-build] [--web-only] [--mcp-only]

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGS_DIR="$ROOT/.logs"
mkdir -p "$LOGS_DIR"

WEB_PORT=3000
MCP_PORT=8787
DEV=false
NO_BUILD=false
WEB_ONLY=false
MCP_ONLY=false

for arg in "$@"; do
  case $arg in
    --dev)       DEV=true ;;
    --no-build)  NO_BUILD=true ;;
    --web-only)  WEB_ONLY=true ;;
    --mcp-only)  MCP_ONLY=true ;;
    *) echo "Unknown flag: $arg" >&2; exit 1 ;;
  esac
done

# ── helpers ────────────────────────────────────────────────────────────────────

log() { echo "[start.sh] $*"; }

port_in_use() { lsof -ti tcp:"$1" &>/dev/null; }

kill_port() {
  local pid
  pid=$(lsof -ti tcp:"$1" 2>/dev/null || true)
  if [[ -n "$pid" ]]; then
    log "Port $1 occupied (PID $pid) — killing..."
    kill "$pid" 2>/dev/null || true
    sleep 0.5
  fi
}

wait_for_port() {
  local port=$1 label=$2 attempts=0
  while ! port_in_use "$port"; do
    sleep 0.5
    (( attempts++ ))
    if (( attempts > 40 )); then
      log "ERROR: $label did not come up on port $port after 20s" >&2
      return 1
    fi
  done
}

PIDS=()

cleanup() {
  log "Shutting down..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  log "Done."
}
trap cleanup EXIT INT TERM

# ── build step ─────────────────────────────────────────────────────────────────

if [[ "$NO_BUILD" == false && "$DEV" == false ]]; then
  log "Building all packages..."
  cd "$ROOT"
  pnpm build 2>&1 | tee "$LOGS_DIR/build.log"
fi

# ── launch MCP HTTP server ─────────────────────────────────────────────────────

if [[ "$WEB_ONLY" == false ]]; then
  kill_port "$MCP_PORT"
  log "Starting MCP HTTP server on port $MCP_PORT..."
  PORT=$MCP_PORT node "$ROOT/apps/mcp/bin/http.mjs" \
    >"$LOGS_DIR/mcp.log" 2>&1 &
  PIDS+=($!)
  wait_for_port "$MCP_PORT" "MCP HTTP server"
  log "MCP HTTP server ready → http://127.0.0.1:$MCP_PORT/mcp"
fi

# ── launch web app ─────────────────────────────────────────────────────────────

if [[ "$MCP_ONLY" == false ]]; then
  kill_port "$WEB_PORT"
  if [[ "$DEV" == true ]]; then
    log "Starting web app in dev mode on port $WEB_PORT..."
    cd "$ROOT/apps/web"
    pnpm dev >"$LOGS_DIR/web.log" 2>&1 &
  else
    log "Starting web app on port $WEB_PORT..."
    cd "$ROOT/apps/web"
    pnpm start >"$LOGS_DIR/web.log" 2>&1 &
  fi
  PIDS+=($!)
  wait_for_port "$WEB_PORT" "Web app"
  log "Web app ready → http://localhost:$WEB_PORT"
fi

# ── summary ────────────────────────────────────────────────────────────────────

echo ""
echo "┌─────────────────────────────────────────────────────┐"
echo "│  PromptForge is running                             │"
if [[ "$MCP_ONLY" == false ]]; then
echo "│  Web app    → http://localhost:$WEB_PORT              │"
fi
if [[ "$WEB_ONLY" == false ]]; then
echo "│  MCP server → http://127.0.0.1:$MCP_PORT/mcp          │"
fi
echo "│                                                     │"
echo "│  Logs: .logs/web.log  .logs/mcp.log                 │"
echo "│  Press Ctrl+C to stop                               │"
echo "└─────────────────────────────────────────────────────┘"
echo ""

# ── tail logs until killed ─────────────────────────────────────────────────────

tail -f "$LOGS_DIR"/*.log &
TAIL_PID=$!
PIDS+=($TAIL_PID)

# wait for any child to exit unexpectedly
wait "${PIDS[@]}" 2>/dev/null || true
