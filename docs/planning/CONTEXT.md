# CONTEXT.md — DevSync Ubiquitous Language

Glossary only. No implementation details.

## Terms

- **Greenfield second-cloud standup**
  Standing the full DevSync stack up on GCP as if AWS never existed — no cutover, no parallel running, no data migration, no rollback target. Time-boxed, ends in `destroy` + receipts. (≠ *migration*, which implies a live source system; ≠ the ephemeral demo, which proves deploy but not operation.)

- **Cloud-portable**
  The property that the same workload has run on two providers at different times with an honest comparison. (≠ *multi-cloud*, which implies simultaneously serving from more than one provider.)

- **Synthetic load day**
  A scheduled, in-cluster generated-load exercise (N=50 sanity, N=500 case-making) that stands in for organic traffic DevSync does not have. Its before/after pair is the evidence that opens or closes the Phase 2 scaling gate.
