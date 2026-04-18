import { authApi } from '../utils/auth';

const API_BASE_URL = (() => {
  const configuredBaseUrl = process.env.REACT_APP_API_URL;
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, '');
  }

  const protocol = window.location.protocol || 'http:';
  const hostname = window.location.hostname || 'localhost';
  return `${protocol}//${hostname}:8000/api/v1`;
})();

const BASE_URL = `${API_BASE_URL}/tasks`;

// Helper function for making authenticated fetch requests
const fetchWithAuth = async (url, options = {}) => {
  try {
    const user = authApi.getCurrentUser();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (user && user.token) {
      headers['Authorization'] = `Bearer ${user.token}`;
    }

    const fetchOptions = {
      ...options,
      headers,
      credentials: 'include' // Include cookies
    };

    const response = await fetch(url, fetchOptions);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.message || `HTTP error ${response.status}`);
      error.status = response.status;
      error.data = errorData;
      throw error;
    }
    
    if (response.status !== 204) { // No content
      return await response.json();
    }
    
    return {}; // Return empty object for 204 No Content
  } catch (error) {
    console.error('Fetch error in tasksApi:', error);
    throw error;
  }
};

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