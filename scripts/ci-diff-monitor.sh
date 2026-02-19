#!/usr/bin/env bash
set -euo pipefail

THRESHOLD=${1:-50}

echo "[nexclaw] Checking upstream diff surface..."

if ! git remote | grep -q upstream; then
  echo "[nexclaw] No 'upstream' remote configured. Skipping diff monitor."
  exit 0
fi

git fetch upstream --quiet

DIFF_LINES=$(git diff upstream/main -- \
  src/ \
  test/ \
  openclaw.mjs \
  package.json \
  | grep '^[+-]' \
  | grep -v '^[+-][+-][+-]' \
  | wc -l \
  | tr -d ' ')

echo "[nexclaw] Upstream diff: ${DIFF_LINES} lines (threshold: ${THRESHOLD})"

if [ "$DIFF_LINES" -gt "$THRESHOLD" ]; then
  echo ""
  echo "FAIL: Upstream diff exceeds threshold."
  echo "Files with upstream modifications:"
  git diff --stat upstream/main -- src/ test/ openclaw.mjs package.json
  echo ""
  echo "If this is intentional, update the threshold or document the new diff in the design doc."
  exit 1
fi

echo "PASS: Upstream diff within acceptable range."
