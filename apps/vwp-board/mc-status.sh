#!/usr/bin/env bash
set -euo pipefail
LABEL="com.openclaw.mission-control"
UID_NUM="$(id -u)"
PLIST="/Users/dave/Library/LaunchAgents/${LABEL}.plist"

echo "=== Mission Control Status ==="
echo "Label: $LABEL"

echo
if launchctl print "gui/${UID_NUM}/${LABEL}" >/tmp/mc-status-launchctl.txt 2>/dev/null; then
  STATE_LINE=$(rg -n "state =" /tmp/mc-status-launchctl.txt | head -n1 | sed 's/^.*state = //')
  PID_LINE=$(rg -n "pid =" /tmp/mc-status-launchctl.txt | head -n1 | sed 's/^.*pid = //')
  echo "launchd: loaded"
  [ -n "${STATE_LINE:-}" ] && echo "state: ${STATE_LINE}"
  [ -n "${PID_LINE:-}" ] && echo "pid: ${PID_LINE}"
else
  echo "launchd: NOT loaded"
fi

echo
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 || true)
echo "http://localhost:3000 => ${HTTP_CODE:-000}"

echo
if [ -f /tmp/mission-control.out.log ]; then
  echo "--- tail /tmp/mission-control.out.log ---"
  tail -n 30 /tmp/mission-control.out.log
else
  echo "No stdout log yet: /tmp/mission-control.out.log"
fi

echo
if [ -f /tmp/mission-control.err.log ]; then
  echo "--- tail /tmp/mission-control.err.log ---"
  tail -n 30 /tmp/mission-control.err.log
else
  echo "No stderr log yet: /tmp/mission-control.err.log"
fi

echo
if [ -f "$PLIST" ]; then
  echo "plist: $PLIST"
else
  echo "plist missing: $PLIST"
fi
