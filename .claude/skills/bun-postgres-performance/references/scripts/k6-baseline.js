// ============================================================
// k6-baseline.js — baseline load test for a Bun API endpoint.
// Run: bun x k6 run k6-baseline.js
//
// Adjust TARGET_URL, stages, and request body for your endpoint.
// ============================================================

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

// ---- Config ----
const TARGET_URL = __ENV.TARGET_URL || 'http://localhost:3000/api/endpoint';
const BEARER = __ENV.BEARER || '';

// ---- Custom metrics ----
const apiLatency = new Trend('api_latency_ms', true);
const apiErrors  = new Rate('api_errors');

export const options = {
  // Stages simulate realistic ramp-up
  stages: [
    { duration: '30s', target: 10 },   // warm-up
    { duration: '1m',  target: 50 },   // ramp to target concurrency
    { duration: '2m',  target: 50 },   // steady state (this is your measurement window)
    { duration: '30s', target: 0 },    // ramp down
  ],

  // SLO-style thresholds — the test fails if these are breached
  thresholds: {
    http_req_duration: ['p(95)<300', 'p(99)<800'],  // p95 < 300ms, p99 < 800ms
    http_req_failed:   ['rate<0.01'],                // < 1% errors
    api_errors:        ['rate<0.01'],
  },

  // Keep output tidy
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export default function () {
  const headers = { 'Content-Type': 'application/json' };
  if (BEARER) headers['Authorization'] = `Bearer ${BEARER}`;

  // GET example
  const res = http.get(TARGET_URL, { headers });

  // POST example (uncomment to use):
  // const res = http.post(TARGET_URL, JSON.stringify({ name: 'test' }), { headers });

  apiLatency.add(res.timings.duration);

  const ok = check(res, {
    'status is 200':     (r) => r.status === 200,
    'has body':          (r) => r.body && r.body.length > 0,
    // Add a body check that catches "success but empty" bugs:
    // 'body contains id': (r) => r.body.includes('"id"'),
  });

  apiErrors.add(!ok);

  // Small think-time between iterations per VU (virtual user)
  sleep(0.1);
}

// ---- Optional: per-endpoint scenarios ----
// Replace the `stages` above with `scenarios` for more control:
//
// scenarios: {
//   reads: {
//     executor: 'constant-arrival-rate',
//     rate: 200,                // 200 req/s target
//     timeUnit: '1s',
//     duration: '2m',
//     preAllocatedVUs: 50,
//     maxVUs: 100,
//     exec: 'readScenario',
//   },
//   writes: {
//     executor: 'constant-arrival-rate',
//     rate: 20,
//     timeUnit: '1s',
//     duration: '2m',
//     preAllocatedVUs: 10,
//     maxVUs: 30,
//     exec: 'writeScenario',
//   },
// },
//
// export function readScenario() { /* ... */ }
// export function writeScenario() { /* ... */ }
