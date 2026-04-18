const API_URL = (() => {
  const configuredBaseUrl = process.env.REACT_APP_API_URL;
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, '');
  }

  const protocol = window.location.protocol || 'http:';
  const hostname = window.location.hostname || 'localhost';
  return `${protocol}//${hostname}:8000/api/v1`;
})();

/**
 * Enhanced fetch utility that handles authentication and error handling
 */
const fetchWithAuth = async (endpoint, options = {}) => {
  try {
    // Get auth token from localStorage with improved error handling
    let user = null;
    let token = null;
    
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        user = JSON.parse(userStr);
        token = user?.token;
        
        // Debug log to help identify token issues
        if (token) {
          const tokenPreview = token.substring(0, 10) + '...';
          console.debug(`Using auth token for ${endpoint}: ${tokenPreview}`);
        } else {
          console.warn(`No token found for authenticated request to ${endpoint}`);
        }
      }
    } catch (e) {
      console.error("Error parsing user from localStorage:", e);
      localStorage.removeItem('user'); // Clear corrupted data
    }
    
    // Set up default headers
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers || {})
    };
    
    // Add auth token if available - use token from options first, then fallback to localStorage
    if (options.headers?.Authorization) {
      // Use the token provided in options (used in github.js)
      console.debug(`Using explicit Authorization header for ${endpoint}`);
    } else if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    
    // Configure fetch options
    const fetchOptions = {
      ...options,
      headers,
      credentials: 'include', // Important for cookies/auth
    };
    
    // Make sure we don't override the headers with empty ones
    if (options.headers) {
      fetchOptions.headers = {
        ...headers,
        ...options.headers
      };
    }
    
    // Create URL - handle both cases with or without leading slash
    const url = `${API_URL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    
    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), 8000);
    });
    
    // Create the fetch promise with error handling for network issues
    const fetchPromise = fetch(url, fetchOptions)
      .catch(error => {
        if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
          // This typically means the server is down or unreachable
          const connectionError = new Error('Server connection failed. Please check if the server is running.');
          connectionError.isConnectionError = true;
          throw connectionError;
        }
        throw error;
      });
    
    // Race between the fetch and timeout
    const response = await Promise.race([fetchPromise, timeoutPromise]);
    
    // Handle non-critical endpoints - avoid crashing the app for these endpoints
    const isNonCriticalEndpoint = endpoint.includes('github/status') || 
                                  endpoint.includes('notifications');
    
    // For github/connect add to non-critical list
    const isGitHubEndpoint = endpoint.includes('github/connect') ||
                             endpoint.includes('github/callback');
    
    // Special handling for different status codes
    if (response.status === 204) {
      return {}; // No content response
    }
    
    if (response.status === 401) {
      const error = new Error('Authentication failed. Token may be expired or invalid.');
      error.status = 401;
      error.isAuthError = true;
      
      // For non-critical endpoints, return gracefully instead of throwing
      if (isNonCriticalEndpoint) {
        console.error(error.message);
        return { error: error.message, isAuthError: true };
      }
      
      throw error;
    }
    
    if (response.status === 400 && isGitHubEndpoint) {
      // Handle GitHub specific errors more gracefully
      let errorData = {};
      try {
        errorData = await response.json();
      } catch (e) {
        console.error('Error parsing GitHub error response:', e);
      }
      
      const errorMsg = errorData.message || 'GitHub connection failed. Please try again.';
      console.error(`GitHub API error (400): ${errorMsg}`);
      
      // Create a structured error
      const error = new Error(errorMsg);
      error.status = 400;
      error.data = errorData;
      error.isGitHubError = true;
      
      throw error;
    }
    
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || 30;
      const error = new Error('Rate limit exceeded. Too many requests.');
      error.status = 429;
      error.retryAfter = parseInt(retryAfter, 10);
      throw error;
    }
    
    if (!response.ok) {
      let errorData = {};
      
      // Try to parse error data if available
      try {
        if (response.headers.get('content-type')?.includes('application/json')) {
          errorData = await response.json();
        }
      } catch (e) {
        console.error('Error parsing error response:', e);
      }
      
      const error = new Error(errorData.message || `Request failed with status: ${response.status}`);
      error.status = response.status;
      error.data = errorData;
      
      // For non-critical endpoints, return gracefully instead of throwing
      if (isNonCriticalEndpoint) {
        console.error(`Returning empty data for non-critical endpoint due to error`);
        return { error: error.message };
      }
      
      throw error;
    }
    
    // Check if the response has content
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }
    
    return {};
  } catch (error) {
    // Special handling for connection errors
    if (error.isConnectionError) {
      console.error(`Server connection error: ${error.message}`);
      return { error: error.message, isConnectionError: true };
    }
    
    console.error(`API request to ${endpoint} failed:`, error);
    throw error;
  }
};

// Task related API calls
const taskService = {
  getAllTasks: async () => {
    try {
      return await fetchWithAuth('tasks');
    } catch (error) {
      console.error("Failed to fetch tasks:", error);
      return [];
    }
  },
  
  getTaskById: async (taskId) => {
    try {
      return await fetchWithAuth(`tasks/${taskId}`);
    } catch (error) {
      console.error(`Failed to fetch task ${taskId}:`, error);
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
      return await fetchWithAuth(`tasks/${taskId}/comments`);
    } catch (error) {
      console.error(`Failed to fetch comments for task ${taskId}:`, error);
      return [];
    }
  },
  
  addTaskComment: async (taskId, commentData) => {
    return await fetchWithAuth(`tasks/${taskId}/comments`, {
      method: 'POST',
      body: JSON.stringify(commentData)
    });
  }
};

// Dashboard service for admin and client dashboards
const dashboardService = {
  getAdminDashboardStats: async (timeRange = 'week') => {
    try {
      return await fetchWithAuth(`dashboard/admin?timeRange=${timeRange}`);
    } catch (error) {
      console.error("Dashboard fetch error:", error);
      // Return fallback data structure
      return {
        projects: { total: 0 },
        tasks: { active: 0, completed: 0 },
        users: { total: 0 },
        recentProjects: []
      };
    }
  },
  
  getClientDashboardStats: async () => {
    try {
      return await fetchWithAuth('dashboard/client');
    } catch (error) {
      console.error("Dashboard fetch error:", error);
      // Return fallback data structure
      return {
        tasks: { active: 0, completed: 0 },
        repositories: [],
        recentActivity: []
      };
    }
  }
};

// Enhanced GitHub service with better error handling
const githubService = {
  // Check if user is connected to GitHub
  checkConnection: async () => {
    try {
      const response = await fetchWithAuth('github/status');
      
      // Handle potential auth error responses (not thrown in fetchWithAuth for non-critical endpoints)
      if (response.error || response.isAuthError) {
        return { connected: false, username: '' };
      }
      
      return response || { connected: false, username: '' };
    } catch (error) {
      console.error("Error checking GitHub connection status:", error);
      return { connected: false, username: '' };
    }
  },
  
  // Get GitHub authorization URL
  initiateOAuthFlow: async () => {
    const response = await fetchWithAuth('github/connect');
    if (!response || !response.authorization_url) {
      throw new Error("Could not get GitHub authorization URL");
    }
    return response.authorization_url;
  },
  
  // Complete OAuth flow with code
  completeOAuthFlow: async (code) => {
    return await fetchWithAuth('github/callback', {
      method: 'POST',
      body: JSON.stringify({ code })
    });
  },
  
  // Get user's repositories
  getUserRepos: async () => {
    try {
      const response = await fetchWithAuth('github/repositories');
      
      // Handle potential errors or empty responses
      if (response.error) {
        return [];
      }
      
      return response?.repositories || response || [];
    } catch (error) {
      console.error("Failed to get GitHub repositories:", error);
      return [];
    }
  },
  
  // Get repository issues
  getIssues: async (repoId) => {
    try {
      const response = await fetchWithAuth(`github/repositories/${repoId}/issues`);
      return response?.issues || response || [];
    } catch (error) {
      console.error(`Failed to get issues for repository ${repoId}:`, error);
      return [];
    }
  },
  
  // Get repository pull requests
  getPullRequests: async (repoId) => {
    try {
      const response = await fetchWithAuth(`github/repositories/${repoId}/pulls`);
      return response?.pulls || response || [];
    } catch (error) {
      console.error(`Failed to get pull requests for repository ${repoId}:`, error);
      return [];
    }
  },
  
  // Link task with GitHub issue
  linkTaskToGithub: async (taskId, linkData) => {
    return await fetchWithAuth(`tasks/${taskId}/github`, {
      method: 'POST',
      body: JSON.stringify(linkData)
    });
  },
  
  // Unlink task from GitHub issue
  unlinkTaskFromGithub: async (taskId, linkId) => {
    return await fetchWithAuth(`tasks/${taskId}/github/${linkId}`, {
      method: 'DELETE'
    });
  },
  
  // Disconnect GitHub account
  disconnectAccount: async () => {
    return await fetchWithAuth('github/disconnect', {
      method: 'POST'
    });
  },
  
  // Handle rate limit error
  handleRateLimitError: (error) => {
    // Check if error is related to rate limiting
    if (error?.status === 403 && error?.data?.message?.includes('rate limit')) {
      console.log('GitHub API rate limit error detected', error.data);
      
      // Extract rate limit information if available
      const rateLimitInfo = {
        title: 'GitHub API Rate Limit Exceeded',
        message: 'You have reached the GitHub API rate limit. Please wait before making more requests.',
        suggestion: 'Try again in a few minutes when the rate limit resets.'
      };
      
      // If we have detailed rate limit headers from GitHub, add them
      if (error.data?.documentation_url) {
        rateLimitInfo.documentationUrl = error.data.documentation_url;
      }
      
      return rateLimitInfo;
    }
    
    // Also check for 429 status code (Too Many Requests)
    if (error && error.status === 429) {
      return {
        title: "GitHub API Rate Limit Exceeded",
        message: "You've reached GitHub's API rate limit. Please wait a few minutes and try again.",
        suggestion: "Try again later.",
        retryAfter: error.retryAfter || 60
      };
    }
    
    // If it's not a rate limit error, return null
    return null;
  }
};

// User-related API calls
const userService = {
  getAllDevelopers: async () => {
    try {
      const response = await fetchWithAuth('users?role=client');
      return response || [];
    } catch (error) {
      console.error("Failed to fetch developers:", error);
      return [];
    }
  },
  
  getDeveloperProgress: async (userId) => {
    try {
      return await fetchWithAuth(`users/${userId}/progress`);
    } catch (error) {
      console.error(`Failed to fetch progress for user ${userId}:`, error);
      return null;
    }
  }
};

// Notification service
const notificationService = {
  getNotifications: async () => {
    try {
      const response = await fetchWithAuth('notifications');
      
      // Handle potential auth errors
      if (response.error) {
        return [];
      }
      
      return response?.notifications || response || [];
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
      return [];
    }
  },
  
  markAsRead: async (notificationId) => {
    return await fetchWithAuth(`notifications/${notificationId}/read`, {
      method: 'PUT'
    });
  },
  
  markAllAsRead: async () => {
    return await fetchWithAuth('notifications/read-all', {
      method: 'PUT'
    });
  }
};

export {
  fetchWithAuth,
  taskService,
  githubService,
  userService,
  dashboardService,
  notificationService
};
