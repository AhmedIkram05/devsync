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
| `400` | `Content-Type` is not JSON, body is malformed JSON, or an inline validator rejected the payload | `BadRequestError` |
| `401` | Missing, malformed or expired JWT | `UnauthorizedError` |
| `403` | Authenticated, but the role or permission gate rejected the caller | `ForbiddenError` |
| `404` | Resource does not exist, or the global 404 handler fired | `NotFoundError` |
| `429` | Per-route or global rate limit tripped | `RateLimitError` |
| `500` | Unhandled exception reached `handle_generic_error` | `InternalServerError` |

## The three body shapes

Most error bodies carry a `status: "error"` discriminator plus a `message`.
Three exceptions matter when writing a client:

**1. `403` omits `status`.** Every 403 is raised by a decorator in
`api/middlewares/__init__.py` or `auth/rbac.py`, and none of them sets it:

```json
{ "message": "Admin access required" }
{ "message": "Insufficient permissions" }
{ "message": "Insufficient role permissions" }
```

So do not branch on `status` to detect an authorization failure — branch on the
HTTP status code. `GET /users/{user_id}` adds a fourth body,
`{ "message": "You can only view your own profile" }`, from a hand-rolled check
in `users_routes.py` with no decorator behind it.

**2. The GitHub OAuth routes use a bare `{ "error": "..." }`.**
`/github/connect`, `/github/callback` and `/github/exchange` skip the shared
error helpers, so their 404/500 responses have neither `status` nor `message`.

**3. `401` uses a machine-readable `error` code.** `app.py` builds these by
hand for the three JWT failure modes rather than going through `APIError`:

```json
{ "status": "error", "message": "Token has expired", "error": "token_expired" }
{ "status": "error", "message": "Invalid token", "error": "token_invalid" }
{ "status": "error", "message": "Authorization required", "error": "authorization_required" }
```

`error` is the field to switch on here; `message` is prose and is not stable.

### Error bodies by origin

| Origin | Status | Body |
| --- | --- | --- |
| `APIError.to_dict()` (`error_handler.py`) | any | `{ **payload, "message": ..., "status": "error" }` |
| `handle_404_error` | 404 | `{ "status": "error", "message": "Resource not found", "error": <str(exc)> }` |
| `handle_generic_error` | 500 | `{ "status": "error", "message": "Internal server error", "error": ..., "traceback": ... }` |
| `validate_json` | 400 | `{ "status": "error", "message": "Missing JSON in request body" }` |
| `validate_json` | 400 | `{ "status": "error", "message": "Invalid JSON format in request body" }` |
| `validate_schema` | 400 | `{ "status": "error", "message": "Validation error", "errors": { ... } }` |
| `validate_params` | 400 | `{ "status": "error", "message": "Missing required URL parameters", "missing_params": [ ... ] }` |
| `@rate_limit` | 429 | `{ "status": "error", "message": "Rate limit exceeded. Please try again later." }` |
| global `before_request` limiter | 429 | `{ "status": "error", "message": "Global rate limit exceeded. Please try again later." }` |

`InternalServerError.error` is the exception string when `DEBUG` is on and the
literal `"An unexpected error occurred"` otherwise; `traceback` is non-null
only in `DEBUG`. Never parse `error` or `traceback` for logic — they exist for
operators.

`handle_validation_error` in `error_handler.py` is commented out and never
registered, so its `{status, message, errors}` 400 shape does not occur at
runtime. The `errors` key above comes from `validate_schema`, which is a
different decorator.

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
`RATE_LIMIT_WINDOW_SECONDS`. The window is epoch-aligned, not sliding. There is
no `Retry-After` header anywhere in the codebase — clients must back off on
their own. Redis holds the shared counters across pods; the in-process fallback
is per-pod, so a Redis outage makes the effective limit `300 x pod_count`.

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

## Known behaviour that looks like a bug

These are real and current; they are recorded so nobody re-derives them.

- **No CSRF protection.** `JWT_COOKIE_CSRF_PROTECT = False` is set
  unconditionally, and with `JWT_COOKIE_SECURE` on, `JWT_COOKIE_SAMESITE`
  resolves to `"None"` (`Lax` otherwise). A cookie-authenticated mutating
  request from another origin is not blocked. `CookieAuth` documents no CSRF
  token because none is checked.
- **`/github/connect` and the other GitHub OAuth routes use a bare
  `{ "error": "..." }`.** They skip the shared error helpers, so their 404/500
  responses have neither `status` nor `message`.

## Client checklist

1. Branch on the HTTP status, never on a `status` field — `403` has none.
2. Read `error` for `401` codes and `errors` for `400` schema failures; treat
   `message` as display-only.
3. Treat the `404`/`500` from `/github/connect` as `{error: string}` rather
   than the shared shape.
4. Back off on `429` without expecting `Retry-After`, and expect the message to
   differ between the per-route and global limiters.
