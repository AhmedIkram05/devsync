# Role-Based Access Control (RBAC) Structure

This document outlines the RBAC system implemented in DevSync, detailing the roles, permissions, and how they're applied to API endpoints.

## Roles

DevSync has three primary roles with increasing levels of permission:

1. **Developer** - Basic user with limited permissions focused on task management
2. **Team Lead** - Extended permissions for task creation and team management
3. **Admin** - Full system access including user management and system settings

## Permissions by Role

### Developer Permissions

- View assigned tasks and created tasks
- Update tasks assigned to them
- Add comments to tasks
- View and manage personal notifications
- View and update their own profile
- Link GitHub account

### Team Lead Permissions

All Developer permissions, plus:

- Create new tasks
- Assign tasks to team members
- Update any task
- Delete any task
- View team statistics and metrics
- Generate reports
- View all team member profiles

### Admin Permissions

All Team Lead permissions, plus:

- Manage users (create, update, delete)
- Modify system settings
- View audit logs
- Access all data in the system

## API Endpoint Permission Mapping

| Endpoint | Method | Required Permission | Minimum Role |
|----------|--------|---------------------|-------------|
| `/api/auth/register` | POST | (public) | N/A |
| `/api/auth/login` | POST | (public) | N/A |
| `/api/auth/refresh` | POST | (authenticated) | Any |
| `/api/auth/logout` | POST | (authenticated) | Any |
| `/api/auth/me` | GET | (authenticated) | Any |
| `/api/tasks` | GET | can_view_tasks | Developer |
| `/api/tasks` | POST | can_create_tasks | Team Lead |
| `/api/tasks/:id` | GET | can_view_tasks | Developer |
| `/api/tasks/:id` | PUT | can_update_assigned_tasks | Developer |
| `/api/tasks/:id` | DELETE | can_delete_tasks | Admin |
| `/api/tasks/:id/comments` | GET | can_comment | Developer |
| `/api/tasks/:id/comments` | POST | can_comment | Developer |
| `/api/admin/users` | GET | can_manage_users | Admin |
| `/api/admin/users/:id` | PUT | can_manage_users | Admin |
| `/api/admin/users/:id` | DELETE | can_manage_users | Admin |
| `/api/admin/system/settings` | GET | can_manage_system_settings | Admin |
| `/api/admin/system/settings` | PUT | can_manage_system_settings | Admin |

## Implementation Details

The RBAC system is implemented using:

1. JWT tokens with role claims
2. Custom permission decorators for route protection
3. Role hierarchy enforcement
4. Permission validation middleware

## Frontend Integration

For frontend developers:

- Use the token's decoded payload to determine user role
- Hide UI elements based on permissions (not just disable them)
- Handle 403 responses by redirecting to appropriate error pages
- Refresh tokens when approaching expiration
- Clear tokens and redirect to login when access is denied

### Handling Permission Errors

When a user attempts an unauthorised action, the API returns:

- HTTP status code 403
- JSON response with "message" field explaining the error

Frontend should:

1. Display appropriate error message
2. Not attempt to retry the request
3. Guide the user to appropriate actions they are permitted to take

## Example RBAC Usage in Code
