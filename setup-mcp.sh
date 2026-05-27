#!/usr/bin/env bash
# setup-mcp.sh — auto-detect AI coding tools and configure PromptForge MCP server
# Supports: Claude Code, Cursor, Windsurf, Zed, VS Code

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STDIO_BIN="$ROOT/apps/mcp/bin/stdio.mjs"
HTTP_URL="http://127.0.0.1:8787/mcp"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

log_ok()   { echo -e "${GREEN}✓${RESET} $*"; }
log_skip() { echo -e "${YELLOW}–${RESET} $*"; }
log_info() { echo -e "${CYAN}→${RESET} $*"; }

configured=()

# ── merge helper (uses node, always available) ─────────────────────────────────
# merge_json <config_file> <server_name> <json_entry>
# Creates the file (+ parent dirs) if missing. Backs up before editing.
merge_json() {
  local cfg="$1" name="$2" entry="$3"
  mkdir -p "$(dirname "$cfg")"
  [[ -f "$cfg" ]] && cp "$cfg" "${cfg}.bak"
  node - "$cfg" "$name" "$entry" <<'NODESCRIPT'
const [,, file, name, entry] = process.argv;
const { readFileSync, writeFileSync } = await import("node:fs");
let obj = {};
try { obj = JSON.parse(readFileSync(file, "utf8")); } catch {}
if (!obj.mcpServers) obj.mcpServers = {};
obj.mcpServers[name] = JSON.parse(entry);
writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
NODESCRIPT
}

STDIO_ENTRY=$(node -e "process.stdout.write(JSON.stringify({command:'node',args:['$STDIO_BIN']}))")
HTTP_ENTRY=$(node -e "process.stdout.write(JSON.stringify({url:'$HTTP_URL'}))")

echo ""
echo -e "${BOLD}PromptForge MCP Setup${RESET}"
echo "Stdio binary : $STDIO_BIN"
echo "HTTP endpoint: $HTTP_URL"
echo ""

# ── 1. Claude Code ─────────────────────────────────────────────────────────────

CLAUDE_CFG="$HOME/.claude/settings.json"
if command -v claude &>/dev/null || [[ -f "$HOME/.claude/settings.json" ]] || [[ -f "$HOME/.claude/config.json" ]]; then
  log_info "Detected Claude Code"
  merge_json "$CLAUDE_CFG" "promptforge" "$STDIO_ENTRY"
  log_ok "Claude Code → $CLAUDE_CFG"
  configured+=("Claude Code")
else
  log_skip "Claude Code not found"
fi

# ── 2. Cursor ──────────────────────────────────────────────────────────────────

CURSOR_CFG="$HOME/.cursor/mcp.json"
if [[ -d "$HOME/.cursor" ]] || command -v cursor &>/dev/null; then
  log_info "Detected Cursor"
  merge_json "$CURSOR_CFG" "promptforge" "$STDIO_ENTRY"
  log_ok "Cursor → $CURSOR_CFG"
  configured+=("Cursor")
else
  log_skip "Cursor not found"
fi

# ── 3. Windsurf ────────────────────────────────────────────────────────────────

WINDSURF_CFG="$HOME/.codeium/windsurf/mcp_config.json"
if [[ -d "$HOME/.codeium/windsurf" ]] || command -v windsurf &>/dev/null; then
  log_info "Detected Windsurf"
  merge_json "$WINDSURF_CFG" "promptforge" "$STDIO_ENTRY"
  log_ok "Windsurf → $WINDSURF_CFG"
  configured+=("Windsurf")
else
  log_skip "Windsurf not found"
fi

# ── 4. Zed ─────────────────────────────────────────────────────────────────────

ZED_CFG="$HOME/.config/zed/settings.json"
if [[ -d "$HOME/.config/zed" ]] || command -v zed &>/dev/null; then
  log_info "Detected Zed"
  # Zed uses context_servers, not mcpServers — different schema
  node - "$ZED_CFG" "$HTTP_URL" <<'NODESCRIPT'
const [,, file, url] = process.argv;
const { readFileSync, writeFileSync, mkdirSync } = await import("node:fs");
const { dirname } = await import("node:path");
mkdirSync(dirname(file), { recursive: true });
let obj = {};
try { obj = JSON.parse(readFileSync(file, "utf8")); } catch {}
if (!obj.context_servers) obj.context_servers = {};
obj.context_servers["promptforge"] = { url };
writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
NODESCRIPT
  log_ok "Zed → $ZED_CFG"
  configured+=("Zed")
else
  log_skip "Zed not found"
fi

# ── 5. VS Code ─────────────────────────────────────────────────────────────────

VSCODE_CFG="$ROOT/.vscode/mcp.json"
if command -v code &>/dev/null || [[ -d "$ROOT/.vscode" ]]; then
  log_info "Detected VS Code"
  merge_json "$VSCODE_CFG" "promptforge" "$STDIO_ENTRY"
  log_ok "VS Code → $VSCODE_CFG"
  configured+=("VS Code")
else
  log_skip "VS Code not found"
fi

# ── summary + per-tool instructions ────────────────────────────────────────────

echo ""
if [[ ${#configured[@]} -eq 0 ]]; then
  echo -e "${YELLOW}No AI coding tools detected.${RESET}"
  echo ""
  echo "Manual config — add this to your tool's MCP settings:"
  echo ""
  echo "  stdio (recommended):"
  echo "    server name : promptforge"
  echo "    command     : node"
  echo "    args        : [\"$STDIO_BIN\"]"
  echo ""
  echo "  HTTP/SSE (if your tool supports URL-based MCP):"
  echo "    url: $HTTP_URL"
  exit 0
fi

echo -e "${BOLD}Configured ${#configured[@]} tool(s): ${configured[*]}${RESET}"
echo ""
echo "─── Next steps ────────────────────────────────────────────"
echo ""

for tool in "${configured[@]}"; do
  case $tool in
    "Claude Code")
      echo -e "${BOLD}Claude Code${RESET}"
      echo "  Config updated automatically."
      echo "  Reload with: /mcp  (in a Claude Code session)"
      echo "  Or restart Claude Code to pick up the new server."
      echo ""
      ;;
    "Cursor")
      echo -e "${BOLD}Cursor${RESET}"
      echo "  Config written to ~/.cursor/mcp.json"
      echo "  Restart Cursor — the promptforge server will appear"
      echo "  under Settings → MCP."
      echo ""
      ;;
    "Windsurf")
      echo -e "${BOLD}Windsurf${RESET}"
      echo "  Config written to ~/.codeium/windsurf/mcp_config.json"
      echo "  Restart Windsurf to activate."
      echo ""
      ;;
    "Zed")
      echo -e "${BOLD}Zed${RESET}"
      echo "  HTTP endpoint written to ~/.config/zed/settings.json"
      echo "  Ensure PromptForge MCP server is running first:"
      echo "    ./start.sh --mcp-only"
      echo "  Then reload Zed settings (Cmd+Shift+P → reload settings)."
      echo ""
      ;;
    "VS Code")
      echo -e "${BOLD}VS Code${RESET}"
      echo "  Config written to .vscode/mcp.json"
      echo "  Install GitHub Copilot extension if not already installed."
      echo "  Reload window (Cmd+Shift+P → Developer: Reload Window)."
      echo ""
      ;;
  esac
done

echo "─── Available MCP tools ───────────────────────────────────"
echo ""
echo "  enhance_prompt   — rewrite a prompt using a pattern"
echo "  list_patterns    — list available enhancement patterns"
echo "  get_pattern      — get details for a specific pattern"
echo ""
echo "  Stdio transport  : runs in-process, no server needed"
echo "  HTTP transport   : start with ./start.sh --mcp-only"
echo "────────────────────────────────────────────────────────────"
echo ""
