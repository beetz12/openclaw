#!/usr/bin/env bash
set -euo pipefail

CONFIG_DIR="${OPENCLAW_STATE_DIR:-$HOME/.openclaw-dev}"
CONFIG_FILE="$CONFIG_DIR/openclaw.json"

mkdir -p "$CONFIG_DIR"

if [ -f "$CONFIG_FILE" ]; then
  echo "[nexclaw] Config exists at $CONFIG_FILE — verifying required keys..."
  node -e "
    const fs = require('fs');
    const existing = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
    const model = existing?.agents?.defaults?.model?.primary;
    if (!model) {
      console.log('  WARNING: agents.defaults.model.primary is not set.');
      console.log('  Set it to \"openai-codex/gpt-5.3-codex\" or \"claude-cli/opus\".');
      process.exit(1);
    } else {
      console.log('  Model: ' + model + ' — OK');
    }
  "
else
  echo "[nexclaw] Creating config at $CONFIG_FILE..."
  cat > "$CONFIG_FILE" << 'JSONEOF'
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "openai-codex/gpt-5.3-codex"
      }
    }
  }
}
JSONEOF
  echo "[nexclaw] Config created. Edit $CONFIG_FILE to customize."
fi

echo "[nexclaw] Setup complete."
