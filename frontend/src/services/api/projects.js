import { fetchWithAuth } from './client';

const buildQueryString = (params = {}) => {
  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      queryParams.set(key, String(value));
    }
  });
  return queryParams.toString();
};

const projectService = {
  // Pagination-aware list: returns { items, pagination }.
  getAllProjectsPaginated: async (params = {}) => {
    try {
      const queryString = buildQueryString(params);
      const response = await fetchWithAuth(queryString ? `projects?${queryString}` : 'projects');
      const projects = response?.projects ?? response;
      return {
        items: Array.isArray(projects) ? projects : [],
        pagination: response?.pagination ?? null,
      };
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      return { items: [], pagination: null };
    }
  },

  // Back-compat array-returning wrapper; forwards the same params as the
  // paginated variant (e.g. page/per_page for dropdown lookups).
  getAllProjects: async (params = {}) => {
    const { items } = await projectService.getAllProjectsPaginated(params);
    return items;
  },

  getProjectById: async (projectId) => {
    try {
      const response = await fetchWithAuth(`projects/${projectId}`);
      return response?.project ?? response ?? null;
    } catch (error) {
      console.error('Failed to fetch project:', projectId, error);
      return null;
    }
  },

  // Pagination-aware project-task list: returns { items, pagination }.
  getProjectTasksPaginated: async (projectId, params = {}) => {
    try {
      const queryString = buildQueryString(params);
      const response = await fetchWithAuth(
        queryString ? `projects/${projectId}/tasks?${queryString}` : `projects/${projectId}/tasks`
      );
      const tasks = response?.tasks ?? response;
      return {
        items: Array.isArray(tasks) ? tasks : [],
        pagination: response?.pagination ?? null,
      };
    } catch (error) {
      console.error('Failed to fetch tasks for project:', projectId, error);
      return { items: [], pagination: null };
    }
  },

  // Back-compat array-returning wrapper.
  getProjectTasks: async (projectId) => {
    const { items } = await projectService.getProjectTasksPaginated(projectId);
    return items;
  },

  createProject: async (projectData) => {
    return await fetchWithAuth('projects', {
      method: 'POST',
      body: JSON.stringify(projectData)
    });
  },

  updateProject: async (projectId, projectData) => {
    return await fetchWithAuth(`projects/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify(projectData)
    });
  },

  deleteProject: async (projectId) => {
    return await fetchWithAuth(`projects/${projectId}`, {
      method: 'DELETE'
    });
  }
};

export { projectService };
export default projectService;
