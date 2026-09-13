# DevSync on K8s (standing GKE Standard, teardown ≤T+14)

Thin pointer. Full design: `docs/planning/k8s-prod-platform.md` (§16 for Phase 2)
and `docs/planning/k8s-phase2-scaling.md` (v3.0). Standing ops notes live in the
D15 rows below and `k8s-prod-platform.md` §14; no separate runbook file (retired
2026-09-13 — the overlap with these docs was not worth a second artifact).

Standing env: first push-deploy via `k8s-cd.yml` leaves the env up; it stays live
from first deploy to local teardown no later than 14 days after first `apply`
(calendared date). No windows, no destroy workflow.

## Topology

```text
Browser → Ingress (GCE, TLS via Google-managed cert) → FE (nginx x2)
        → BE (Flask ×2, Redis-backed Socket.IO bus :8000)
        → Cloud SQL devsync-db (private IP, managed-db overlay) / in-cluster PG (PR/dev only)
        → devsync-redis (MQ + limiter + presence)
```

- Prod overlay (`k8s/overlays/prod` + `managed-db`): BE ×2 + FE ×2 + Redis in-cluster,
  live host `gcp.devsyncapp.me` (standing, first deploy → teardown).
- PR overlay (`k8s/overlays/pr`): per-`pr-<n>` namespace, no Ingress/certs, port-forward smoke.
- managed-db overlay (`k8s/overlays/managed-db`): stacks on prod, drops the
  in-cluster postgres, `DATABASE_URL` rides the Secret Manager ref → Cloud SQL
  (private IP, sslmode=require). **Applied as of Phase 2 D6.**

## Decisions (Phase 1 D1–D15, Phase 2 D1–D6)

| # | Decision |
| --- | --- |
| D1 | Deployments (FE+BE) + migrate Job only |
| D2 | Phase 2: **BE `replicas: 2`** with Socket.IO rooms cluster-wide through the Redis message queue (`workers=1` per pod stands, ADR 0002 no session affinity) |
| D3 | Frontend `replicas: 2` + dormant HPA (2–6, CPU 60%) |
| D4 | Standing **standard zonal** `us-central1-a` (two regional create attempts died in `GCE_STOCKOUT`), teardown ≤14 days after first apply |
| D5 | TF platform, Kustomize workloads |
| D6 | Migrations via K8s Job, `MIGRATE_ON_BOOT=false` |
| D7 | **Migrated**: standing DB is Cloud SQL `devsync-db` (private IP via managed-db overlay + ESO secret); the in-cluster `postgres.yaml` stays as the PR/dev story |
| D8 | Phase 2 adds in-cluster `devsync-redis` (MQ, shared limiter bucket, presence keys) — first Redis is a standing workload, not Celery; dead deps (celery/supervisor/fastapi/uvicorn) still unpruned (separate cleanup PR) |
| D9 | AR digest-pinned, Trivy gate, cosign keyless + SBOM + SLSA |
| D10 | Namecheap A-record (one-time, after first deploy) + GCE Ingress + Google-managed cert, live first deploy → teardown |
| D11 | WI KSA→GSA, ESO from Secret Manager, PDBs (`minAvailable: 1` BE/FE). NetPol deny-all **declared, not enforced**: the cluster was created without Dataplane V2, so policies are render-validated no-ops (k8s-prod-platform §14 "NetPol declared, not enforced"); the overlay ships the Cloud SQL egress rule so enforcement turns on without an outage |
| D12 | GMP PodMonitoring + `BackendDown` alert + JSON logs (`level` + `severity`) + TF dashboard (`severity>=ERROR` log panel) |
| D13 | Evidence: run links + digests + gif/screenshot anytime up, then local teardown log |
| D14 | Per-PR `pr-<n>` namespaces are **run-scoped** (created, smoked, deleted after the run); the close-event workflow job sweeps leftovers from cancelled runs |
| D15 | Standing env, no windows, no destroy workflow. Teardown (hand-run on the calendared date): `gcloud sql instances delete devsync-db` (deletion protection off by design) → `terraform destroy -target=module.gke` → Namecheap A-record re-point/removal → secrets cleanup. Cost backstop: one-time console budget (Billing → Budgets, $50/mo, thresholds 50/80/100% — the gcloud budget API rejects script creation). Wire posture (watched after Phase 2 audit): `BackendDown` (k8s crash events), `RedisDegraded` (backend failure-open logs), CloudSQL storage > 9 GB, deploy-time k6 gate, TF dashboard CPU + ERROR panel |
| P2-D1 | Rate limiter Redis-backed (`INCR`/`EXPIRE` per client per endpoint, 300/60s; CI bypass env preserved; redis down = in-memory fail-open) |
| P2-D2 | Socket CORS: prod pins cross-origin sockets to `[FRONTEND_URL]`; dev/CI keeps `*` |
| P2-D3 | BE PDB flips `maxUnavailable: 0` → `minAvailable: 1` alongside `replicas: 2` (scheduling check: BE ×2 + FE ×2 + PG + Redis fit the 2–6 e2-small autoscale band with the autoscaler) |
| P2-D4 | `devsync-redis:7-alpine`, 1 replica, emptyDir, ClusterIP; `REDIS_URL` non-sensitive in the ConfigMap; publishes degrade on Redis down, never 500. Memorystore stays **unapplied** per plan D4 (upgrade = REDIS_URL ConfigMap value + PSA egress rule, no redesign) |
| P2-D5 | Presence keys `presence:user:<id>` = `<pod-id>:<sid>` TTL 30s, 10s heartbeat (3:1), graceful leave/disconnect deletes, ghost ceiling ~30s, backfill = REST refetch (ADR 0003) |
| P2-D6 | Cloud SQL `devsync-db` (private IP, `managed-db` overlay applied); in-cluster PG becomes dev/PR |

## Runs

- Push-deploy (`k8s-cd.yml` on push to `main`): standing pipeline — MySQL cut to
  managed-db overlay path; warmup asserts `ready=2 && total=2` backend pods.
- k6 verify (`--vus 3 --duration 30s`, p95<500ms p99<1000ms <1% fail) runs on
  every deploy.

No `k8s-destroy.yml` — teardown is a local hand-run checklist (D15 row above).

## Images

- Backend: _TODO — `REGION-docker.pkg.dev/PROJECT/devsync-repo/devsync-backend@sha256:<digest>`_
- Frontend: _TODO — `REGION-docker.pkg.dev/PROJECT/devsync-repo/devsync-frontend@sha256:<digest>`_

Digest-pinned two ways to the same result: CD (`k8s-cd.yml`) uses `kustomize edit set image`; local deploys use the `make k8s-up` render-pipe (its guard refuses `:latest` placeholders without `BACKEND_DIGEST`/`FRONTEND_DIGEST`).

Verify (reviewer line, plan §5.1):

```bash
cosign verify --certificate-identity-regexp 'https://github.com/<org>/DevSync.*' --certificate-oidc-issuer https://token.actions.githubusercontent.com <img>@<digest>
```

## Evidence

- Live gif: `docs/demo/k8s-live.gif` — _TODO, captured anytime the standing env is up (login → task update → realtime broadcast)_
- Dashboard: `docs/demo/k8s-dashboard.png` — _TODO, GMP screenshot anytime the standing env is up_
