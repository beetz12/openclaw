#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[nexclaw] Building CLI..."
pnpm build

echo "[nexclaw] Linking globally (pnpm link --global)..."
pnpm link --global

BIN_DIR="$(pnpm bin -g 2>/dev/null || true)"
echo "[nexclaw] Global bin dir: ${BIN_DIR:-unknown}"

echo "[nexclaw] Verifying command availability..."
if command -v nexclaw >/dev/null 2>&1; then
  echo "[ok] nexclaw -> $(command -v nexclaw)"
  nexclaw --help >/dev/null 2>&1 || true
else
  echo "[warn] nexclaw not found on PATH. Add pnpm global bin to PATH:"
  if [[ -n "${BIN_DIR}" ]]; then
    echo "  export PATH=\"$BIN_DIR:\$PATH\""
  else
    echo "  Run: pnpm bin -g   (then add that path to PATH)"
  fi
fi
