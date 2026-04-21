// ============================================================
// baseline.js — k6 load test for the FCE backend.
//
// Simulates realistic read traffic against the hot endpoints a
// logged-in user hits (dashboard, topics, library, brands, /me)
// with 1–3s think time between requests.
//
// Does NOT test AI generation endpoints — those are gated by
// provider rate limits, not app performance.
//
// Run:
//   SCENARIO=smoke    k6 run scripts/load/baseline.js
//   SCENARIO=baseline k6 run scripts/load/baseline.js   # default
//   SCENARIO=ramp     k6 run scripts/load/baseline.js
//
// See docs/load-testing.md for the full runbook.
// ============================================================

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

// ---- Required env vars ----
const BASE_URL = __ENV.BASE_URL || "http://localhost:3001";
const EMAIL = __ENV.EMAIL;
const PASSWORD = __ENV.PASSWORD;
const WORKSPACE_ID = __ENV.WORKSPACE_ID;
const SCENARIO = __ENV.SCENARIO || "baseline";

if (!EMAIL || !PASSWORD || !WORKSPACE_ID) {
  throw new Error(
    "Missing env vars. Required: EMAIL, PASSWORD, WORKSPACE_ID. Optional: BASE_URL, SCENARIO.",
  );
}

// ---- Scenario definitions ----
//
// smoke:    sanity check — one VU, one minute. Fails fast if the
//           endpoint shape is broken or auth is wrong.
// baseline: steady 50 VU load for 2 min after a 1m warm-up.
//           Use this number as your "normal day" p95 reference.
// ramp:     10 → 100 → 300 → 500 VUs over ~8 min. Find the point
//           where p95 exceeds 1s or error rate crosses 1% — that's
//           the practical concurrent-user ceiling for this shape.
const STAGES = {
  smoke: [{ duration: "1m", target: 1 }],
  baseline: [
    { duration: "30s", target: 10 },
    { duration: "1m", target: 50 },
    { duration: "2m", target: 50 },
    { duration: "30s", target: 0 },
  ],
  ramp: [
    { duration: "1m", target: 10 },
    { duration: "2m", target: 100 },
    { duration: "2m", target: 300 },
    { duration: "2m", target: 500 },
    { duration: "30s", target: 0 },
  ],
};

if (!STAGES[SCENARIO]) {
  throw new Error(`Unknown SCENARIO "${SCENARIO}". Valid: ${Object.keys(STAGES).join(", ")}.`);
}

// ---- Custom metrics (pulled per-endpoint for a clearer summary) ----
const dashboardLatency = new Trend("ep_dashboard_ms", true);
const topicsLatency = new Trend("ep_topics_ms", true);
const libraryLatency = new Trend("ep_library_ms", true);
const brandsLatency = new Trend("ep_brands_ms", true);
const meLatency = new Trend("ep_me_ms", true);
const endpointErrors = new Rate("endpoint_errors");

export const options = {
  stages: STAGES[SCENARIO],
  // SLO-shaped thresholds. Tuned for a small backend running on a
  // laptop-class machine; tighten these once you have real baseline data.
  thresholds: {
    http_req_duration: ["p(95)<800", "p(99)<2000"],
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
    endpoint_errors: ["rate<0.01"],
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
};

// ---- Setup: log in once, pass the token to every VU ----
export function setup() {
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { "Content-Type": "application/json" } },
  );
  if (res.status !== 200) {
    throw new Error(`Login failed: HTTP ${res.status} — ${res.body}`);
  }
  const body = JSON.parse(res.body);
  const token = body?.data?.accessToken;
  if (!token) {
    throw new Error("Login succeeded but no accessToken in response body.");
  }
  return { token };
}

// ---- Main loop: weighted mix of reads that a real user does in a session ----
export default function (data) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${data.token}`,
  };

  // Weighted choice roughly matching observed UI traffic:
  //   30% dashboard, 25% topics, 25% library, 10% brands, 10% /me
  const roll = Math.random();
  let ok = false;

  if (roll < 0.3) {
    const res = http.get(`${BASE_URL}/api/workspaces/${WORKSPACE_ID}/dashboard/stats`, {
      headers,
      tags: { endpoint: "dashboard" },
    });
    dashboardLatency.add(res.timings.duration);
    ok = check(res, {
      "dashboard 200": (r) => r.status === 200,
      "dashboard has body": (r) => !!r.body && r.body.length > 0,
    });
  } else if (roll < 0.55) {
    const res = http.get(`${BASE_URL}/api/workspaces/${WORKSPACE_ID}/topics`, {
      headers,
      tags: { endpoint: "topics" },
    });
    topicsLatency.add(res.timings.duration);
    ok = check(res, {
      "topics 200": (r) => r.status === 200,
      "topics has body": (r) => !!r.body,
    });
  } else if (roll < 0.8) {
    const res = http.get(`${BASE_URL}/api/workspaces/${WORKSPACE_ID}/library`, {
      headers,
      tags: { endpoint: "library" },
    });
    libraryLatency.add(res.timings.duration);
    ok = check(res, {
      "library 200": (r) => r.status === 200,
    });
  } else if (roll < 0.9) {
    const res = http.get(`${BASE_URL}/api/workspaces/${WORKSPACE_ID}/brands`, {
      headers,
      tags: { endpoint: "brands" },
    });
    brandsLatency.add(res.timings.duration);
    ok = check(res, {
      "brands 200": (r) => r.status === 200,
    });
  } else {
    const res = http.get(`${BASE_URL}/api/auth/me`, {
      headers,
      tags: { endpoint: "me" },
    });
    meLatency.add(res.timings.duration);
    ok = check(res, {
      "me 200": (r) => r.status === 200,
    });
  }

  endpointErrors.add(!ok);

  // Think time between actions (1–3s) — simulates a human clicking
  // around, not a bot spraying requests.
  sleep(1 + Math.random() * 2);
}
