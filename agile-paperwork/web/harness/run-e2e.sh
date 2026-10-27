#!/usr/bin/env bash
# Starts a fresh harness (empty in-memory data), runs the browser check, stops the harness.
# Usage: ./run-e2e.sh <phone|desktop> <screenshotDir> [port] [fail]
set -u
MODE=$1; SHOTS=$2; PORT=${3:-5174}
cd "$(dirname "$0")"
if [ "${4:-}" = "fail" ]; then export HARNESS_MAPPER=fail; fi
fuser -k "$PORT/tcp" >/dev/null 2>&1; sleep 0.5
node node_modules/vite/bin/vite.js --port "$PORT" --strictPort > "$SHOTS.vite.log" 2>&1 &
VPID=$!
for i in $(seq 1 40); do curl -s -o /dev/null "http://localhost:$PORT/" && break; sleep 0.5; done
if [ "${4:-}" = "fail" ]; then node e2e-fail.mjs "http://localhost:$PORT" "$MODE" "$SHOTS"; else node e2e.mjs "http://localhost:$PORT" "$MODE" "$SHOTS"; fi
CODE=$?
kill $VPID 2>/dev/null; fuser -k "$PORT/tcp" >/dev/null 2>&1; wait $VPID 2>/dev/null
exit $CODE
