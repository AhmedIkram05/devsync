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
    // Latency ceilings sized for the CI stack (single gevent worker, shared
    // runner). Production SLOs (p95 < 300ms / p99 < 800ms) belong to a
    // production-like environment. Local P95 measured at ~42-87ms, so 500ms
    // still admits ~6-10x CI noise before failing.
    // Note: k6 does not export p(99) in --summary-export, so check_baseline.py
    // tracks p95 only; this p99 threshold still gates the run in CI.
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
  },
};

// load-test@devsync.test-style throwaway accounts; one per setup() call so
// parallel/rerun jobs never collide.
const EMAIL_HOST_NAME = 'devsync.test';

export function setup() {
  const headers = { 'Content-Type': 'application/json' };
  // Transient setup failures (a blip on a shared runner, a busy gevent worker)
  // must not flake a 15-minute pipeline job: retry a few times, fresh identity
  // per attempt.
  let lastRegister = -1;
  let lastLogin = -1;
  for (let attempt = 0; attempt < 3; attempt++) {
    const payload = { name: 'Load Tester', email: `load-${Date.now()}-${attempt}@${EMAIL_HOST_NAME}`, password: 'load-test-password' };
    const register = http.post(`${BASE_URL}/api/v1/auth/register`, JSON.stringify(payload), { headers });
    lastRegister = register.status;
    check(register, { 'register succeeds': (r) => r.status >= 200 && r.status < 300 });

    const login = http.post(`${BASE_URL}/api/v1/auth/login`, JSON.stringify(payload), { headers });
    lastLogin = login.status;
    check(login, { 'login succeeds': (r) => r.status === 200 });

    const token = login.json('user.token');
    if (token) {
      return { token };
    }
    sleep(1); // back off between attempts
  }
  throw new Error(`setup() could not obtain a JWT after 3 attempts (register HTTP ${lastRegister}, login HTTP ${lastLogin})`);
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