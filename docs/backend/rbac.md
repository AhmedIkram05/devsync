# Role-Based Access Control (RBAC) Structure

This document outlines the RBAC system implemented in DevSync, detailing the roles, permissions, and how they're applied to API endpoints.

## Roles

DevSync has three primary roles with increasing levels of permission:

1. **Developer** (`developer`) — Basic user with limited permissions focused on task management
2. **Team Lead** (`team_lead`) — Extended permissions for task creation and team management
3. **Admin** (`admin`) — Full system access including user management and system settings

### Role Hierarchy

Roles are ranked numerically so higher roles inherit all lower privileges:

| Role | Level |
|------|-------|
| Developer | 0 |
| Team Lead | 1 |
| Admin | 2 |

The `role_at_least(min_role)` decorator uses this hierarchy to enforce minimum-level access.

## Permissions by Role

### Developer Permissions

- View all tasks
- Create and update tasks assigned to them
- Add comments to all tasks (`can_comment_on_tasks`)
- View and manage personal notifications (`can_manage_personal_notifications`)
- Link personal GitHub account (`can_link_github_account`)

### Team Lead Permissions

All Developer permissions, plus:

- Create new tasks / assign tasks (`can_assign_tasks`)
- Update any task (`can_update_any_task`)
- View all users (`can_view_all_users`)
- View system statistics (`can_view_system_stats`)
- Manage projects (`can_manage_projects`)
- Generate and view reports
- View developer progress

### Admin Permissions

All Team Lead permissions, plus:

- Manage users — create, update, delete (`can_manage_users`)
- Modify system settings (`can_manage_system_settings`)
- View and query audit logs

## API Endpoint Permission Mapping

| Endpoint | Method | Permission / Guard | Minimum Role |
|----------|--------|--------------------|--------------|
| `/api/v1/auth/register` | POST | (public) | N/A |
| `/api/v1/auth/login` | POST | (public) | N/A |
| `/api/v1/auth/refresh` | POST | (authenticated) | Any |
| `/api/v1/auth/logout` | POST | (authenticated) | Any |
| `/api/v1/auth/me` | GET | (authenticated) | Any |
| `/api/v1/auth/permissions` | GET | (authenticated) | Any |
| `/api/v1/tasks` | GET | (authenticated) | Developer |
| `/api/v1/tasks` | POST | `role_required([TEAM_LEAD, ADMIN])` | Team Lead |
| `/api/v1/tasks/:id` | GET | (authenticated) | Developer |
| `/api/v1/tasks/:id` | PUT | (authenticated — controller enforces ownership) | Developer |
| `/api/v1/tasks/:id` | DELETE | `role_required([ADMIN])` | Admin |
| `/api/v1/tasks/:id/comments` | GET/POST | `require_permission('can_comment_on_tasks')` | Developer |
| `/api/v1/users` | GET | `role_at_least(TEAM_LEAD)` | Team Lead |
| `/api/v1/users/:id` | GET | self or `role_at_least(TEAM_LEAD)` | Developer (self) |
| `/api/v1/projects` | GET | (authenticated) | Developer |
| `/api/v1/projects` | POST | `role_required([TEAM_LEAD, ADMIN])` | Team Lead |
| `/api/v1/projects/:id` | PUT | `role_required([TEAM_LEAD, ADMIN])` | Team Lead |
| `/api/v1/projects/:id` | DELETE | `role_required([TEAM_LEAD, ADMIN])` | Team Lead |
| `/api/v1/admin/stats` | GET | `role_at_least(TEAM_LEAD)` | Team Lead |
| `/api/v1/admin/settings` | GET/PUT | `admin_required` | Admin |
| `/api/v1/admin/users` | GET | `admin_required` | Admin |
| `/api/v1/admin/users/:id` | PUT/DELETE | `admin_required` | Admin |
| `/api/v1/admin/users/:id/role` | PUT | `admin_required` | Admin |
| `/api/v1/admin/audit-logs` | GET | `admin_required` | Admin |
| `/api/v1/admin/audit-logs/:id` | GET | `admin_required` | Admin |
| `/api/v1/github/repositories` | POST | `role_required([ADMIN])` + `require_permission('can_link_github_repos')` | Admin |
| `/api/v1/notifications/:id` | DELETE | `require_permission('can_manage_personal_notifications')` | Developer |
| `/api/v1/dashboard/client` | GET | `role_required([DEVELOPER, TEAM_LEAD])` | Developer |
| `/api/v1/dashboard/admin` | GET | `role_required([ADMIN])` | Admin |

## Implementation Details

### Backend Decorators

The RBAC system is implemented in `backend/src/auth/rbac.py` using:

1. **`role_required(allowed_roles)`** — Restricts access to an explicit list of roles.
2. **`admin_required`** — Shorthand for admin-only routes.
3. **`role_at_least(min_role)`** — Hierarchical check using `ROLE_HIERARCHY`.
4. **`require_permission(permission)`** — Granular permission-based check using `ROLE_PERMISSIONS`.

```python
from src.auth.rbac import role_required, role_at_least, require_permission, Role

# Only admins
@role_required([Role.ADMIN])
def admin_only_route():
    ...

# Team Lead or higher
@role_at_least(Role.TEAM_LEAD)
def team_lead_plus_route():
    ...

# Anyone with the specific permission
@require_permission('can_assign_tasks')
def assign_task():
    ...
```

### Audit Service

All sensitive actions are logged via `audit_service.record(...)`:

```python
from src.services import audit_service

audit_service.record(
    action='user_role_changed',
    resource_type='user',
    resource_id=user.id,
    metadata={'old_role': 'developer', 'new_role': 'admin'}
)
```

Recorded actions include: `user_registered`, `user_login`, `user_deleted`, `user_role_changed`, `settings_updated`, `project_created`, `project_deleted`, `task_deleted`.

The audit service never crashes the request — failures are logged and silently rolled back.

### Settings Service

System settings are stored in the `system_settings` table and accessed via `settings_service`:

```python
from src.services import settings_service

all_settings = settings_service.get_settings()
default_role = settings_service.get_default_role()
settings_service.update_settings({'allow_registration': False}, actor_id=1)
```

### Registration Security

- The `role` field in the registration body is **ignored**.
- All new users are created with the default role from `settings_service.get_default_role()` (defaults to `developer`).
- Only admins can promote users via `PUT /api/v1/admin/users/:id/role`.

## Frontend Integration

### `useAuth()` Context

The `AuthContext` provides RBAC helpers after login:

```jsx
const { currentUser, can, is, permissions } = useAuth();

// Check permission
if (can('can_manage_users')) { /* show admin panel */ }

// Check role
if (is('admin')) { /* admin-specific UI */ }
```

Permissions are fetched from `GET /api/v1/auth/permissions` on login and cached in `localStorage`.

### `ProtectedRoute` Component

Routes are guarded with role or permission checks:

```jsx
<ProtectedRoute allowedRoles={['admin']}>
  <AdminDashboard />
</ProtectedRoute>

<ProtectedRoute requiredPermission="can_manage_users">
  <AdminUsers />
</ProtectedRoute>
```

Unauthorized users are redirected to `/forbidden`.

### `rbac.js` Utilities

`frontend/src/utils/rbac.js` exports: `ROLES`, `ROLE_HIERARCHY`, `PERMISSIONS`, `hasRole`, `hasAnyRole`, `roleAtLeast`, `hasPermission`.

### 403 Handling

- `api.js` intercepts all `403` responses and redirects to `/forbidden`.
- The `Forbidden` page shows a clear message and a button back to the dashboard.
- **Never retry** a 403 — the server will not change its mind.

### Navbar

The Navbar uses a three-branch render (`admin` / `team_lead` / `developer`), driven by `can(...)` and `is(...)` helpers. Admin sees Users, Settings, and Audit Logs links.
