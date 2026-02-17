#!/usr/bin/env bash
#
# Start the full VWP (Virtual Workforce Platform) stack:
#   1. OpenClaw Gateway (port 18789)
#   2. VWP Board / Mission Control (port 3000)
#
# Usage:
#   ./scripts/start-vwp.sh              # Skip channels (web-only mode)
#   ./scripts/start-vwp.sh --channels   # Start with messaging channels enabled
#
# Stop:
#   ./scripts/stop-vwp.sh   (or Ctrl+C — traps SIGINT/SIGTERM)
#

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PIDS_FILE="$ROOT_DIR/.vwp-pids"
LOG_DIR="$ROOT_DIR/.vwp-logs"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

cleanup() {
  echo ""
  echo -e "${YELLOW}Shutting down VWP stack...${NC}"

  if [[ -f "$PIDS_FILE" ]]; then
    while IFS= read -r pid; do
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
        echo -e "  Stopped PID $pid"
      fi
    done < "$PIDS_FILE"
    rm -f "$PIDS_FILE"
  fi

  # Kill any remaining child processes
  jobs -p 2>/dev/null | xargs -r kill 2>/dev/null || true

  echo -e "${GREEN}VWP stack stopped.${NC}"
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# Parse args
SKIP_CHANNELS=1
for arg in "$@"; do
  case "$arg" in
    --channels) SKIP_CHANNELS=0 ;;
    --help|-h)
      echo "Usage: $0 [--channels]"
      echo "  --channels   Enable messaging channels (WhatsApp, Telegram, etc.)"
      echo "  Default: web-only mode (channels skipped)"
      exit 0
      ;;
  esac
done

# Setup
mkdir -p "$LOG_DIR"
rm -f "$PIDS_FILE"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  OpenClaw VWP Stack                    ${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Check prerequisites
if ! command -v node &>/dev/null; then
  echo -e "${RED}Error: Node.js is required (>= 22.12.0)${NC}"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if (( NODE_VERSION < 22 )); then
  echo -e "${RED}Error: Node.js >= 22 required (found v$(node -v))${NC}"
  exit 1
fi

if ! command -v pnpm &>/dev/null; then
  echo -e "${RED}Error: pnpm is required (>= 10.23.0)${NC}"
  exit 1
fi

# Check if .env exists
if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo -e "${YELLOW}Warning: No .env file found. Copy .env.example to .env and configure it.${NC}"
fi

# Resolve gateway port (env > config > default 18789)
GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-18789}"

# 1. Start OpenClaw Gateway
echo -e "${GREEN}[1/2] Starting OpenClaw Gateway (port $GATEWAY_PORT)...${NC}"

if [[ "$SKIP_CHANNELS" == "1" ]]; then
  echo -e "       Mode: ${YELLOW}web-only${NC} (channels skipped)"
  OPENCLAW_SKIP_CHANNELS=1 node "$ROOT_DIR/scripts/run-node.mjs" --dev gateway \
    > "$LOG_DIR/gateway.log" 2>&1 &
else
  echo -e "       Mode: ${GREEN}full${NC} (channels enabled)"
  node "$ROOT_DIR/scripts/run-node.mjs" --dev gateway \
    > "$LOG_DIR/gateway.log" 2>&1 &
fi

GATEWAY_PID=$!
echo "$GATEWAY_PID" >> "$PIDS_FILE"
echo -e "       PID: $GATEWAY_PID | Log: .vwp-logs/gateway.log"

# Wait for gateway to be ready
echo -n "       Waiting for gateway"
for i in $(seq 1 30); do
  if curl -sf http://localhost:$GATEWAY_PORT/health >/dev/null 2>&1; then
    echo -e " ${GREEN}ready${NC}"
    break
  fi
  # Also check if process died
  if ! kill -0 "$GATEWAY_PID" 2>/dev/null; then
    echo -e " ${RED}failed${NC}"
    echo -e "${RED}Gateway failed to start. Check .vwp-logs/gateway.log${NC}"
    exit 1
  fi
  echo -n "."
  sleep 1
done

# 2. Start VWP Board (Mission Control)
echo -e "${GREEN}[2/2] Starting VWP Board / Mission Control (port 3000)...${NC}"

cd "$ROOT_DIR/apps/vwp-board"
npx next dev --port 3000 \
  > "$LOG_DIR/board.log" 2>&1 &

BOARD_PID=$!
echo "$BOARD_PID" >> "$PIDS_FILE"
echo -e "       PID: $BOARD_PID | Log: .vwp-logs/board.log"
cd "$ROOT_DIR"

# Wait for board to be ready
echo -n "       Waiting for board"
for i in $(seq 1 30); do
  if curl -sf http://localhost:3000 >/dev/null 2>&1; then
    echo -e " ${GREEN}ready${NC}"
    break
  fi
  if ! kill -0 "$BOARD_PID" 2>/dev/null; then
    echo -e " ${RED}failed${NC}"
    echo -e "${RED}Board failed to start. Check .vwp-logs/board.log${NC}"
    exit 1
  fi
  echo -n "."
  sleep 1
done

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  VWP Stack Running                     ${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "  Gateway:         ${GREEN}http://localhost:$GATEWAY_PORT${NC}"
echo -e "  Mission Control: ${GREEN}http://localhost:3000${NC}"
echo ""
if [[ "$SKIP_CHANNELS" == "1" ]]; then
  echo -e "  Channels: ${YELLOW}disabled${NC} (use --channels to enable)"
else
  echo -e "  Channels: ${GREEN}enabled${NC}"
fi
echo ""
echo -e "  Logs: .vwp-logs/gateway.log, .vwp-logs/board.log"
echo -e "  Press ${YELLOW}Ctrl+C${NC} to stop all services"
echo ""

# Keep running, wait for any child to exit
wait
