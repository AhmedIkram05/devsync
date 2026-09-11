# RUNBOOK — DevSync K8s (standing env, teardown ≤T+14)

## Make targets

```bash
make k8s-up    # digest-pinned deploy of demo overlay (requires BACKEND_DIGEST + FRONTEND_DIGEST; refuses :latest placeholders)
make k8s-live  # print Ingress IP for the one-time Namecheap A-record step, then wait cert Active
make k8s-logs  # tail backend + frontend + migrate Job logs
make k8s-down  # delete workloads (then local terraform destroy to $0 on the calendared date)
```

Workflows own the real sequence (`k8s-cd.yml` on push to `main`, `k8s-pr.yml`); these targets are the local equivalent for the standing cluster.

## Standing checklist (first deploy → teardown ≤14 days)

1. Deploy: push to `main` runs `k8s-cd.yml` (paths-filtered: `backend/**`, `frontend/**`, `k8s/**`, `infra/terraform/**`) — build → sign → apply → migrate → deploy → verify. Env stays up. No manual live workflow, no inputs.
2. One-time DNS: after the first deploy, `make k8s-live` → copy Ingress IP → Namecheap dashboard, set `gcp.devsyncapp.me` A-record once → wait `ManagedCertificate Active` (~10–20 min, once). Later pushes verify over HTTPS with zero manual steps.
3. Verify anytime up: `curl https://gcp.devsyncapp.me/health` 200 with valid cert; login → task update → Socket.IO broadcast across two clients; k6 vs live URL within CI thresholds.
4. Capture evidence anytime up: record `docs/demo/k8s-live.gif` + screenshot `docs/demo/k8s-dashboard.png` (both _TODO until captured; no binaries committed as placeholders_).
5. Local teardown on the calendared date (≤14 days after first apply): `kubectl delete namespace pr-<leftover>` (safety) → `terraform -chdir=infra/terraform destroy -target=module.gke` (by hand, `make k8s-down` first) → confirm $0, log cost line to `COST.md` by hand. No destroy workflow; 50/80% billing alerts are the backstop (D15).

Fallback: DNS hiccup never blocks the demo — port-forward verify (`kubectl port-forward svc/devsync-backend 8000:8000`) still proves BE/FE health. The A-record stays for the env lifetime and is re-pointed only if the env is ever resurrected; stale AWS records untouched. `managed-db` overlay is never applied (no live DB).
