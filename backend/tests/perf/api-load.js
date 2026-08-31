// DevSync API load test (k6).
//
// What it does: registers a throwaway user, logs in, then hammers the
// developer-facing read endpoints under constant virtual users.
//
// Thresholds live HERE (not in CI YAML) so `k6 run` behaves identically
// locally and in the pipeline. These are CI execution ceilings, not production
// SLOs: CI runs a single gunicorn worker on a shared 2-vCPU runner, so the
// margins are deliberately wide. Production SLOs belong to a scheduled perf
// environment against a production-like stack.
//
// Run (CI-size):  k6 run --vus 10 --duration 30s tests/perf/api-load.js
// Run (smoke):    k6 run --vus 1 --duration 5s tests/perf/api-load.js

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

export const options = {
  thresholds: {
    // Error budget: <1% of requests may fail outright.
    http_req_failed: ['rate<0.01'],
    // Latency ceilings sized for the CI stack (single gevent worker,
    // shared runner). Tighten only alongside a production-like environment.
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
  },
};

// load-test@devsync.test-style throwaway accounts; one per setup() call so
// parallel/rerun jobs never collide.
const EMAIL_HOST = `load-${Date.now()}@devsync.test`;

export function setup() {
  const payload = { name: 'Load Tester', email: EMAIL_HOST, password: 'load-test-password' };
  const headers = { 'Content-Type': 'application/json' };

  const register = http.post(`${BASE_URL}/api/v1/auth/register`, JSON.stringify(payload), { headers });
  check(register, { 'register succeeds': (r) => r.status >= 200 && r.status < 300 });

  const login = http.post(`${BASE_URL}/api/v1/auth/login`, JSON.stringify(payload), { headers });
  check(login, { 'login succeeds': (r) => r.status === 200 });

  const token = login.json('user.token');
  if (!token) {
    throw new Error(`setup() could not obtain a JWT (login HTTP ${login.status})`);
  }
  return { token };
}

// Endpoint mix: the two reads every developer session hits. /reports is
// team-lead/admin only, so it is intentionally not part of the developer mix.
const TARGETS = [
  { name: 'dashboard', path: '/api/v1/dashboard' },
  { name: 'dashboard_client', path: '/api/v1/dashboard/client' },
];

export default function (data) {
  const target = TARGETS[Math.floor(Math.random() * TARGETS.length)];
  const res = http.get(`${BASE_URL}${target.path}`, {
    headers: { Authorization: `Bearer ${data.token}` },
    tags: { name: target.name },
  });

  check(res, { [`${target.name} is 200`]: (r) => r.status === 200 });
  sleep(0.2); // ponytail: fixed think-time; per-endpoint pacing if we ever need ramp shapes
}