# API Response & Error Conventions

Every `/api/v1/*` response in DevSync is JSON except the two 204 deletes and
`/api/docs/*`. This document is the error contract the code actually emits —
it is written from the handlers, not from intent, and
[swagger.yaml](swagger.yaml) references it.

Read alongside [rbac.md](rbac.md) (who may call what) and
[models.md](models.md) (what the success payloads mean).

## Status codes

| Code | Emitted when | Body schema |
| --- | --- | --- |
| `200` | Success, including reads, updates and the two deletes that return a confirmation message | resource schema |
| `201` | Resource created | resource schema |
| `204` | `DELETE /projects/{project_id}` only | empty |
| `400` | `Content-Type` is not JSON, body is malformed JSON, or an inline validator rejected the payload | `ErrorEnvelope` |
| `401` | Missing, malformed or expired JWT | `ErrorEnvelope` |
| `403` | Authenticated, but the role or permission gate rejected the caller | `ErrorEnvelope` |
| `404` | Resource does not exist, or the global 404 handler fired | `ErrorEnvelope` |
| `429` | Per-route or global rate limit tripped | `ErrorEnvelope` |
| `500` | Unhandled exception reached `handle_generic_error` | `ErrorEnvelope` |

## The single error envelope

Every error body is an `ErrorEnvelope` built by `error_response()` in
`api/middlewares/error_handler.py`:

```json
{ "status": "error", "message": "...", "code": "bad_request", "request_id": "a1b2c3d4e5f60001" }
```

Branch on the HTTP status code and the stable `code`, never on `message`
prose. `request_id` echoes `X-Request-ID` (see `request_logger.py`) so a
client report maps to exactly one log line. Extra keys (`errors`,
`missing_params`, `error`, `traceback`, `success`) are details passthrough
and are not part of the contract.

Common `code` values: `bad_request`, `validation_error`, `unauthorized`,
`token_expired`, `token_invalid`, `authorization_required`, `token_revoked`,
`forbidden`, `not_found`, `rate_limited`, `internal_error`,
`service_unavailable`, `api_error`.

### Error bodies by origin

| Origin | Status | Envelope |
| --- | --- | --- |
| `APIError.to_dict()` (`error_handler.py`) | any | `{ **payload, "message": ..., "status": "error", "code": ..., "request_id": ... }` |
| `handle_404_error` | 404 | `code not_found`, details `{"error": <str(exc)>}` |
| `handle_generic_error` | 500 | `code internal_error`, details `{"error": ..., "traceback": ...}` |
| `validate_json` | 400 | `code bad_request` |
| `validate_schema` | 400 | `code validation_error`, details `{"errors": { ... }}` |
| `validate_params` | 400 | `code bad_request`, details `{"missing_params": [ ... ]}` |
| `@rate_limit` | 429 | `code rate_limited` + `Retry-After` header |
| global `before_request` limiter | 429 | `code rate_limited` + `Retry-After` header |
| JWT loaders (`app.py`) | 401 | `code token_expired` / `token_invalid` / `authorization_required` / `token_revoked` |
| GitHub routes/controller | 4xx/5xx | `ErrorEnvelope`; legacy `success: false` kept inside details where callers branched on it |

`details.error` is the exception string when `DEBUG` is on and the
literal `"An unexpected error occurred"` otherwise; `traceback` is non-null
only in `DEBUG`. Never parse `error` or `traceback` for logic — they exist for
operators.

## Order of enforcement

View decorators apply bottom-up, so a request is checked in this order:

```
global rate limit (before_request)  ->  jwt_required  ->  role gate
                                    ->  validate_json  ->  per-route rate limit
```

The global limiter is a `before_request` hook, so it fires before any view
decorator and can return a `429` ahead of the `401` an unauthenticated caller
was about to get. Five admin routes add a stricter per-route limit that is
checked last, after authorization:

| Route | Limit |
| --- | --- |
| `POST /admin/audit-logs/cleanup`, `POST /admin/settings/retention/run` | 5 / 60s |
| `PUT /admin/settings`, `PUT /admin/users/{user_id}/role` | 10 / 60s |
| `GET /admin/stats`, `GET /admin/settings` | 20 / 60s |

Every other route shares the global bucket: **300 requests / 60s**, counted per
client per endpoint, overridable via `RATE_LIMIT_REQUESTS_PER_WINDOW` and
`RATE_LIMIT_WINDOW_SECONDS`. The window is epoch-aligned, not sliding. Every
`429` carries a `Retry-After` header (seconds). Redis holds the shared counters
across pods; the in-process fallback is per-pod, so a Redis outage makes the
effective limit `300 x pod_count`.

## Public endpoints

These seven operations need no JWT and carry `security: []` in the spec:

```
POST /auth/login          POST /auth/register       POST /auth/token
GET  /github/config-check  GET  /github/callback     POST /github/callback
GET  /github/exchange
```

Everything else is `@jwt_required()`. `POST /auth/refresh` is the exception
*within* that set: it takes `jwt_required(refresh=True)`, so an access token
gets a `401` even though it is a valid, documented token.

Tokens are accepted from either an `Authorization: Bearer` header or a cookie
(`JWT_TOKEN_LOCATION = ["cookies", "headers"]`), which is what `CookieAuth` in
the spec describes.

## Deliberate design, not drift

Two behaviours look like inconsistencies and are not:

- **`GET /dashboard/client` excludes Admin.** `MEMBER_DASHBOARD_ROLES` is
  `[DEVELOPER, TEAM_LEAD]`. Admins have their own view at
  `GET /dashboard/admin`, so an admin token getting `403` here is the intended
  split, not a missing role in the list.
- **`POST /tasks` and `DELETE /tasks/{task_id}` accept developers.** See
  [rbac.md](rbac.md#task-authority) for the enforced rule and why
  `can_create_tasks` exists but is not checked on the route.

## CSRF: cookie auth is double-submit

The API accepts the JWT from a cookie as well as from an `Authorization`
header, so any cookie-authenticated mutating request has to prove it was not
cross-site. `JWT_COOKIE_CSRF_PROTECT = True` enables that.

Login sets two double-submit cookies:

| Cookie | Echoed back on |
| --- | --- |
| `csrf_access_token` | any mutating request using the access cookie |
| `csrf_refresh_token` | `POST /auth/refresh` only |

Copy the cookie value into the `X-CSRF-TOKEN` header. `POST`, `PUT`, `PATCH`
and `DELETE` are checked; `GET` is exempt, which is why the GitHub OAuth
callback survives being a cross-site redirect.

Three things worth knowing before you debug a `401`:

- **The cookie wins over the `Authorization` header.** `JWT_TOKEN_LOCATION` is
  `["cookies", "headers"]` and the first location that yields a token is used,
  so the CSRF check fires even when a perfectly valid bearer token is also
  present. Sending the header is not optional on cookie sessions.
- **The header is compared against a claim inside the JWT**, not against the
  cookie — `compare_digest(decoded_token["csrf"], header_value)`. A stale
  cookie with a fresh access token fails, and vice versa.
- **Access and refresh carry different claims.** A `csrf_access_token` header
  on `POST /auth/refresh` is rejected.

`frontend/src/services/utils/auth.js` exports `csrfHeaders(token)` for this;
the frontend's five fetch wrappers use it. Because the cookies are only set
when CSRF protection is on, sessions issued before this was enabled have no
csrf cookie and get a `401` until the user logs in again.

## Client checklist

1. Branch on the HTTP status + `code`, never on `message` prose.
2. Read `code` for `401`/`403`/`429`; read `errors` for `400` schema failures;
   treat `message` as display-only.
3. Echo `X-Request-ID` / `request_id` when reporting failures.
4. Back off on `429` using the `Retry-After` header; the message differs
   between the per-route and global limiters.
5. If you authenticate with the cookie, echo `X-CSRF-TOKEN` on every `POST`,
   `PUT`, `PATCH` and `DELETE` — a bearer token alone is not enough once the
   cookie is present.
