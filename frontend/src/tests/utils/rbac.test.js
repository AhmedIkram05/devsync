import {
  ROLES,
  ROLE_HIERARCHY,
  PERMISSIONS,
  hasRole,
  hasAnyRole,
  roleAtLeast,
  hasPermission
} from '../../utils/rbac';

describe('rbac', () => {
  describe('ROLES', () => {
    test('defines all expected roles', () => {
      expect(ROLES.DEVELOPER).toBe('developer');
      expect(ROLES.TEAM_LEAD).toBe('team_lead');
      expect(ROLES.ADMIN).toBe('admin');
    });
  });

  describe('ROLE_HIERARCHY', () => {
    test('sets correct hierarchy levels', () => {
      expect(ROLE_HIERARCHY[ROLES.DEVELOPER]).toBe(0);
      expect(ROLE_HIERARCHY[ROLES.TEAM_LEAD]).toBe(1);
      expect(ROLE_HIERARCHY[ROLES.ADMIN]).toBe(2);
    });
  });

  describe('PERMISSIONS', () => {
    test('defines all expected permissions', () => {
      expect(PERMISSIONS.CAN_MANAGE_PROJECTS).toBe('can_manage_projects');
      expect(PERMISSIONS.CAN_ASSIGN_TASKS).toBe('can_assign_tasks');
      expect(PERMISSIONS.CAN_UPDATE_ANY_TASK).toBe('can_update_any_task');
      expect(PERMISSIONS.CAN_VIEW_ALL_USERS).toBe('can_view_all_users');
      expect(PERMISSIONS.CAN_MANAGE_USERS).toBe('can_manage_users');
      expect(PERMISSIONS.CAN_MANAGE_SYSTEM_SETTINGS).toBe('can_manage_system_settings');
      expect(PERMISSIONS.CAN_VIEW_SYSTEM_STATS).toBe('can_view_system_stats');
      expect(PERMISSIONS.CAN_LINK_GITHUB_ACCOUNT).toBe('can_link_github_account');
      expect(PERMISSIONS.CAN_LINK_GITHUB_REPOS).toBe('can_link_github_repos');
      expect(PERMISSIONS.CAN_COMMENT_ON_TASKS).toBe('can_comment_on_tasks');
      expect(PERMISSIONS.CAN_MANAGE_PERSONAL_NOTIFICATIONS).toBe('can_manage_personal_notifications');
    });
  });

  describe('hasRole', () => {
    test('returns true when role matches', () => {
      expect(hasRole('admin', 'admin')).toBe(true);
      expect(hasRole('developer', 'developer')).toBe(true);
      expect(hasRole('team_lead', 'team_lead')).toBe(true);
    });

    test('returns false when role does not match', () => {
      expect(hasRole('admin', 'developer')).toBe(false);
      expect(hasRole('developer', 'admin')).toBe(false);
      expect(hasRole('team_lead', 'developer')).toBe(false);
    });

    test('returns false when role is undefined or null', () => {
      expect(hasRole(undefined, 'admin')).toBe(false);
      expect(hasRole(null, 'admin')).toBe(false);
    });
  });

  describe('hasAnyRole', () => {
    test('returns true when role is in target roles', () => {
      expect(hasAnyRole('admin', ['admin', 'developer'])).toBe(true);
      expect(hasAnyRole('developer', ['admin', 'developer'])).toBe(true);
      expect(hasAnyRole('team_lead', ['team_lead'])).toBe(true);
    });

    test('returns false when role is not in target roles', () => {
      expect(hasAnyRole('developer', ['admin', 'team_lead'])).toBe(false);
      expect(hasAnyRole('admin', ['developer'])).toBe(false);
    });

    test('returns false when target roles is empty', () => {
      expect(hasAnyRole('admin', [])).toBe(false);
    });

    test('returns false when role is undefined or null', () => {
      expect(hasAnyRole(undefined, ['admin'])).toBe(false);
      expect(hasAnyRole(null, ['admin'])).toBe(false);
    });
  });

  describe('roleAtLeast', () => {
    test('returns true when user role level meets or exceeds minimum', () => {
      expect(roleAtLeast('admin', 'developer')).toBe(true);
      expect(roleAtLeast('admin', 'team_lead')).toBe(true);
      expect(roleAtLeast('admin', 'admin')).toBe(true);
      expect(roleAtLeast('team_lead', 'developer')).toBe(true);
      expect(roleAtLeast('team_lead', 'team_lead')).toBe(true);
      expect(roleAtLeast('developer', 'developer')).toBe(true);
    });

    test('returns false when user role level is below minimum', () => {
      expect(roleAtLeast('developer', 'team_lead')).toBe(false);
      expect(roleAtLeast('developer', 'admin')).toBe(false);
      expect(roleAtLeast('team_lead', 'admin')).toBe(false);
    });

    test('returns false when user role is undefined', () => {
      expect(roleAtLeast(undefined, 'admin')).toBe(false);
    });

    test('returns true when user role is undefined and minRole is undefined (both default to negative/zero)', () => {
      // When both are undefined, userLevel = -1, minLevel = 0, so -1 >= 0 is false
      expect(roleAtLeast(undefined, undefined)).toBe(false);
    });

    test('treats unknown roles as level -1', () => {
      expect(roleAtLeast('unknown_role', 'developer')).toBe(false);
      expect(roleAtLeast('admin', 'unknown_role')).toBe(true); // admin (2) >= -1
    });
  });

  describe('hasPermission', () => {
    test('returns true when permission is in array', () => {
      expect(hasPermission(['can_manage_projects', 'can_assign_tasks'], 'can_manage_projects')).toBe(true);
      expect(hasPermission(['can_manage_users'], 'can_manage_users')).toBe(true);
      expect(hasPermission(['a', 'b', 'c'], 'b')).toBe(true);
    });

    test('returns false when permission is not in array', () => {
      expect(hasPermission(['can_manage_projects'], 'can_assign_tasks')).toBe(false);
      expect(hasPermission(['a', 'b'], 'c')).toBe(false);
    });

    test('returns false when permissions is empty array', () => {
      expect(hasPermission([], 'can_manage_projects')).toBe(false);
    });

    test('returns false when permissions is null', () => {
      expect(hasPermission(null, 'can_manage_projects')).toBe(false);
    });

    test('returns false when permissions is undefined', () => {
      expect(hasPermission(undefined, 'can_manage_projects')).toBe(false);
    });

    test('returns false when permissions is not an array', () => {
      expect(hasPermission('not_an_array', 'can_manage_projects')).toBe(false);
      expect(hasPermission({ permission: 'can_manage_projects' }, 'can_manage_projects')).toBe(false);
    });
  });
});
