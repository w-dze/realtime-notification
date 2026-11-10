#!/usr/bin/env bash
# End-to-end smoke against a running compose stack (API on :3000).
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
USER_ID="${USER_ID:-smoke-user-1}"
TIMEOUT_SECS="${TIMEOUT_SECS:-60}"

echo "==> Waiting for /readyz at ${BASE_URL}"
deadline=$((SECONDS + TIMEOUT_SECS))
until curl -sf "${BASE_URL}/readyz" >/dev/null; do
  if (( SECONDS >= deadline )); then
    echo "API not ready within ${TIMEOUT_SECS}s" >&2
    exit 1
  fi
  sleep 2
done
echo "ready"

echo "==> Seed preferences (mute nothing)"
curl -sf -X PUT "${BASE_URL}/v1/users/${USER_ID}/preferences" \
  -H 'content-type: application/json' \
  -d '{"channels":["sse"],"mutedTypes":[],"quietHours":null}' | tee /tmp/rns-prefs.json
echo

echo "==> Open SSE in background"
rm -f /tmp/rns-sse.out
(
  curl -Ns "${BASE_URL}/v1/stream?userId=${USER_ID}" \
    -H "x-user-id: ${USER_ID}" \
    -H 'accept: text/event-stream' \
    > /tmp/rns-sse.out
) &
SSE_PID=$!
trap 'kill ${SSE_PID} 2>/dev/null || true' EXIT
sleep 1

echo "==> Post activity"
ACTIVITY=$(curl -sf -X POST "${BASE_URL}/v1/activity" \
  -H 'content-type: application/json' \
  -H "x-user-id: ${USER_ID}" \
  -d "{\"userId\":\"${USER_ID}\",\"type\":\"order.placed\",\"payload\":{\"smoke\":true},\"ts\":$(date +%s000)}")
echo "${ACTIVITY}"

echo "==> Wait for SSE fanout"
deadline=$((SECONDS + TIMEOUT_SECS))
until grep -q "order.placed" /tmp/rns-sse.out 2>/dev/null; do
  if (( SECONDS >= deadline )); then
    echo "Timed out waiting for SSE event" >&2
    echo "--- SSE buffer ---" >&2
    cat /tmp/rns-sse.out >&2 || true
    exit 1
  fi
  sleep 0.5
done
echo "SSE received activity"

echo "==> Mute type and verify skip (no new matching event within short window)"
curl -sf -X PUT "${BASE_URL}/v1/users/${USER_ID}/preferences" \
  -H 'content-type: application/json' \
  -d '{"channels":["sse"],"mutedTypes":["order.placed"],"quietHours":null}' >/dev/null
: > /tmp/rns-sse.out
curl -sf -X POST "${BASE_URL}/v1/activity" \
  -H 'content-type: application/json' \
  -d "{\"userId\":\"${USER_ID}\",\"type\":\"order.placed\",\"payload\":{\"shouldSkip\":true},\"ts\":$(date +%s000)}" >/dev/null
sleep 3
if grep -q "shouldSkip" /tmp/rns-sse.out 2>/dev/null; then
  echo "ERROR: muted event was delivered over SSE" >&2
  exit 1
fi
echo "Muted event correctly skipped"

echo "==> SMOKE OK"
