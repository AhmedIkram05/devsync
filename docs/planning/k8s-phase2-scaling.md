# DevSync K8s Phase 2 — Permanent Production Hardening

**Document Type:** Phase Plan (implementation-ready)
**Status:** v3.0 permanent-work-only (2026-09-13 — v2.0's load-day/chaos/window apparatus deleted per owner call)
**Parent:** `k8s-prod-platform.md` (Phase 1 COMPLETE — §10 all checked + §13 as-built A1–A13)
**Builds on:** ADRs in `adr/` (0001–0004; 0004's synthetic trigger retired with the load day)
**Env lifecycle (owner call 2026-09-13):** standing until credits run out. No teardown date. Billing alerts at 50/80% are the backstop.

**Doctrine:** the repo is the product, the env is just where it happens to run. Everything below lands as permanent, reviewable repo state — code with tests, manifests with reasons, docs that describe reality. No one-time runs, no chaos battery, no windows, no gifs.

**What changes in one sentence:** one MQ line + in-cluster Redis + presence/heartbeat + `replicas: 2` + Cloud SQL for real, all as normal engineering with standing tests.

---

## 0. Baseline this deltas from (proven, don't re-prove)

- Singleton baseline measured: A11 broadcast proof (polling + websocket + port-forward), A13 k6 3VU/30s green at 250/250, p95 232ms / p99 447ms.
- FE image already builds with `both` — the real default, not a special build.
- `managed-db` overlay reviewed-but-unapplied; `BackendDown` alert fixed to the `k8s_pod` filter; PDB drain-denied proven.
- Platform: Standard GKE zonal `us-central1-a`, e2-small pool autoscale 2–6 (code truth — the "2–4" in the §13 A-table is stale, fix the comment in passing), `prod` overlay live, stored-key cosign, k6 verify `--vus 3 --duration 30s`, ~$4–5/day standing.

## 1. Locked decisions (permanent)

### D1 — Rate limiter goes Redis-backed

Per-pod `defaultdict` buckets (`backend/src/api/middlewares/rate_limiter.py:12-14`) silently double every client's budget at `replicas: 2`. Move counters to Redis (`INCR` + `EXPIRE` per client-per-endpoint bucket, same 300/60s shape, same `RATE_LIMIT_REQUESTS_PER_WINDOW=0` CI bypass). No new package beyond pinned `redis==5.0.1`; small wrapper around the existing decorator, same 429 JSON.

Failure mode spec (decided now): Redis down = limiter **fail-open with log**, same posture as today's throttle-disabled CI shape. Never fail-closed into a self-outage.

### D2 — Socket CORS tightened

`SocketIO(cors_allowed_origins="*")` (`backend/src/socketio_server.py:13,299`) → `[FRONTEND_URL]` in production (K8s already sets `https://gcp.devsyncapp.me`). Dev/compose keeps existing behavior via a `FLASK_ENV` conditional — LAN regexes and test clients untouched. Cross-origin socket connect from a non-frontend origin must be rejected in prod (DoD box).

### D3 — PDB + scheduling check

BE PDB `maxUnavailable: 0` → `minAvailable: 1` at `replicas: 2` (the zero setting is singleton language; carried over it over-blocks evictions). FE PDB unchanged. Before scaling: scheduling check — sum of BE (250m/256Mi) × 2 + FE × 2 + PG + Redis against e2-small capacity. Fails in minutes instead of pending pods.

### D4 — Redis posture (permanent, honest)

In-cluster `redis:7-alpine`, `replicas: 1`, emptyDir, ClusterIP `devsync-redis:6379`. Contents are pub/sub transit + presence TTLs, all reconstructible — persistence would be theatre, and a single replica is a documented SPOF, not a hidden one. NetPol: allow BE→redis `6379` (same pattern as BE→PG `5432`); nothing else opens. URL is non-sensitive cluster DNS → ConfigMap, not ESO. Memorystore stays an **unapplied overlay patch** — standing managed Redis on expiring credits for zero users is indefensible spend; the overlay exists so the upgrade path is a patch application, not a redesign.

If the MQ publish path raises on Redis-down instead of degrading, wrap it so failure degrades to per-pod rather than 500ing. One guard, permanent.

### D5 — Presence contract (exact)

- Key `presence:user:<id>` → value `<pod-id>:<sid>`, `SETEX 30s`.
- Client sends `heartbeat` every 10s; server refreshes TTL on `register`, `heartbeat`, and any room action (3:1 TTL-to-beat ratio survives one dropped beat without flapping).
- Graceful `leave`/`disconnect` deletes the key. Pod death expires it.
- Worst-case ghost-online window ~30s — documented ceiling.
- No sequence IDs, no replay buffer (ADR 0003 holds); backfill stays client REST refetch (already the recovery path in `NotificationContext.jsx`).

### D6 — Cloud SQL for real

Provision a small Cloud SQL Postgres instance (size at apply time, actual cost recorded in COST.md), private IP, point prod at it via the `managed-db` overlay (annotation-first; Cloud SQL Auth Proxy sidecar only if private IP fails on Standard — pre-accepted, not a redesign). In-cluster Postgres becomes the dev/PR story. Standing cost, tracked monthly — a real production database is the point, not a window receipt.

## 2. Backend code changes (all of them — nothing else touches `backend/src`)

1. MQ line: `SocketIO(..., message_queue="redis://devsync-redis:6379/0")` in both the module constructor (`socketio_server.py:13`) and `init_socketio` (`:297-300`). D2 CORS conditional rides in the same edit.
2. Presence/heartbeat per D5 contract (~10 lines).
3. Emit-path `_membership_denied` re-check on `task_update` / `comment_added` / `project_updated` + post-reconnect rejoin (today only `join_project` checks — any connected client can emit to any room name). One guard in the shared path, not per-caller patches.
4. Redis-backed limiter per D1 (CI bypass preserved).
5. No session affinity (ADR 0002 holds — GCE Ingress stays as-is).

## 3. Scale (only after the MQ line)

- Backend `replicas: 2`. Not before — second replica without MQ split-brains rooms (`backend-deployment.yaml:10-12` comment).
- `workers` stays 1 per pod (gevent long-lived connections — scale pods, not workers).
- FE HPA stays as-is (min 2 / max 6, CPU 60% — FE is stateless, nothing to prove).
- Backend HPA stays rejected until a better-than-CPU metric is proven.

## 4. Standing tests (practices, not events)

- Existing k6 3VU/30s verify in `k8s-cd.yml` stays green, thresholds unchanged (p95<500ms, p99<1000ms, <1% fail).
- New: socket smoke test in CI — two clients, join → task/comment/project emits → leave → disconnect, run **across pods** once `replicas: 2` lands (extends the existing `test_auth_socket_dashboard_integration.py` shape, polling + websocket). This is the permanent replacement for the retired load day: a standing test beats a scheduled event.
- Two-client broadcast proof (A11 shape) re-run across pods after the MQ line, once, as a merge receipt — then the CI smoke test owns it forever.

## 5. Observability delta

- `BackendDown` unchanged (infra signal, decoupled from k6 by construction).
- No `/metrics` endpoint, no PodMonitoring resurrection unless an app metric actually ships.
- RUNBOOK gains: Redis failure, MQ troubleshooting, PDB-at-2 notes.

## 6. Cost

- Standing ~$4–5/day (Standard control plane $0.10/hr) **until credits run out** — no teardown date. Billing alerts 50/80% are the entire cost control.
- Adds: small standing Cloud SQL instance (estimate at apply time, actuals in COST.md). Everything else in this plan is within the existing node pool.
- Memorystore stays unapplied (D4).

## 7. Non-goals (stay cut)

Session affinity, backend HPA on CPU, per-event sequence IDs, cert-manager/LE changes, ArgoCD/Helm, dead-dep prune (separate cleanup PR — `celery`/`supervisor`/`fastapi`/`uvicorn` pinned but unimported), Binary Authorization enforcement (signatures already verifiable).

## 8. DoD

- [ ] MQ line applied; `replicas: 2` live; rooms don't split (two-client proof across pods, polling + websocket, then CI smoke owns it).
- [ ] Shared limiter budget verified across 2 pods; socket CORS rejects non-frontend origins in prod; dev/compose unaffected.
- [ ] Presence per D5: kill-a-pod → key expires ≤30s; backfill via REST after reconnect.
- [ ] Socket smoke test green in CI.
- [ ] Cloud SQL provisioned, prod pointed at it via `managed-db` overlay, in-cluster PG documented as dev/PR story, cost line in COST.md.
- [ ] `docs/k8s.md` updated (teardown procedure documented for the day credits run low — no date attached).
- [ ] README rewritten (separate pass, after the above lands - documents reality, not aspirations).

## 9. Build order

1. Scheduling check (D3) + Cloud SQL provisioning (D6 — longest lead time, start first).
2. Redis manifest + NetPol + ConfigMap URL (D4).
3. MQ line + CORS conditional + presence/heartbeat + emit-path re-check (§2.1–2.3).
4. Redis-backed limiter (CI bypass preserved).
5. PDB flip + `replicas: 2` + socket smoke test in CI.
6. Cross-pod broadcast receipt → docs/cost/runbook → README rewrite.

## 10. Honesty footer

"Production-grade" here means the repo owns every practice it claims: scaling unlocked by one MQ line with a standing test proving it, real managed Postgres, shared limits that hold across pods, tight socket CORS, documented tradeoffs (single-replica Redis, no backend HPA) with named upgrade paths. No theatre — everything claimed is reviewable in code.

Interview line: *"I built the platform the way I'd want to inherit it — every scaling decision is one reviewable diff with a standing test, the database is managed, and the README describes what's actually there."*
