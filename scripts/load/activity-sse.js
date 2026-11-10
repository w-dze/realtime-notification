/**
 * k6 load test: concurrent activity posts + SSE holds.
 *
 * Run against local compose stack:
 *   k6 run -e BASE_URL=http://localhost:3000 scripts/load/activity-sse.js
 *
 * Useful knobs:
 *   -e VUS=20 -e DURATION=30s -e USER_PREFIX=load
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Counter, Rate } from "k6/metrics";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.4/index.js";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const VUS = Number(__ENV.VUS || 10);
const DURATION = __ENV.DURATION || "30s";
const USER_PREFIX = __ENV.USER_PREFIX || "u";

const activityLatency = new Trend("activity_post_ms", true);
const notifySeen = new Counter("sse_events_seen");
const activityOk = new Rate("activity_ok");

export const options = {
  scenarios: {
    posters: {
      executor: "constant-vus",
      vus: VUS,
      duration: DURATION,
      exec: "postActivity",
    },
    sseHolders: {
      executor: "constant-vus",
      vus: Math.max(2, Math.floor(VUS / 2)),
      duration: DURATION,
      exec: "holdSse",
      startTime: "2s",
    },
  },
  thresholds: {
    activity_post_ms: ["p(95)<500"],
    activity_ok: ["rate>0.95"],
    http_req_failed: ["rate<0.05"],
  },
};

export function setup() {
  // Seed a few preference docs so muted-type skips are demonstrable under load
  for (let i = 0; i < Math.min(VUS, 5); i++) {
    const userId = `${USER_PREFIX}-${i}`;
    http.put(
      `${BASE_URL}/v1/users/${userId}/preferences`,
      JSON.stringify({
        channels: ["sse"],
        mutedTypes: i === 0 ? ["noise"] : [],
        quietHours: null,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }
  return { startedAt: Date.now() };
}

export function postActivity() {
  const userId = `${USER_PREFIX}-${__VU % Math.max(VUS, 1)}`;
  const payload = JSON.stringify({
    userId,
    type: "order.placed",
    payload: { vu: __VU, iter: __ITER, at: Date.now() },
    ts: Date.now(),
  });
  const res = http.post(`${BASE_URL}/v1/activity`, payload, {
    headers: {
      "Content-Type": "application/json",
      "x-user-id": userId,
    },
  });
  activityLatency.add(res.timings.duration);
  const ok = check(res, {
    "activity 202": (r) => r.status === 202,
  });
  activityOk.add(ok);
  sleep(0.2);
}

export function holdSse() {
  const userId = `${USER_PREFIX}-${__VU % Math.max(VUS, 1)}`;
  // k6 http does not stream SSE long-lived well; we probe the stream endpoint briefly
  // and count connection acceptance. Full fanout timing is observed via worker logs.
  const res = http.get(`${BASE_URL}/v1/stream?userId=${userId}`, {
    headers: {
      Accept: "text/event-stream",
      "x-user-id": userId,
    },
    timeout: "3s",
  });
  if (res.status === 200 || res.status === 0) {
    // status 0 can occur on intentional timeout of an open stream
    notifySeen.add(1);
  }
  sleep(1);
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: " ", enableColors: true }),
    "scripts/load/last-summary.json": JSON.stringify(data, null, 2),
  };
}
