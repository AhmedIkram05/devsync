# ADR 0001 — Greenfield GCP Standup, Not a Migration

**Status:** Accepted (grill rounds 1–2)
**Date:** 2026-09-10

## Context

DevSync's AWS path (ECS + S3/CloudFront, OIDC, Secrets Manager) is proven and documented in `docs/deep-dives.md`, but it was console-provisioned (no TF), is now fully torn down to $0, and has no users. There is no live system to cut over, no data worth migrating, and no rollback target. Separately: $224 GCP credits expiring in 43 days, and plan v1.1 already proves second-cloud *deploy* via ephemeral demo.

## Decision

Stand DevSync up **greenfield on GCP** — GKE Autopilot + small Cloud SQL + nip.io TLS (no domain purchase for a 2-week window) + fresh DB via Alembic — **as if AWS never existed**. The ECS history stays in git as prior-art evidence, not as a system.

Frame it as **cloud-portable, never multi-cloud**: the same workload runs on two providers at different times with an honest comparison, not active-active. Failure mode is `terraform destroy` + the v1.1 ephemeral story — no rollback plan needed because there is nothing live to roll back to.

## Standing window (load-bearing constraints)

- **2 weeks** inside the 43-day credit expiry: week 1 = standup + OAuth re-point + evidence; week 2 = load day + chaos + destroy + write-up. Destroy date picked now, calendared.
- **Budget alerts at 50% (~$112) and 80%** of credits. Day-after plan = destroy log, never a limping half-alive URL.
- Estimated burn ~$50–80 for the fortnight (Autopilot ~$0.10/hr fee + workloads + small Cloud SQL) — **verify against the current price book at build time**.
- OAuth redirect chain is a DoD item, not an afterthought: GitHub App callbacks + `GITHUB_REDIRECT_URI` + `FRONTEND_URL` + CORS origins re-pointed, **live GitHub-OAuth login verified** (seeded-user login is the documented fallback if re-pointing is blocked).

## Alternatives rejected

- **True migration (cutover/parallel):** implies a source system; none exists. Parallel running = paying twice for zero users.
- **Ephemeral-only (no standup):** leaves "operated-weeks" evidence — uptime log, one real incident, cost-over-time — unproven. The standup's success metric is the receipts, not the URL.
- **Standing indefinitely on credits:** expiry suspends everything mid-live; the ending must be chosen, not discovered.

## Interview line

*"No users, no cutover — I stood it up greenfield on a 2-week clock inside expiring credits, with the destroy date picked before the apply date."*
