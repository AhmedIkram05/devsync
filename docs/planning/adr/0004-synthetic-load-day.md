# ADR 0004 — Synthetic Load Day Is the Phase 2 Trigger (N=500, In-Cluster Job)

**Status:** Accepted (grill round 3, P1–P2)
**Date:** 2026-09-10

## Context

DevSync has zero users, so no organic metric (CPU, connection count, emit latency) will ever cross a threshold. A trigger-gated Phase 2 (§12 of the K8s plan) needs an artificial trigger, or the gate never opens and the singleton stands forever by default rather than by decision.

## Decision

A **synthetic load day** inside the standing window, with gates:

- **N=50 concurrent socket clients** = singleton sanity pass (must be clean).
- **N=500** = the case-making run: singleton is *expected* to degrade. Stated prediction up front: per-connection memory (room dicts + greenlet stacks) or file descriptors break before CPU.
- Generator = bespoke `python-socketio` asyncio client run as a **K8s Job inside the cluster**: no NAT/egress pain, results in `kubectl logs`, destroyed with the window, $0 extra.
- Phase 2 passes the same N=500 with an **HPA scale event in the log** — the before/after pair across the one-line `message_queue` change is the deliverable.

Redis for all of this is **in-cluster, demo-labelled** (same precedent as demo Postgres). Memorystore exists only as an unapplied overlay patch: standing managed Redis (~$35+/mo minimum) on expiring credits for zero users is indefensible spend.

## Alternatives rejected

- **k6-only:** covers HTTP, never touches rooms — the stateful surface is the whole point.
- **External loader (laptop/CI → live URL):** NAT, egress, and flaky-client noise pollute the numbers the decision rests on.
- **Standing Memorystore for the window:** the single most attackable line item in the budget; in-cluster proves the identical protocol.

## Interview line

*"No users means no organic trigger, so I manufactured one: 500 sockets from inside the cluster, a stated prediction, and a before/after pair across a one-line change."*
