# DevSync on K8s (standing GKE Standard, teardown ≤T+14)

Thin pointer. Full design: `docs/planning/k8s-prod-platform.md` §§5.5/6/8/10/11 (v1.9).

Standing env: first push-deploy via `k8s-cd.yml` leaves the env up; it stays live
from first deploy to local teardown no later than 14 days after first `apply`
(calendared date). No windows, no destroy workflow.

## Topology

```text
Browser → Ingress (GCE, TLS via Google-managed cert) → FE (nginx x2) → BE (Flask singleton :8000) → PG (in-cluster standing env) / managed (Cloud SQL overlay, unapplied)
```

- Prod overlay (`k8s/overlays/prod`): in-cluster `postgres:16`, live host `gcp.devsyncapp.me` (standing, first deploy → teardown).
- PR overlay (`k8s/overlays/pr`): per-`pr-<n>` namespace, no Ingress/certs, port-forward smoke.
- managed-db overlay (`k8s/overlays/managed-db`): prod shape — drops `postgres.yaml`, `DATABASE_URL` stays a Secret Manager ref pointed at Cloud SQL. Reviewed but **never applied** (no live DB).

## Decisions D1–D15

| # | Decision |
| --- | --- |
| D1 | Deployments (FE+BE) + migrate Job only |
| D2 | Backend `replicas: 1` singleton (Socket.IO rooms in-memory, `workers=1`) |
| D3 | Frontend `replicas: 2` + dormant HPA (2–6, CPU 60%) |
| D4 | Standing **standard zonal** `us-central1-a` (two regional create attempts died in `GCE_STOCKOUT`; single-zone control plane acceptable for ≤14 days), teardown ≤14 days after first apply (~$1–3/day idle) |
| D5 | TF platform, Kustomize workloads |
| D6 | Migrations via K8s Job, `MIGRATE_ON_BOOT=false` |
| D7 | In-cluster Postgres DB (standing env); promotion path is the managed-db overlay, unapplied by design |
| D8 | No Redis/Celery in v1 (dead deps) |
| D9 | AR digest-pinned, Trivy gate, cosign keyless + SBOM + SLSA |
| D10 | Namecheap A-record (one-time, after first deploy) + GCE Ingress + Google-managed cert, live first deploy → teardown |
| D11 | WI KSA→GSA, ESO from Secret Manager, NetPol deny-all, PDBs |
| D12 | GMP PodMonitoring + `BackendDown` alert + JSON logs (`level` + `severity`) + TF dashboard (`severity>=ERROR` log panel) |
| D13 | Evidence: run links + digests + gif/screenshot anytime up, then local teardown log |
| D14 | Per-PR `pr-<n>` namespaces, GC on close |
| D15 | Standing env, no windows, no destroy workflow; teardown is local `kubectl delete ns pr-<leftover>` → `terraform destroy -target=module.gke` by hand on the calendared date; 50/80% billing alerts are the backstop |

## Runs

- Push-deploy (`k8s-cd.yml` on push to `main`, replaces `k8s-demo.yml`): _TODO — link run after first deploy_
- PR run (`k8s-pr.yml`, `pr-<n>` smoke): _TODO — link run after first PR env_

No `k8s-destroy.yml` — teardown is a local RUNBOOK checklist (see `RUNBOOK.md`).

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
