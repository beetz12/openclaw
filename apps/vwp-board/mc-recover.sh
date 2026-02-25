#!/usr/bin/env bash
set -euo pipefail

LABEL="com.openclaw.mission-control"
PORT="3000"

echo "[mc-recover] checking listeners on :$PORT"
PIDS=$(lsof -tiTCP:${PORT} -sTCP:LISTEN 2>/dev/null || true)
if [ -n "${PIDS}" ]; then
  echo "[mc-recover] found listener pid(s): ${PIDS}"
  for pid in ${PIDS}; do
    # If it's not the launchd-managed next-server child, kill it.
    CMD=$(ps -p "$pid" -o command= 2>/dev/null || true)
    if [[ "$CMD" == *"next-server"* ]] || [[ "$CMD" == *"pnpm start --port ${PORT}"* ]]; then
      echo "[mc-recover] allowing managed process: $pid ($CMD)"
    else
      echo "[mc-recover] killing stale process: $pid ($CMD)"
      kill "$pid" || true
    fi
  done
fi

echo "[mc-recover] kickstarting ${LABEL}"
launchctl kickstart -k gui/$(id -u)/${LABEL}
sleep 2

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:${PORT} || true)
echo "[mc-recover] http://localhost:${PORT} => ${HTTP_CODE}"
if [ "${HTTP_CODE}" != "200" ]; then
  echo "[mc-recover] service unhealthy"
  exit 1
fi

echo "[mc-recover] done"
