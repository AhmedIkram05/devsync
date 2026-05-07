// RBAC Constants and Helpers

export const ROLES = {
  DEVELOPER: 'developer',
  TEAM_LEAD: 'team_lead',
  ADMIN: 'admin'
};

export const ROLE_HIERARCHY = {
  [ROLES.DEVELOPER]: 0,
  [ROLES.TEAM_LEAD]: 1,
  [ROLES.ADMIN]: 2
};

// Available permissions matching backend
export const PERMISSIONS = {
  CAN_MANAGE_PROJECTS: 'can_manage_projects',
  CAN_ASSIGN_TASKS: 'can_assign_tasks',
  CAN_UPDATE_ANY_TASK: 'can_update_any_task',
  CAN_VIEW_ALL_USERS: 'can_view_all_users',
  CAN_MANAGE_USERS: 'can_manage_users',
  CAN_MANAGE_SYSTEM_SETTINGS: 'can_manage_system_settings',
  CAN_VIEW_SYSTEM_STATS: 'can_view_system_stats',
  CAN_LINK_GITHUB_ACCOUNT: 'can_link_github_account',
  CAN_LINK_GITHUB_REPOS: 'can_link_github_repos',
  CAN_COMMENT_ON_TASKS: 'can_comment_on_tasks',
  CAN_MANAGE_PERSONAL_NOTIFICATIONS: 'can_manage_personal_notifications'
};

// We don't redefine the map here, the backend controls the actual map and we fetch it.
// These helpers just act on the user's role/permissions list.

export const hasRole = (userRole, targetRole) => {
  return userRole === targetRole;
};

export const hasAnyRole = (userRole, targetRoles) => {
  return targetRoles.includes(userRole);
};

export const roleAtLeast = (userRole, minRole) => {
  const userLevel = ROLE_HIERARCHY[userRole] ?? -1;
  const minLevel = ROLE_HIERARCHY[minRole] ?? 0;
  return userLevel >= minLevel;
};

export const hasPermission = (userPermissions, targetPermission) => {
  return Array.isArray(userPermissions) && userPermissions.includes(targetPermission);
};
