#!/usr/bin/env bash
set -euo pipefail

echo "[nexclaw] Fetching upstream..."
git fetch upstream

echo "[nexclaw] Rebasing onto upstream/main..."
if ! git rebase upstream/main; then
  echo ""
  echo "[nexclaw] Conflicts detected. Expected conflict files:"
  echo "  - src/cli/cli-name.ts (CLI rename — keep nexclaw values)"
  echo "  - src/cli/command-format.ts (CLI regex — keep nexclaw pattern)"
  echo "  - src/entry.ts (process.title — keep nexclaw strings)"
  echo "  - package.json (bin field — keep nexclaw entry)"
  echo "  - src/agents/cli-runner.ts (lane + clearEnv — keep our additions)"
  echo "  - src/agents/cli-backends.ts (CLAUDECODE in clearEnv — keep our addition)"
  echo ""
  echo "For each file, keep the nexclaw version of our changes."
  echo "Run 'git rebase --continue' after resolving each conflict."
  exit 1
fi

echo "[nexclaw] Rebase clean. Running post-merge checks..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
pnpm build
pnpm check
echo "[nexclaw] All clear."
