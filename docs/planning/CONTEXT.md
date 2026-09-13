# CONTEXT.md — DevSync Ubiquitous Language

Glossary only. No implementation details.

## Terms

- **Greenfield second-cloud standup**
  Standing the full DevSync stack up on GCP as if AWS never existed — no cutover, no parallel running, no data migration, no rollback target. Time-boxed, ends in `destroy` + receipts. (≠ *migration*, which implies a live source system; ≠ the ephemeral demo, which proves deploy but not operation.)

- **Cloud-portable**
  The property that the same workload has run on two providers at different times with an honest comparison. (≠ *multi-cloud*, which implies simultaneously serving from more than one provider.)

- **Synthetic load day** *(retired 2026-09-13)*
  A scheduled, in-cluster generated-load exercise (N=50 sanity, N=500 case-making) that stands in for organic traffic DevSync does not have. Its before/after pair is the evidence that opens or closes the Phase 2 scaling gate. **Retired:** Phase 2 v3.0 replaced manufactured triggers with a standing CI socket smoke test — the repo-is-the-product doctrine makes scheduled events the wrong shape; see `k8s-phase2-scaling.md`.

- **Repo-is-the-product**
  The doctrine that the repository (code, tests, manifests, docs) is the thing being built and judged; the GCP env is merely where it currently runs. Anything claimed must be reviewable in code — no one-time runs, gifs, or calendared windows as evidence.
