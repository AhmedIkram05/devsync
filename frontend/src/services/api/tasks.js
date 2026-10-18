import { fetchWithAuth } from './client';

// Builds the `tasks` endpoint from a query string or an object of params.
const buildTasksEndpoint = (params) => {
  let endpoint = 'tasks';

  if (params) {
    if (typeof params === 'string') {
      endpoint = `tasks${params.startsWith('?') ? params : `?${params}`}`;
    } else if (typeof params === 'object') {
      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          queryParams.set(key, String(value));
        }
      });
      const queryString = queryParams.toString();
      if (queryString) {
        endpoint = `tasks?${queryString}`;
      }
    }
  }

  return endpoint;
};

// Task related API calls (moved from services/utils/api.js, no behavior change)
const taskService = {
  // Pagination-aware list: returns { items, pagination }. `pagination` is the
  // backend sibling object (or null when the response has none).
  getTasksPaginated: async (params = null) => {
    try {
      const response = await fetchWithAuth(buildTasksEndpoint(params));
      const tasks = response?.tasks ?? response;
      return {
        items: Array.isArray(tasks) ? tasks : [],
        pagination: response?.pagination ?? null,
      };
    } catch (error) {
      console.error("Failed to fetch tasks:", error);
      return { items: [], pagination: null };
    }
  },

  // Back-compat array-returning wrapper.
  getAllTasks: async (params = null) => {
    const { items } = await taskService.getTasksPaginated(params);
    return items;
  },

  getTaskById: async (taskId) => {
    try {
      const response = await fetchWithAuth(`tasks/${taskId}`);
      return response?.task ?? response ?? null;
    } catch (error) {
      console.error('Failed to fetch task:', taskId, error);
      return null;
    }
  },

  createTask: async (taskData) => {
    return await fetchWithAuth('tasks', {
      method: 'POST',
      body: JSON.stringify(taskData)
    });
  },

  updateTask: async (taskId, taskData) => {
    return await fetchWithAuth(`tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(taskData)
    });
  },

  deleteTask: async (taskId) => {
    return await fetchWithAuth(`tasks/${taskId}`, {
      method: 'DELETE'
    });
  },

  getTaskComments: async (taskId) => {
    try {
      const response = await fetchWithAuth(`tasks/${taskId}/comments`);
      const comments = response?.comments ?? response;
      return Array.isArray(comments) ? comments : [];
    } catch (error) {
      console.error('Failed to fetch comments for task:', taskId, error);
      return [];
    }
  },

  addTaskComment: async (taskId, commentData) => {
    const response = await fetchWithAuth(`tasks/${taskId}/comments`, {
      method: 'POST',
      body: JSON.stringify(commentData)
    });

    return response?.comment ?? response;
  },

  getUsers: async () => {
    try {
      const response = await fetchWithAuth('users');
      const users = response?.users ?? response;
      return Array.isArray(users) ? users : [];
    } catch (error) {
      console.error('Failed to fetch users for task creation:', error);
      return [];
    }
  },

  getProjects: async () => {
    try {
      const response = await fetchWithAuth('projects');
      const projects = response?.projects ?? response;
      return Array.isArray(projects) ? projects : [];
    } catch (error) {
      console.error('Failed to fetch projects for task creation:', error);
      return [];
    }
  }
};

export { taskService };
export default taskService;
