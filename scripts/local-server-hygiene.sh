#!/usr/bin/env bash
# Local server hygiene script for fashionmanager.
#
# Usage:
#   bash scripts/local-server-hygiene.sh          # check-only (default)
#   bash scripts/local-server-hygiene.sh --kill   # stop python3 http.server on 8080-8089
#
# Purpose:
#   Prevent accumulation of local http.server processes across smoke/test runs.
#   Only stops processes whose command line matches http.server.
#   Leaves any other process (non-http.server) untouched.
#
# This script does NOT modify code, DB, migrations, or config.
# It only inspects and (optionally) stops local http.server processes.

set -euo pipefail

MODE="${1:-check}"

echo "=== Local Server Hygiene ==="
echo "Mode: $MODE"
echo

echo "--- Checking local ports 8080-8089 ---"
lsof -nP -iTCP:8080-8089 -sTCP:LISTEN || true
echo

echo "--- Checking python http.server processes ---"
ps aux | grep "python3 -m http.server" | grep -v grep || true
echo

if [ "$MODE" != "--kill" ]; then
  echo "Check-only mode. Use --kill to stop http.server processes on ports 8080-8089."
  exit 0
fi

echo "--- Killing http.server processes on 8080-8089 ---"
for port in 8080 8081 8082 8083 8084 8085 8086 8087 8088 8089; do
  pids=$(lsof -tiTCP:$port -sTCP:LISTEN || true)
  if [ -n "$pids" ]; then
    for pid in $pids; do
      cmd=$(ps -p "$pid" -o command= || true)
      case "$cmd" in
        *http.server*)
          echo "Stopping local http.server PID=$pid PORT=$port"
          kill "$pid" || true
          ;;
        *)
          echo "Keeping non-http.server process PID=$pid PORT=$port"
          ;;
      esac
    done
  fi
done

sleep 1

echo
echo "--- After cleanup: ports 8080-8089 ---"
lsof -nP -iTCP:8080-8089 -sTCP:LISTEN || echo "no listeners on 8080-8089"
echo
echo "--- After cleanup: http.server processes ---"
ps aux | grep "python3 -m http.server" | grep -v grep || echo "no http.server processes"
echo
echo "=== Hygiene Complete ==="
