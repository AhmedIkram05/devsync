import { fetchWithAuth } from './client';

// Admin user management service (moved from services/utils/api.js, no behavior change)
const adminUserService = {
  getAllUsers: async () => {
    try {
      const response = await fetchWithAuth('admin/users');
      const users = response?.users ?? response;
      return Array.isArray(users) ? users : [];
    } catch (error) {
      console.error('Failed to fetch admin users:', error);
      return [];
    }
  },

  createUser: async (data) => {
    return await fetchWithAuth('admin/users', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  updateUser: async (userId, data) => {
    return await fetchWithAuth(`admin/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  updateUserRole: async (userId, role) => {
    return await fetchWithAuth(`admin/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role })
    });
  },

  deleteUser: async (userId) => {
    return await fetchWithAuth(`admin/users/${userId}`, {
      method: 'DELETE'
    });
  }
};

// System settings service (moved from services/utils/api.js, no behavior change)
const settingsService = {
  getSettings: async () => {
    try {
      const response = await fetchWithAuth('admin/settings');
      return response?.settings ?? response ?? {};
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      return {};
    }
  },

  updateSettings: async (data) => {
    return await fetchWithAuth('admin/settings', {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  runRetentionCleanup: async () => {
    return await fetchWithAuth('admin/settings/retention/run', {
      method: 'POST'
    });
  }
};

// Audit log service (moved from services/utils/api.js, no behavior change)
const auditLogService = {
  getLogs: async (filters = {}) => {
    try {
      const params = new URLSearchParams();
      if (filters.action) params.set('action', filters.action);
      if (filters.actor) params.set('actor', filters.actor);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      if (filters.page) params.set('page', String(filters.page));
      if (filters.per_page) params.set('per_page', String(filters.per_page));

      const qs = params.toString();
      const endpoint = qs ? `admin/audit-logs?${qs}` : 'admin/audit-logs';
      const response = await fetchWithAuth(endpoint);
      return response ?? { logs: [], total: 0, pages: 0, current_page: 1 };
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
      return { logs: [], total: 0, pages: 0, current_page: 1 };
    }
  },

  getLogById: async (logId) => {
    try {
      const response = await fetchWithAuth(`admin/audit-logs/${logId}`);
      return response?.log ?? response ?? null;
    } catch (error) {
      console.error('Failed to fetch audit log', logId, error);
      return null;
    }
  }
};

export { adminUserService, settingsService, auditLogService };
export default adminUserService;
