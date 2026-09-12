# RUNBOOK — DevSync K8s (standing env, teardown ≤T+14)

> Local tooling note: add `export PATH="$PATH:/opt/homebrew/share/google-cloud-sdk/bin"`
> to every fresh shell (gke-gcloud-auth-plugin lives there; PATH is not persistent).

## Make targets

```bash
make k8s-up    # digest-pinned deploy of prod overlay (requires BACKEND_DIGEST + FRONTEND_DIGEST; refuses :latest placeholders)
make k8s-live  # print Ingress IP for the one-time Namecheap A-record step, then wait cert Active
make k8s-logs  # tail backend + frontend + migrate Job logs
make k8s-down  # delete workloads (then local terraform destroy to $0 on the calendared date)
```

Workflows own the real sequence (`k8s-cd.yml` on push to `main`, `k8s-pr.yml`); these targets are the local equivalent for the standing cluster.

## Standing checklist (first deploy → teardown ≤14 days)

1. Deploy: push to `main` runs `k8s-cd.yml` (paths-filtered: `backend/**`, `frontend/**`, `k8s/**`, `infra/terraform/**`) — build → sign → apply → migrate → deploy → verify. Env stays up. No manual live workflow, no inputs.
2. One-time DNS: after the first deploy, `make k8s-live` → copy Ingress IP → Namecheap dashboard, set `gcp.devsyncapp.me` A-record once (recorded standing-env value: host `gcp` → `136.69.68.58`) → wait `ManagedCertificate Active` (~10–20 min, once). Later pushes verify over HTTPS with zero manual steps.
3. Verify anytime up: `curl https://gcp.devsyncapp.me/health` 200 with valid cert; login → task update → Socket.IO broadcast across two clients; k6 vs live URL within CI thresholds.
4. Capture evidence anytime up: record `docs/demo/k8s-live.gif` + screenshot `docs/demo/k8s-dashboard.png` (both _TODO until captured; no binaries committed as placeholders_).
5. Local teardown on the calendared date (**≤2026-09-25** for this standing env, 14 days after first apply): `kubectl delete namespace pr-<leftover>` (safety) → `terraform -chdir=infra/terraform destroy -target=module.gke` (by hand, `make k8s-down` first) → confirm $0, log cost line to `COST.md` by hand. No destroy workflow; 50/80% billing alerts are the backstop (D15).

Fallback: DNS hiccup never blocks the standing env — port-forward verify (`kubectl port-forward svc/devsync-backend 8000:8000`) still proves BE/FE health. The A-record stays for the env lifetime and is re-pointed only if the env is ever resurrected; stale AWS records untouched. `managed-db` overlay is never applied (no live DB).

## Clean-room rebuild (destroy-and-reboot-safe)

Everything needed to go from zero to the standing env is in code. One-time manual: Namecheap A-record (D10).

```bash
gcloud auth login && gcloud config set project project-7f2bbd9a-c5f0-48d2-b08
# 1. GCS state bucket (only manual bootstrap; TF backend references it):
#    gcloud storage buckets create gs://project-7f2bbd9a-c5f0-48d2-b08-tfstate --location=us-central1 --uniform-bucket-level-access
# OR init without state first: terraform -chdir=infra/terraform init -backend=false
cd infra/terraform && terraform init && terraform apply      # APIs, cluster+pool, AR repo, ESO, secret containers, WIF, dashboard
cd ..
PROJECT_ID=project-7f2bbd9a-c5f0-48d2-b08 bash scripts/bootstrap-secrets.sh   # idempotent fill of the 6 containers
gcloud container clusters get-credentials devsync-prod --zone us-central1-a
make k8s-up BACKEND_DIGEST=sha256:... FRONTEND_DIGEST=sha256:...              # render-pipe, digest-pinned
```

Images rebuild if needed: `docker buildx build --platform linux/amd64 --push` (see `k8s-cd.yml` for the exact AR coordinates). Everything else (ESO install, node-SA AR reader, WIF/GH-OIDC) is Terraform-owned.
