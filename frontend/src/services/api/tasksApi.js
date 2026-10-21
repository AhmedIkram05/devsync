import { fetchWithAuth } from '../utils/api';

const API_BASE_URL = (() => {
  const configuredBaseUrl = process.env.REACT_APP_API_URL;
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, '');
  }

  const protocol = window.location.protocol || 'http:';
  const hostname = window.location.hostname || 'localhost';
  return process.env.NODE_ENV === 'development' ? `${protocol}//${hostname}:8000/api/v1` : `${protocol}//${hostname}/api/v1`;
})();

const BASE_URL = `${API_BASE_URL}/tasks`;

export const tasksApi = {
  // Get all tasks
  getAllTasks: async () => {
    return await fetchWithAuth(`${BASE_URL}`);
  },
  
  // Get single task
  getTaskById: async (taskId) => {
    return await fetchWithAuth(`${BASE_URL}/${taskId}`);
  },
  
  // Update task
  updateTask: async (taskId, data) => {
    return await fetchWithAuth(`${BASE_URL}/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },
  
  // Create new task
  createTask: async (data) => {
    return await fetchWithAuth(`${BASE_URL}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  
  // Delete task
  deleteTask: async (taskId) => {
    return await fetchWithAuth(`${BASE_URL}/${taskId}`, {
      method: 'DELETE'
    });
  },
  
  // Add comment to task
  addComment: async (taskId, comment) => {
    return await fetchWithAuth(`${BASE_URL}/${taskId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ comment })
    });
  }
  // Add other task-related API calls as needed
};