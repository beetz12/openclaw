#!/usr/bin/env bash
#
# Stop the VWP stack started by start-vwp.sh
#

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PIDS_FILE="$ROOT_DIR/.vwp-pids"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [[ ! -f "$PIDS_FILE" ]]; then
  echo -e "${YELLOW}No running VWP stack found (.vwp-pids not present).${NC}"
  exit 0
fi

echo -e "${YELLOW}Stopping VWP stack...${NC}"

while IFS= read -r pid; do
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    echo "  Stopped PID $pid"
  else
    echo "  PID $pid already stopped"
  fi
done < "$PIDS_FILE"

rm -f "$PIDS_FILE"
echo -e "${GREEN}VWP stack stopped.${NC}"
