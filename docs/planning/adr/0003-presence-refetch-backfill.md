# ADR 0003 — Global Presence via Redis TTL; Reconnect Backfill via Refetch

**Status:** Accepted (grill round 3, P4)
**Date:** 2026-09-10

## Context

`connected_users` is a per-process dict. With ≥2 backend replicas, "who's online" becomes per-pod — user-visible wrongness, unlike emit fan-out which Redis pub/sub fixes invisibly. Separately, a reconnecting client needs whatever it missed while disconnected.

## Decision

- **Presence:** `SETEX user:<id> <ttl>` on connect + heartbeat refresh (~10 lines). "Online" = key exists. Expires on its own when a pod dies — no cleanup path to maintain.
- **Backfill:** client refetches project state via the existing REST endpoint on reconnect. Missed-event granularity = full refetch, documented as the ceiling.

## Alternatives rejected

- **Per-pod presence (accept the split):** rejected — wrong online lists are visible to users; this is the one Phase-2 state change that earns its code.
- **Per-event sequence IDs + replay:** event-sourcing-lite with zero users to justify it. Named as the upgrade path when volume demands it, not before.

## Interview line

*"Presence got ten lines of Redis because users can see it wrong; event replay didn't, because refetch covers a reconnect and nobody's volume needs more."*
