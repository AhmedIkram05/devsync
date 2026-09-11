# COST — DevSync K8s (delta vs today, us-central1)

Source: `docs/planning/k8s-prod-platform.md` §6 (v1.9 standing env, teardown ≤T+14).

| Item | Cost | Note |
|---|---|---|
| Autopilot control plane | $0 (Autopilot) | Standing cluster, torn down locally ≤14 days after first apply |
| Push-deploy run (build → sign → apply → deploy → verify) | ~$0.40–1.00/run | `k8s-cd.yml` on push to `main`; env stays up after (see standing-idle line) |
| Per-PR namespace run (no Ingress/certs, port-forward smoke) | ~$0.05–0.20/run | Shares the standing cluster; GC on close |
| AR storage + egress | <$1/mo | Digest GC policy |
| cosign/SBOM/SLSA | $0 | CI-only compute inside existing runners |
| Google-managed cert + Namecheap A-record | $0 | Cert $0; A-record is a one-time manual dashboard edit after first deploy, no zone |
| Secret Manager (6 secrets, ESO sync) | $0 | Free tier; values entered once, never in git/state |
| Phase 2 Cloud SQL window (`db-f1-micro`, ~3h) | ~$0.05/run | Created + destroyed inside the load-day run; never standing |
| GMP logs/metrics | free tier | 5m alert, no SLO burn |
| Standing env idle (1 BE + 2 FE + PG on Autopilot, first deploy → teardown) | ~$1–3/day | Target teardown ≤14 days after first apply → ~$15–40 standing; calendared date + 50/80% billing-alert backstop (D15) |
| **Idle delta after local teardown** | **$0** | `kubectl delete ns pr-<leftover>` → `terraform destroy -target=module.gke` by hand (no destroy workflow) |

## Real runs

- Push-deploy (`k8s-cd.yml`): _TODO — $X.XX over N standing days, link run_
- PR run (`k8s-pr.yml`, `pr-<n>` smoke): _TODO — $X.XX, link run_
