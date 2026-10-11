import { PERMISSIONS } from '../../utils/rbac';

// Snapshot of the backend ROLE_PERMISSIONS value union
// (backend/src/auth/rbac.py: DEVELOPER_PERMISSIONS + TEAM_LEAD_PERMISSIONS
// + ADMIN_PERMISSIONS). Served per-role via
// GET /auth/permissions -> {"role": <role>, "permissions": [...]}.
const BACKEND_PERMISSIONS_SNAPSHOT = [
  'can_view_tasks',
  'can_update_assigned_tasks',
  'can_comment_on_tasks',
  'can_view_notifications',
  'can_manage_personal_notifications',
  'can_view_own_profile',
  'can_update_own_profile',
  'can_link_github_account',
  'can_create_tasks',
  'can_assign_tasks',
  'can_update_any_task',
  'can_view_all_users',
  'can_view_system_stats',
  'can_generate_reports',
  'can_manage_users',
  'can_manage_projects',
  'can_manage_system_settings',
  'can_view_audit_logs',
  'can_link_github_repos'
];

describe('rbac backend parity', () => {
  test('frontend PERMISSIONS values are a subset of backend ROLE_PERMISSIONS', () => {
    for (const permission of Object.values(PERMISSIONS)) {
      expect(BACKEND_PERMISSIONS_SNAPSHOT).toContain(permission);
    }
  });

  test('frontend PERMISSIONS covers the backend union 1:1 (no drift)', () => {
    expect(new Set(Object.values(PERMISSIONS))).toEqual(new Set(BACKEND_PERMISSIONS_SNAPSHOT));
  });
});
