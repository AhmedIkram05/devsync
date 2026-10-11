import { fetchWithAuth } from './client';

const projectService = {
  getAllProjects: async () => {
    try {
      const response = await fetchWithAuth('projects');
      const projects = response?.projects ?? response;
      return Array.isArray(projects) ? projects : [];
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      return [];
    }
  },

  getProjectById: async (projectId) => {
    try {
      const response = await fetchWithAuth(`projects/${projectId}`);
      return response?.project ?? response ?? null;
    } catch (error) {
      console.error(`Failed to fetch project ${projectId}:`, error);
      return null;
    }
  },

  getProjectTasks: async (projectId) => {
    try {
      const response = await fetchWithAuth(`projects/${projectId}/tasks`);
      const tasks = response?.tasks ?? response;
      return Array.isArray(tasks) ? tasks : [];
    } catch (error) {
      console.error(`Failed to fetch tasks for project ${projectId}:`, error);
      return [];
    }
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
