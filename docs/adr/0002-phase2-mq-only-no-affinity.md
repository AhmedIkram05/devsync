# ADR 0002 — Phase 2 Scales via `message_queue` Only; No Session Affinity by Default

**Status:** Accepted (grill round 3, P3)
**Date:** 2026-09-10

## Context

Backend rooms live in process memory (`socketio_server.py`) with `workers=1`. Horizontal scale needs cross-pod fan-out. Two candidate mechanisms: Redis `message_queue` (server-side pub/sub) and Ingress session affinity (client stickiness). GCE Ingress natively offers only ClientIP affinity; cookie affinity requires swapping to nginx-ingress — a real controller decision with operational cost.

## Decision

Ship **`SocketIO(message_queue="redis://...")` only**. A websocket is a persistent TCP connection and `frontend/nginx.conf.template` already negotiates the WS upgrade — emits fan out via Redis regardless of which pod holds which socket. Affinity only matters for the long-polling fallback path.

Affinity must earn its way in: one forced-polling-transport test run against the MQ build. If clean, affinity is **documented as tested-and-unneeded** and GCE Ingress stays. If polling breaks, nginx-ingress + cookie affinity is the named fallback, not the default.

## Correction (2026-09-10) — frontend defaults to polling

`frontend/src/context/NotificationContext.jsx` defaults to `REACT_APP_SOCKET_TRANSPORT || 'polling'`, and Socket.IO polling keeps session state per-pod — which `message_queue` does **not** fix (MQ fans out events; it doesn't share session state). So the polling test above is not an edge case, it is the default path, and it will likely *require* affinity. The config-only fix, applied in the K8s frontend env: `REACT_APP_SOCKET_TRANSPORT=both` (upgrade to WS where possible, polling where not). MQ-only stays valid under that setting; if `both` still shows polling-session errors, the nginx-ingress fallback activates. No code change in either branch.

## Alternatives rejected

- **MQ + affinity by default:** more moving parts for an unproven need; a controller swap (GCE → nginx-ingress) for zero measured benefit.
- **Affinity instead of MQ:** stickiness without pub/sub still splits rooms across pods — it papers over the fracture instead of fixing it.

## Interview line

*"I shipped the one line that fixes rooms across pods, then tested whether affinity was still needed — it wasn't, and I can show you the run."*
