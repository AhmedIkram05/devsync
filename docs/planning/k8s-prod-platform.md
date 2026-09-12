# DevSync K8s Prod Platform — Full-Stack on Ephemeral GKE Autopilot

**Document Type:** Phase Plan (implementation-ready)
**Status:** Draft v1.9 (v1.8 − `k8s-destroy.yml`: teardown is a local command + calendar entry, no destroy workflow)
**Parent:** `README.md` + `docs/deep-dives.md` (ECS/RDS/ALB validated, torn down to $0; Terraform not yet committed — console-provisioned, walkthrough in `docs/demo`)
**Builds on:** ADRs in docs/adr/(0001-0004)
**Dependencies:** Compose stack (`docker-compose.local.yml` + `docker-compose.local-postgres.yml`), `Makefile`, CI (`ci.yml` 8 path-aware jobs + k6 gate), CD (`cd.yml` ECS+S3 OIDC), 12-table Postgres + Alembic, Socket.IO rooms
**Non-goals:** Replacing proven ECS path. Standing cluster. Backend HPA in v1 (rooms are in-memory until MQ — §12). Service mesh / GitOps operator. Redis/Celery deployment in v1 (dead deps — see D8; Phase 2 wires `message_queue`).

---

## 0. Scope — build now vs leave alone

**BUILD NOW (entire v1 — execution is agentic, so time is not the constraint):**

- P0 images + full D9 (Trivy gate, cosign keyless sign, SBOM attest, SLSA provenance)
- P1 TF platform (`modules/gke` + `backend_runner` IAM)
- P2 all manifests + `demo` + `pr` overlays — D14 per-PR namespaces included
- `managed-db` overlay as reviewed-but-**unapplied** patch (no live DB provisioned)
- P4 one automated workflow, house shape (locked 2026-09-11): `k8s-cd.yml` on push to `main` (paths-filtered) + dispatch — build → sign → apply → migrate → deploy → verify, env **stays up**. No manual live workflow, no teardown inputs, no windows, no destroy workflow — same shape as the house `cd.yml`/`deploy.yml` files. Principle: **permanent pipeline, temporary environment** — the pipeline lives in git forever and can resurrect everything; the env dies by a local `terraform destroy` on the calendared date. `k8s-pr.yml` unchanged (GC on close). (On-disk `k8s-demo.yml` is replaced by `k8s-cd.yml` at build.)
- P3 full (PodMonitoring + `BackendDown` forced-failure canary)
- Production-grade pass (locked 2026-09-10, DNS simplified 2026-09-10, two promotions 2026-09-10): ESO secrets from Secret Manager, Namecheap A-record (`gcp.devsyncapp.me`) + Google-managed TLS, PDBs, GMP dashboard + JSON logs, FE HPA manifest (dormant in v1, $0), K8s FE image built with `REACT_APP_SOCKET_TRANSPORT=both`
- Push-to-`main` CD → live URL → gif → local teardown → `docs/k8s.md` + COST.md + RUNBOOK.md
- Pre-execution requirements (human, CLEARED 2026-09-10): card on file yes; destroy commitment = local `terraform destroy -target=module.gke` run by hand no later than 14 days after first `apply` (exact date calendared at standup; nothing enforces it — billing alerts at 50/80% are the backstop, per owner call 2026-09-11); domain `devsyncapp.me` (Namecheap, confirmed controlled) → live host `gcp.devsyncapp.me` via manual A-record. Stale AWS records at apex/www/api left untouched.

**LEAVE ALONE (§12 Phase 2 — gated on v1 receipts, not on effort):**

- `message_queue` wiring, in-cluster Redis, backend `replicas > 1`, presence/backfill code
- Synthetic load day (N=50/500) with FE HPA scale event (manifest already in v1 — the *event* is the proof) + chaos gif, Memorystore (paper overlay only)
- One real Cloud SQL window (`db-f1-micro`, created + destroyed inside the load-day run) as the managed-DB baseline
- Gate: v1 DoD (§10) fully checked first — the load day needs a v1 baseline to compare against

---

## 1. Objective

Run DevSync as a **portable, cheap, reproducible full-stack K8s deployment** while leaving the validated ECS+S3 path intact:

- `frontend/` nginx image + `backend/` Flask image deploy as-is (no Dockerfile rewrite) → AR, digest-pinned, Trivy-gated, **cosign-signed + SBOM-attested + SLSA provenance (CI-only, $0)**
- Backend `Deployment replicas: 1` (Socket.IO in-memory rooms + `gunicorn.conf.py workers = 1` — scaling breaks rooms; real scaling is Phase 2, §12)
- Frontend `Deployment replicas: 2` stateless + ClusterIP Services + Ingress with **live HTTPS on a real hostname** (`gcp.devsyncapp.me` + Google-managed cert, live from first deploy to teardown — evidence-over-uptime)
- **Per-PR ephemeral namespaces** (`pr-<n>` on the same demo cluster): smoke + Cypress + k6 against K8s per PR, GC'd on close — $0 extra infra
- Migrations via K8s `Job` (not entrypoint race); demo Postgres in-cluster ephemeral; prod overlay points `DATABASE_URL` at managed DB (Cloud SQL/RDS pattern reused from WikiStream Service+Endpoints lesson)
- Ephemeral zonal Autopilot (`us-central1-a`) — `terraform apply` to demo, `terraform destroy -target=module.gke` to $0
- TF owns platform, `kubectl apply -k` owns workloads (WikiStream v4 lesson, SWE-Qwen D4)

This is the **third and only user-facing** K8s plan in the series: WikiStream = singleton consumer + CronJobs (no Ingress), SWE-Qwen = eval Jobs (no Ingress), DevSync = Deployments + Ingress (first live-service story).

---

## 2. Inputs (verified in repo)

| Source | Artifact | Location |
| --- | --- | --- |
| App | `create_app()` returns `(app, socketio)`; `/health` → `{"status":"ok"}` 200; `/` string; Swagger `/api/docs` + `/api/swagger.yaml` | `backend/src/app.py:31,231-235` |
| App | JWT cookie `Secure`/`SameSite` auto-logic, `JWT_COOKIE_CSRF_PROTECT=False`, dual cookie+bearer, `public_routes` list, CORS explicit origins + LAN regexes | `backend/src/app.py:63-207` |
| App | Config requires `DATABASE_URL` PG in non-testing (SQLite rejected), auto `sslmode=disable` local / `require` remote | `backend/src/config/config.py:47-87` |
| Realtime | In-memory `connected_users/project_rooms/sid_users` dicts; JWT handshake; server-side `_membership_denied` before `join_room`; broadcasts `to=f"project_{id}"` | `backend/src/socketio_server.py:16-19,151-191` |
| Serve | `wsgi.py` exposes `app` for gunicorn; `gunicorn.conf.py`: bind `0.0.0.0:8000`, `workers=1` ("best with 1 unless message queue"), `GeventWebSocketWorker`, timeout 120 | `backend/src/wsgi.py`, `backend/gunicorn.conf.py` |
| Boot | `entrypoint.sh`: `flask_migrate upgrade` on every boot → K8s race with >1 replica (hence migrate Job, §5.3) | `backend/entrypoint.sh:4-12` |
| Image BE | Multi-stage `python:3.11-slim`, build deps in build stage only (~330MB), non-root `devsync` user, `ENTRYPOINT entrypoint.sh`, `EXPOSE 8000` | `backend/Dockerfile` |
| Image FE | `node:20-alpine` build → `nginx:1.27-alpine` serve; `nginx.conf.template` proxies `/api/` + `/socket.io/` (WS upgrade, 86400s read timeout) to `${API_UPSTREAM}`, SPA fallback, gzip, security headers | `frontend/Dockerfile`, `frontend/nginx.conf.template` |
| Compose | `backend` (8000, healthcheck urllib `/`, `depends_on` postgres healthy) + `frontend` (`API_UPSTREAM=http://backend:8000`, depends backend healthy) + `devsync-postgres: postgres:16` + volume + `pg_isready` | `docker-compose.local.yml`, `docker-compose.local-postgres.yml` |
| Deps | `requirements.txt`: Flask 2.3.3, socketio 5.3.1, SQLAlchemy 2, gunicorn 22 + gevent 23.9 + gevent-websocket, **celery 5.3.6 + redis 5.0.1 + supervisor + fastapi + uvicorn present but unused in `src/`** → dead deps, no Redis in v1 (Phase 2 wires it, §12) | `backend/requirements.txt`, rg `celery\|message_queue\|redis` in `backend/src` = no hits |
| CI | 8 path-aware jobs: ruff+ESLint, pip-audit+npm audit, pytest unit+integration, docker build, Jest, Cypress E2E (gunicorn + serve), k6 gate (10 VU 30s, P95≤500ms/P99≤1s/<1% + committed baseline), Codecov | `.github/workflows/ci.yml` |
| CD | `cd.yml` OIDC → ECR push → ECS rolling + Secrets Manager ARNs (`DATABASE_URL`, JWT, GitHub ID/secret) → verify OAuth config → S3 sync + CloudFront invalidate | `.github/workflows/cd.yml` |
| Infra | No K8s/TF in repo (rg `k8s\|terraform\|gke` = empty). Prod was console-provisioned (README transparency note), now torn down ($0). **This plan introduces the first IaC.** | `README.md:101,126` |

---

## 3. Decisions Locked

| # | Decision | Choice | Why |
| --- | --- | --- | --- |
| D1 | K8s scope | **Deployments (FE+BE) + migrate Job only** | User-facing service, not batch: Jobs/CronJobs (SWE-Qwen/WikiStream) don't apply. DB stays outside durable K8s in prod (same rule as WikiStream CH-on-VM). |
| D2 | Backend replicas | **`replicas: 1` singleton by design** | `socketio_server.py` rooms live in process memory; `gunicorn.conf.py` pins `workers=1` "unless message queue". Replica 2 = split-brain rooms + duplicate emits. HPA/KEDA rejected for v1 (WikiStream 0013 lesson: autoscaling stateful-singleton duplicates ingress). Interview line: *"singleton because rooms are in-memory; scale comes after Redis message_queue, not before — see §12."* |
| D3 | Frontend replicas | **`replicas: 2` + HPA manifest (min 2 / max 6, CPU 60%)** | Stateless nginx; survives pod recycle during demo. Only scaled object in v1; the HPA never fires in v1 (no load) — dormant proof of autoscale readiness at $0. |
| D4 | Cluster | **Ephemeral zonal Autopilot `us-central1-a`** | Series standard (WikiStream v4, SWE-Qwen D3): no node mgmt, per-project, `destroy` to $0. No cross-project refs. |
| D5 | Split | **TF platform, Kustomize workloads** | `infra/terraform/modules/gke/` vs `k8s/` — platform vs app lifecycle. No `kubernetes_manifest` for workloads. |
| D6 | Migrations | **K8s `Job` (`flask_migrate upgrade`), `MIGRATE_ON_BOOT=false` in K8s** | `entrypoint.sh` migrates on every boot — safe at `replicas:1` but races the moment anyone scales; Job is the honest pattern and proves the skill. Compose path untouched. |
| D7 | Demo DB | **In-cluster `postgres:16` StatefulSet, explicitly demo-only** | Managed DB per ephemeral demo = slow + $$$ for a portfolio teardown. Stateful rule (WikiStream) protects *durable* data; demo data is throwaway by design — documented, destroyed with cluster. Prod overlay patches `DATABASE_URL` to managed (Service+Endpoints pattern from WikiStream §5). Phase 2 (§12) runs one real Cloud SQL window as the managed-DB baseline. |
| D8 | Redis/Celery | **Not deployed in v1** | `celery`+`redis`+`supervisor`+`fastapi` in requirements are unused (zero imports in `src/`). Deploying Redis for dead code is theatre. Phase 2 (§12) wires `SocketIO(message_queue="redis://...")` + real Celery tasks first, then Redis ships. |
| D9 | Image/supply chain | **AR, digest-pinned, Trivy HIGH/CRITICAL gate + cosign keyless sign + Syft SBOM attest + SLSA provenance (all CI-only, $0)** | Reuse existing Dockerfiles as-is (multi-stage already good, non-root BE already). No rewrite. cosign keyless via GitHub OIDC — no keys to manage; SBOM attested alongside signature; SLSA generator reusable workflow. Free senior signal, zero cluster cost. Binary Authorization enforcement deferred (needs standing cluster policy; signatures already verifiable via `cosign verify`). |
| D10 | Ingress + DNS/TLS | **Namecheap A-record + GCE Ingress + Google-managed certificate; standing `gcp.devsyncapp.me` host, live from first deploy to teardown** | Real hostname, no Cloud DNS zone (NS migration for a time-boxed demo is theatre): after the Ingress IP resolves, a manual 2-min A-record update in Namecheap (one-time step after first deploy, §5.5) points `gcp.devsyncapp.me` at it; `ManagedCertificate` provisions automatically (~10–20 min, once). Stale AWS records (apex/www/api) untouched. No cert-manager, no LE rate-limit roulette. Cookie `Secure` auto-logic flips correctly under HTTPS (existing code). Port-forward stays as fallback verification. |
| D11 | Hardening | **WI KSA→GSA, ESO from Secret Manager, Quota/LimitRange, NetPol default-deny, non-root + seccomp, PDBs** | Series standard + prod-grade secrets (values live in Secret Manager, never in TF state or manifests). FE nginx runs as non-root in v1 via `runAsUser: 101`. PDBs: FE `minAvailable: 1`, BE `maxUnavailable: 0` (documents the singleton constraint in scheduling terms — evictions can't take the only backend). |
| D12 | Observability | **GMP PodMonitoring + log alert `BackendDown` + TF-managed GMP dashboard + JSON log format, all decoupled from k6/`/health` app gate** | Infra alert ≠ app SLO (WikiStream 0014 lesson: wedged pods can't write `pipeline_health 0`). JSON logs via ~15-line stdlib `Formatter` subclass (no new dep) so GMP log panels can filter by level. Dashboard (`google_monitoring_dashboard` in TF): pod CPU/restarts, `BackendDown` alert status, log-panel widget — screenshot is a receipt. k6 stays in CI where it already gates — and also runs against the live URL in CD verify (§5.5). |
| D13 | Evidence | **Repo artifacts + live run links + demo gif, then teardown log** | Upgrade from SWE-Qwen §8 (no live URL): standing live URL gives Cypress/k6-against-K8s proof + `docs/demo/*.gif` screen capture; destroy log closes the loop. |
| D14 | Per-PR envs | **Ephemeral namespace `pr-<n>` on the same demo cluster; smoke + k6, GC on PR close** | "Every PR gets a K8s env" with $0 extra infra — namespaces share the ephemeral cluster. Workflow `pull_request` (labeled or `paths:`-gated) deploys overlay `pr`, comments the smoke result, deletes the namespace on `closed`. Stronger hiring story than one shared staging env. |
| D15 | Env lifecycle | **Standing env between push and teardown; live from first deploy, no windows, no destroy workflow** | Push-to-`main` CD leaves the env up (idle burn ≈ $1–3/day, target teardown ≤14 days after first apply → ~$15–40 standing). The URL is live for the whole standing period — no manual live workflow, no window bookkeeping. Teardown is a local `terraform destroy -target=module.gke` run by hand on the calendared date; nothing automated enforces it — the 50/80% billing alerts are the backstop (owner call 2026-09-11: a destroy workflow's manual button is ceremony, and the schedule guard went with it). The pipeline is permanent; the env is temporary — that split is the whole design. |

Rejected: backend HPA in v1 (breaks rooms — §12 instead), in-cluster PG as "prod" (dishonest — labelled demo-only), Redis for unused Celery in v1, ArgoCD/Helm v1 (graduate when team>3), Binary Authorization enforcement (needs standing policy; signatures already shipped + verifiable), permanently standing live URL past T+14 (uncapped bleed; the window + T+14 cap gives the proof with a ceiling), cert-manager + nip.io (superseded: real subdomain + Google-managed cert at $0; nip.io fallback dropped — domain confirmed), Cloud DNS zone (NS delegation for a 2h window; a Namecheap A-record does the job at $0), TF-state `kubernetes_secret` (secret values sit in state; ESO keeps them in Secret Manager), destroy workflow (manual button is ceremony around a one-line local command; schedule guard cut per owner call 2026-09-11 — teardown is a calendar entry + billing-alert backstop).

---

## 4. Module Structure (new files only)

```
infra/terraform/modules/gke/{main.tf,variables.tf,outputs.tf}
infra/terraform/modules/iam/backend_runner.tf   # add-on (+ roles/secretmanager.secretAccessor on the demo secrets)
infra/terraform/dashboard.tf                    # google_monitoring_dashboard (GMP widgets, §5.4)
infra/terraform/main.tf                         # wire module.gke (first TF in repo)
k8s/base/{namespace.yaml,serviceaccount.yaml,configmap.yaml,clustersecretstore.yaml,externalsecret.yaml,backend-deployment.yaml,frontend-deployment.yaml,horizontalpodautoscaler.yaml,poddisruptionbudget.yaml,service-backend.yaml,service-frontend.yaml,ingress.yaml,managedcertificate.yaml,migrate-job.yaml,postgres.yaml,resourcequota.yaml,limitrange.yaml,networkpolicy.yaml,podmonitoring.yaml,kustomization.yaml}
k8s/overlays/demo/{kustomization.yaml,patch-db-demo.yaml,patch-ingress-host.yaml}   # live host + ManagedCertificate name
k8s/overlays/pr/{kustomization.yaml,namespace-pr.yaml}                              # bases ../base, namespace pr-<n> via kustomize edit
k8s/overlays/managed-db/{kustomization.yaml,patch-database-url.yaml}                # prod shape, no live DB committed
.github/workflows/k8s-cd.yml           # on: push to main (paths: backend/frontend/k8s/infra) + dispatch: build → sign → apply → migrate → deploy → verify vs live URL; env stays up, no destroy job, no manual inputs (replaces on-disk k8s-demo.yml at build)
.github/workflows/k8s-pr.yml         # pull_request: namespace pr-<n> → smoke → comment → GC on close
docs/k8s.md          # thin pointer: diagram + D-table + run links + gif
docs/demo/k8s-live.gif  # screen capture against the live URL (login → task update → realtime broadcast)
COST.md
RUNBOOK.md           # make targets incl. standing-env checklist
```

No changes to `backend/src/*` (except `logging_config.py`, §5.4), compose, `Makefile`, `ci.yml`/`cd.yml` except additive workflows + `kubeconform` step. Only Dockerfile touch in v1 is the 2-line transport `ARG/ENV` (§5.3 — ECS default unchanged). cosign/Syft/SLSA are workflow steps only — no repo runtime dependency.

---

## 5. Work Breakdown

### 5.1 P0 — Images (reuse, no rewrite) + free supply chain

```bash
# Backend + frontend build from existing Dockerfiles
docker build -t REGION-docker.pkg.dev/PROJECT/devsync-repo/devsync-backend:$(git rev-parse --short HEAD) ./backend
docker build -t REGION-docker.pkg.dev/PROJECT/devsync-repo/devsync-frontend:$(git rev-parse --short HEAD) ./frontend
trivy image --severity HIGH,CRITICAL --exit-code 1 <both>
# push, record digests for kustomize edit set image
```

Supply chain (CI-only, $0 — runs in `k8s-cd.yml` / `k8s-pr.yml` after push):

```yaml
- uses: sigstore/cosign-installer@v3
- run: cosign sign --yes REGION-docker.pkg.dev/PROJECT/devsync-repo/devsync-backend@${{ digest }}  # keyless via GitHub OIDC
- uses: anchore/sbom-action@v0  # Syft SBOM
- run: cosign attest --yes --predicate sbom.spdx.json --type spdx ...
- uses: slsa-framework/slsa-github-generator/.github/workflows/generator_container_slsa3.yml@v2  # provenance
```

Verify line for reviewers: `cosign verify --certificate-identity-regexp 'https://github.com/<org>/DevSync.*' --certificate-oidc-issuer https://token.actions.githubusercontent.com <img>@<digest>`. DoD: both images signed + SBOM attached + provenance linked in run summary.

Note for reviewers: `python:3.11-slim` + `nginx:1.27-alpine` are not digest-pinned upstream in Dockerfiles v1 (matches current ECS path); **deployed** images are digest-pinned via `kustomize edit set image ...@sha256:<digest>`. Pin upstream `FROM` SHAs as follow-up (one line each, no rebuild logic change).

### 5.2 P1 — TF platform `modules/gke` (first IaC in repo)

```hcl
# infra/terraform/modules/gke/main.tf
resource "google_container_cluster" "devsync" {
  name                = "devsync-${var.environment}"
  location            = var.zone  # default us-central1-a
  enable_autopilot    = true
  deletion_protection = false
  release_channel { channel = "REGULAR" }
  workload_identity_config { workload_pool = "${var.project_id}.svc.id.goog" }
  resource_labels = var.labels
}
```

`variables.tf`: `project_id, region, zone=default us-central1-a, environment, labels`. `outputs.tf`: `cluster_name, endpoint`.
**IAM add-on** `modules/iam/backend_runner.tf`: GSA `devsync-runner` + WIF binding `serviceAccount:PROJECT.svc.id.goog[devsync/devsync-ksa]`; least-privilege: `roles/logging.logWriter`, `roles/monitoring.metricWriter`, `roles/artifactregistry.reader`, `roles/secretmanager.secretAccessor` (scoped to the demo secrets only) (+ `roles/cloudsql.client` only in `managed-db` overlay, not demo).
Wire `module "gke"` in root `main.tf`. Commands: `init/plan/apply`, `gcloud container clusters get-credentials devsync-demo --zone us-central1-a`.

**DNS (manual Namecheap step, no TF):** `gcp.devsyncapp.me` A-record → Ingress LB IP, updated by hand in the Namecheap dashboard once after the first deploy (TF can't know the Ingress IP at plan time, and a Cloud DNS zone + NS migration for a time-boxed demo is theatre). The record stays for the env lifetime; stale AWS records (apex/www/api/ACM) are never touched.

**Dashboard (`infra/terraform/dashboard.tf`):** one `google_monitoring_dashboard` with four tiles — BE/FE pod CPU, container restart count, `BackendDown` alert status, error-level log panel (works because logs are JSON, §5.4). TF-managed so `destroy` removes it; screenshot archived as a receipt.

### 5.3 P2 — Kustomize workloads

- `namespace.yaml`: `devsync`. `serviceaccount.yaml`: `devsync-ksa` annotated `iam.gke.io/gcp-service-account`.
- `configmap.yaml` (non-sensitive only): `FLASK_ENV=production`, `FRONTEND_URL` (set to live `https://gcp.devsyncapp.me` via overlay patch), `GITHUB_REDIRECT_URI`, `MIGRATE_ON_BOOT=false`, `API_UPSTREAM=http://devsync-backend:8000` (FE).
- Secrets via ESO (no secret values in git or TF state): TF creates the Secret Manager secrets + IAM binding only — values entered once via `gcloud secrets versions add`. `clustersecretstore.yaml` (GCP provider, WIF via `devsync-ksa`) + one `externalsecret.yaml` (`refreshInterval: 1h`) projecting DB URL, `JWT_SECRET_KEY`, GitHub ID/secret, `FERNET_KEY` into a normal `Secret` the Deployments already reference via `secretKeyRef`. ESO operator installed from a pinned upstream manifest in the `tf-apply` job. DoD: `kubectl get externalsecret -n devsync` shows `SecretSynced`, and no secret value appears in `git log -p -- k8s/ | grep` review.
- **`backend-deployment.yaml`**: `replicas: 1`, `revisionHistoryLimit: 5`, `RollingUpdate maxUnavailable:0 maxSurge:1`, `terminationGracePeriodSeconds: 30`, SA `devsync-ksa`, `runAsNonRoot: true (10000/devsync)`, `seccomp RuntimeDefault`, container `allowPrivilegeEscalation:false readOnlyRootFilesystem:true drop ALL`, probes `httpGet /health:8000` (liveness+readiness, reuses existing endpoint — no exec probes), resources `requests 250m/512Mi limits 1000m/1Gi`, env from ConfigMap + `secretKeyRef`.
- **`frontend-deployment.yaml`**: `replicas: 2`, nginx `runAsUser: 101`, `httpGet /:80`, resources `requests 100m/128Mi limits 500m/512Mi`, env `API_UPSTREAM=http://devsync-backend:8000`.
- **`horizontalpodautoscaler.yaml`** (promoted from §12, 2026-09-10): FE `minReplicas: 2 maxReplicas: 6`, CPU 60% — dormant in v1, $0, autoscale readiness on paper with the trigger honestly deferred.
- **Transport build-arg (promoted from §12, 2026-09-10):** `REACT_APP_*` vars bake at React build time, so a K8s container env would be dead config — instead the K8s workflow builds with `docker build --build-arg REACT_APP_SOCKET_TRANSPORT=both`. Requires a 2-line addition to the `frontend/Dockerfile` build stage (`ARG REACT_APP_SOCKET_TRANSPORT` + `ENV REACT_APP_SOCKET_TRANSPORT=${REACT_APP_SOCKET_TRANSPORT:-polling}`); ECS builds omit the arg and keep today's polling default, so the ECS path is byte-identical in behavior.
- **`poddisruptionbudget.yaml`**: two PDBs — FE `minAvailable: 1` (keeps one nginx up across voluntary evictions), BE `maxUnavailable: 0` (Autopilot can't evict the singleton; documents D2 in scheduling language).
- `service-*.yaml`: ClusterIP `devsync-backend:8000`, `devsync-frontend:80`.
- **`ingress.yaml` + `managedcertificate.yaml`**: GCE Ingress FE:80→`devsync-frontend` with annotation `networking.gke.io/managed-certificates: devsync-demo-cert`; `patch-ingress-host.yaml` (demo overlay) sets host `gcp.devsyncapp.me` + cert `domains`. Order: apply Ingress → resolve `kubectl get ingress` IP → one-time manual Namecheap A-record update → wait `ManagedCertificate` status `Active` (10–20 min typical, once) → verify. No cert-manager, no HTTP-01 solver allowlists, no LE staging fallback to maintain.
- **`migrate-job.yaml`**: `restartPolicy: Never`, `backoffLimit: 3`, `activeDeadlineSeconds: 600`, `ttlSecondsAfterFinished: 86400`, same BE image, command `python -c "from flask_migrate import upgrade; ..."` (mirrors `entrypoint.sh`), runs before Deployment rollout in workflow.
- **`postgres.yaml` (DEMO-ONLY, labelled)**: `StatefulSet postgres:16 replicas:1` + `volumeClaimTemplates 10Gi` + Service `devsync-postgres:5432`; comment header: *"demo-only — destroyed with cluster; prod uses managed-db overlay."*
- `resourcequota.yaml`: `requests cpu 4/mem 8Gi, limits cpu 8/mem 16Gi, pods 20`. `limitrange.yaml`: default `500m/1Gi`, max `2/4Gi`. `networkpolicy.yaml`: default-deny + allow `kube-dns:53`, FE→BE `8000`, BE→postgres `5432`, egress `0.0.0.0/0:443` (GitHub API + AR pulls; FQDN policy later).
- Overlays: `demo` (default, in-cluster DB + live-Ingress patch), **`pr`** (bases `../base`, sets namespace `pr-<n>` via `kustomize edit set namespace`, drops Ingress/ManagedCertificate/ESO store — smoke via port-forward, no certs per PR), `managed-db` (patches `DATABASE_URL` secret ref + removes `postgres.yaml` via `patchesStrategicMerge` delete + adds Cloud SQL annotations).
- Apply: `kustomize build k8s/overlays/demo | kubectl apply -f -`; order: namespace → ESO operator + ClusterSecretStore → ExternalSecret (wait `SecretSynced`) → ManagedCertificate → migrate Job → wait complete → Deployments → Ingress → manual Namecheap A update → wait cert `Active`; `kubectl wait --for=condition=available deploy/devsync-backend -n devsync --timeout=10m`.

### 5.4 P3 — Observability

`podmonitoring.yaml` (GMP): scrape BE `:8000` only if `/metrics` exists — **it doesn't**, so v1 PodMonitoring targets kubelet `up` + container logs; app metrics stay where they are (k6 in CI, `/health` for probes). Log alert `BackendDown`: filter `namespace="devsync" AND (BackoffLimitExceeded OR CrashLoopBackOff OR readiness probe failed)`, 5m alignment, email. Document: infra alert ≠ k6 SLO gate. k6 runs against the live URL during the standing period (same thresholds as `ci.yml`: P95≤500ms/P99≤1s/<1%) — result archived to the run summary.

**JSON logs (one small app-adjacent change, no new dep):** `backend/src/logging_config.py` (~15 lines, stdlib `logging.Formatter` subclass emitting `{"ts","level","msg",...}`) + `dictConfig` call in `create_app()`; gunicorn workers inherit it. This is the only `backend/src` touch in v1 and exists so the GMP log panel can filter `severity>=ERROR`. DoD: `gcloud logging read` shows parseable `jsonPayload.level`.

**Dashboard:** TF-managed `google_monitoring_dashboard` (§5.2) — four tiles, screenshot archived to `docs/demo/k8s-dashboard.png` as a receipt alongside the gif.

### 5.5 P4 — CD: `k8s-cd.yml` (automated, house shape) + `k8s-pr.yml` (teardown is local, §RUNBOOK)

Trigger convention (same as the house `cd.yml`/`deploy.yml` shape: push to **`main`** + `workflow_dispatch`, fully automated, verify baked in): `k8s-cd.yml` runs on pushes to `main` filtered to `paths: backend/**, frontend/**, k8s/**, infra/terraform/**`, so docs-only pushes don't redeploy. The first-ever deploy creates the Ingress (one-time manual Namecheap A-record after); every later push just redeploys and verifies over HTTPS automatically. The pipeline is permanent repo code — it outlives every env it creates. ECS `cd.yml` untouched.

`k8s-cd.yml` jobs (WIF via GCP pool, same OIDC pattern as `cd.yml` AWS OIDC): `build-push` (buildx → AR, output digests, Trivy gate — same shape as `cd.yml` build + StockLens scan) → **`sign`** (cosign keyless + SBOM attest + SLSA provenance, §5.1) → `tf-apply` (idempotent) → `migrate` (apply Job, wait complete) → `deploy` (`kustomize edit set image` with digests, apply, wait available) → `verify` (against the live URL, mirroring `cd.yml`'s OAuth check: `curl https://gcp.devsyncapp.me/health` + `/api/v1/github/config-check` assertions + Cypress `baseUrl` override + k6 within existing thresholds) → `collect` (logs → `$GITHUB_STEP_SUMMARY` + digests/signatures into `docs/k8s.md`). **No destroy job, no manual inputs** — the env stays up; every qualifying push redeploys it, exactly like prod. Add to `ci.yml`: `kustomize build k8s/overlays/{demo,pr}` `| kubeconform -strict`.

DNS is a one-time manual step, not a workflow: after the first deploy resolves the Ingress IP, point the Namecheap A-record at it once; the ManagedCertificate goes `Active` (~10–20 min) and every later deploy verifies over HTTPS with zero manual steps. No live windows — the URL is live for the whole standing period (first deploy → T+14). Gif + dashboard screenshot captured any time the env is up.

`k8s-destroy.yml` does not exist (cut 2026-09-11). Teardown is a local RUNBOOK checklist, run by hand on the calendared date (≤14 days after first apply): `kubectl delete namespace pr-<leftover>` (safety) → `terraform destroy -target=module.gke` → $0 compute → teardown log + final cost line appended to COST.md by hand. The Namecheap A-record stays and is re-pointed if the env is ever resurrected. No automation enforces the date — the 50/80% billing alerts are the backstop; that exposure is accepted and recorded (D15).

`k8s-pr.yml` `on: pull_request (paths: backend/**, frontend/**, k8s/**) + closed`: `ns=pr-<n>` → `kustomize edit set namespace` on `overlays/pr` → apply → migrate Job → smoke (`/health` + login via port-forward) → sticky comment with digests + smoke log → on `closed`: `kubectl delete namespace pr-<n>`. No Ingress/certs per PR (deliberate — keeps PR runs to ~$0.05 and avoids LE rate limits).

---

## 6. Cost (delta vs today, us-central1)

| Item | Cost | Note |
| --- | --- | --- |
| Autopilot control plane | $0 (Autopilot) | Ephemeral, destroyed when idle |
| Push-deploy run (build → sign → apply → deploy → verify) | ~$0.40–1.00/run | Trivy gate fails fast; env stays up after (see standing-idle line) |
| Per-PR namespace run (no Ingress/certs, port-forward smoke) | ~$0.05–0.20/run | Shares the demo cluster; GC on close |
| AR storage + egress | <$1/mo | Digest GC policy |
| cosign/SBOM/SLSA | $0 | CI-only compute inside existing runners |
| Google-managed cert + Namecheap A-record | $0 | Cert $0; A-record is a manual dashboard edit (no zone, no delegation) |
| Secret Manager (6 secrets, ESO sync) | $0 | Free tier (6 secrets + 10k accesses/mo); values entered once, never in git/state |
| Google-managed cert | $0 | Provisioned with the Ingress, destroyed with it |
| Phase 2 Cloud SQL window (`db-f1-micro` Postgres, ~3h) | ~$0.05/run | Created + destroyed inside the load-day run; never standing |
| GMP logs/metrics | free tier | 5m alert, no SLO burn |
| Standing env idle (1 BE + 2 FE + PG on Autopilot, between first deploy and teardown) | ~$1–3/day | Target teardown ≤14 days after first apply → ~$15–40 standing; the only idle line in the plan, and it has a target (not a cap — no automation enforces it, D15) |
| **Idle delta after teardown** | **$0** | Local `terraform destroy` in RUNBOOK (no workflow) |

Permanently standing infra past T+14 rejected: uncapped bleed for a $0-portfolio with zero traffic (same argument as SWE-Qwen standing-A10G rejection). But *temporarily* standing — push-to-deploy env alive for days, torn down by hand on the calendared date — is exactly how prod works; the calendar entry + billing alerts (§5.5) are the entire cost control, and that exposure is accepted, not hidden.

---

## 7. Security

- WIF only, no JSON keys. KSA `devsync-ksa` → GSA `devsync-runner` least-privilege (+ `secretmanager.secretAccessor` scoped to demo secrets only).
- AR digest (`@sha256:`), `imagePullPolicy: IfNotPresent`, Trivy HIGH/CRITICAL gate; **cosign keyless signatures + SBOM attestations verifiable by any reviewer** (`cosign verify` line in §5.1); SLSA provenance links build → source SHA.
- `runAsNonRoot`, `readOnlyRootFilesystem:true`, `seccomp RuntimeDefault`, `drop ALL`; BE already non-root `devsync`, FE `runAsUser:101`.
- NetPol deny-all default; egress allowlist DNS + BE↔PG + `0.0.0.0/0:443` v1 (GitHub API + `*.pkg.dev` unexpressible in vanilla NetPol; FQDN policy later).
- Secrets via ESO from Secret Manager (TF creates secrets + IAM, never values); JWT/OAuth/DB never in ConfigMap/logs/state. Cookie `Secure`/`SameSite` logic already handles HTTPS-behind-Ingress (app reads `FRONTEND_URL`) — the live URL is what finally exercises the `Secure` path end-to-end.
- TLS via Google-managed cert on `gcp.devsyncapp.me` (no self-signed, no cert-manager CA to trust); the A-record is a manual Namecheap edit in the live checklist, re-pointed only if the env is ever resurrected.

---

## 8. Hiring Evidence

- `docs/k8s.md`: diagram (Browser → Ingress/TLS → FE → BE → PG/managed) + D1–D15 table + live run link + AR digests + `cosign verify` output.
- `docs/demo/k8s-live.gif`: login → task update → Socket.IO broadcast against the live URL (same `docs/demo` convention as the AWS gif).
- `docs/demo/k8s-dashboard.png`: GMP dashboard screenshot against the live env (CPU, restarts, alert status, error logs).
- `COST.md`: §6 table + one real run cost (standing days + live verify + one PR run).
- `RUNBOOK.md`: `make k8s-logs / k8s-down` + standing-env checklist (verify → capture gif → local teardown by the calendared date).
- PR template: image digests, signatures, migrate Job `Complete`, `kubectl wait` output, live/k6 result, destroy confirmation.

Interview deflects: *Why singleton backend?* (in-memory Socket.IO rooms + `workers=1` comment; scaling duplicates emits — Redis `message_queue` first, §12). *Why demo Postgres in-cluster?* (ephemeral throwaway; durable rule protects prod data, demo destroyed with cluster; §12 runs one real Cloud SQL window as the baseline). *Why no Redis in v1?* (dead dep — zero imports; Phase 2 wires it, §12). *Why ESO instead of TF secrets?* (values in TF state is the classic leak; Secret Manager + rotation in one place). *Why PDBs on a demo?* (FE `minAvailable: 1` is free; BE `maxUnavailable: 0` documents the singleton in scheduling terms). *Why a real domain for a time-boxed demo?* (a real hostname + managed cert proves the full DNS→TLS→Secure-cookie path; costs $0 and dies with the env). *Why per-PR namespaces instead of staging?* (same-cluster isolation at $0 marginal; shared staging is a standing bill). *Why an HPA that never fires?* (dormant manifest at $0 proves autoscale readiness; the scale event under load is Phase 2's proof, §12). *Why migrate Job?* (entrypoint migrates every boot — races at >1 replica). *Isn't this CI/CD temporary if the env dies?* (no — the pipeline is permanent repo code, the env is the temporary part; push-to-deploy + review apps is the same shape as any prod pipeline, and it can resurrect the whole platform from scratch on any future date).

---

## 9. Risks

- Single BE replica = SPOF during demo → accepted (demo window, `maxUnavailable:0` + 30s grace); Phase 2 (§12) is the named upgrade.
- ManagedCertificate provisioning lag (>20 min) or a stale Namecheap A-record → workflow waits with a visible timeout, then falls back to port-forward verify so a DNS hiccup never blocks the whole demo; the one-time manual A-record (§5.5) plus port-forward fallback is the real mitigation.
- `API_UPSTREAM` shifting from compose DNS to Service DNS → same envsubst mechanism, one env value change; covered by `verify` curl through FE (http) and `live` curl (https).
- Dead deps (`fastapi/uvicorn/celery/supervisor`) bloat image → v1 keeps byte-identical to ECS image (honest comparison); prune as separate cleanup PR.
- PR namespace collision on rapid re-runs → `kubectl apply` is idempotent on the same `pr-<n>`; GC only on `closed`, never mid-run.
- 1,466-test suite + k6 gate unaffected (CI additive only).
- No automated teardown enforcement (destroy workflow cut, D15) → the calendared date can slip; blast radius is ~$1–3/day of idle burn, caught by the 50/80% billing alerts. Accepted, not hidden.

---

## 10. Definition of Done

- [ ] `kustomize build k8s/overlays/{demo,pr}` + `kubeconform -strict` pass in `ci.yml`
- [ ] Trivy 0 HIGH/CRITICAL on both images; `cosign verify` passes; SBOM + SLSA provenance linked in run summary
- [ ] migrate Job `Complete`, BE `Available`, FE `Available`, `curl /health` 200 via port-forward
- [ ] `ExternalSecret` shows `SecretSynced`; no secret value present in `git log -p -- k8s/`
- [ ] PDBs admit nothing disruptive: `kubectl drain --dry-run` on the BE node is denied by `maxUnavailable: 0`
- [ ] FE HPA exists (`kubectl get hpa`, min 2 / max 6) with zero scaling events in v1; K8s FE image carries `both` (build-arg visible in run log; live socket upgrades to websocket)
- [ ] Live URL: `gcp.devsyncapp.me` resolves, `ManagedCertificate` `Active`, `curl https://gcp.devsyncapp.me/health` 200 with valid cert; login → task update → Socket.IO broadcast verified across two live clients; k6 vs live URL within existing thresholds
- [ ] `docs/demo/k8s-live.gif` + `docs/demo/k8s-dashboard.png` recorded against the live URL and merged
- [ ] Logs arrive as parseable JSON (`jsonPayload.level` filterable in GMP)
- [ ] PR run: `pr-<n>` namespace smoke green + sticky comment; namespace deleted on close
- [ ] Login → task update → Socket.IO broadcast verified across two port-forwarded clients (rooms don't leak — reuse Cypress spec shape)
- [ ] `BackendDown` alert fires on forced failure canary, decoupled from k6 gate
- [ ] Local teardown (`terraform destroy -target=module.gke`) → $0 compute, `COST.md` updated with real numbers (standing days + live run + one PR run)
- [ ] `RUNBOOK.md` + `docs/k8s.md` merged

---

## 11. Build Order (for implementer)

1. P0 images + supply chain (`sign` job: cosign/SBOM/SLSA — CI-only, build it first, it's free and independent)
2. P1 `modules/gke` + `backend_runner` IAM + `dashboard.tf` + `terraform plan` (no `dns.tf` — DNS is the manual Namecheap step in §5.5)
3. P2 base manifests (ESO store + ExternalSecret, ManagedCertificate, PDBs) + `demo`/`pr` overlays + `kubeconform`
4. P4 `k8s-cd.yml` (push on `main`, paths-filtered → build → sign → apply → migrate → deploy → verify vs live URL, env stays up), then `k8s-pr.yml` (no destroy workflow — teardown is local, §5.5)
5. P3 PodMonitoring + `BackendDown` alert + JSON logging + live-URL k6 + dashboard screenshot + COST/RUNBOOK/`docs/k8s.md` + gif
6. `managed-db` overlay LAST (no live DB provisioned; patch reviewed, never applied in demo)

---

## 12. Phase 2 — Real Scaling (appendix, NOT v1 scope; decisions locked in `docs/adr/`)

**Trigger to build:** the synthetic load day (ADR 0004) — N=50 sanity must pass on the singleton, N=500 must degrade it. No organic traffic exists to trigger on; the gate opens on manufactured evidence, not vibes. Commit this design to paper now so v1 reads as sequenced, not capped.

- **Unlock (one line + config, ADR 0002):** `SocketIO(..., message_queue="redis://devsync-redis:6379/0")` in `app.py` socketio init; add in-cluster `redis` Service (demo-labelled, same precedent as demo Postgres). Only then does >1 replica stop splitting rooms. **No session affinity by default** — websockets are persistent TCP and the nginx template already negotiates the upgrade; one forced-polling-transport test decides whether affinity earns its way in (GCE Ingress stays either way; nginx-ingress + cookie affinity is the named fallback). The v1 K8s image already builds with `both` (§5.3), so this test runs from the real default, not a special build.
- **Presence + backfill (ADR 0003):** `SETEX user:<id> <ttl>` + heartbeat (~10 lines) for global presence — per-pod online lists are user-visible wrongness. Reconnect backfill = refetch project state via existing REST; ceiling documented (full-refetch granularity; per-event sequence IDs when volume demands).
- **Scale:** backend `replicas: 2` (only after the MQ line) + FE HPA scale *event* under N=500 (manifest already shipped dormant in v1 — the event is the proof; FE is stateless, safe to autoscale); backend HPA stays rejected until a better-than-CPU metric is proven (`socketio_connections` via GMP adapter only if CPU proves a lagging proxy); `workers` stays 1 per pod (gevent long-lived connections — scale pods, not workers).
- **Proofs (three runs, all gif'd):** (a) **load day** — in-cluster `python-socketio` asyncio client as a K8s Job, N=50 sanity on the singleton then N=500 against MQ + FE HPA, before/after pair across the `message_queue` line with the HPA scale event in the log; (b) **managed-DB run** — TF creates a `db-f1-micro` Postgres (private IP) inside the window, `managed-db` overlay applied, load client pointed at it, instance destroyed in the same run (~$0.05); (c) **chaos** — `kubectl delete pod <backend>` mid-socket → client auto-reconnects, rejoins `project_<id>` room (server-side `_membership_denied` re-checks), state refetched via REST — `docs/demo/k8s-chaos.gif`.
- **Cost note:** in-cluster Redis + ≥2 backends roughly doubles the demo-window cost (~$0.80–2.00/run) + ~$0.05 Cloud SQL window — still $0 idle. Memorystore exists only as an unapplied overlay patch: standing managed Redis on expiring credits for zero users is indefensible spend (ADR 0004).

Interview line: *"v1 proves I can ship and secure the platform for $0 idle; Phase 2 proves I know exactly which line of code unlocks horizontal scale, and I manufactured the trigger instead of waiting for users who don't exist."*
