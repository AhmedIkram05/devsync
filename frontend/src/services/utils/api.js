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
        
        if (!token) {
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
    
    // Create a timeout promise - use provided timeout or default to 30 seconds
    const timeoutMs = options.timeout || 8000;
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), timeoutMs);
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
    
    if (response.status === 403) {
      const error = new Error('Forbidden. You do not have permission to access this resource.');
      error.status = 403;
      error.isAuthError = true;
      
      // Redirect to forbidden page
      window.location.href = '/forbidden';
      
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
        return { error: error.message, status: error.status };
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
      const response = await fetchWithAuth('tasks');
      const tasks = response?.tasks ?? response;
      return Array.isArray(tasks) ? tasks : [];
    } catch (error) {
      console.error("Failed to fetch tasks:", error);
      return [];
    }
  },
  
  getTaskById: async (taskId) => {
    try {
      const response = await fetchWithAuth(`tasks/${taskId}`);
      return response?.task ?? response ?? null;
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
      const response = await fetchWithAuth(`tasks/${taskId}/comments`);
      const comments = response?.comments ?? response;
      return Array.isArray(comments) ? comments : [];
    } catch (error) {
      console.error(`Failed to fetch comments for task ${taskId}:`, error);
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

const getDateRangeStart = (dateRange) => {
  const now = new Date();

  switch (dateRange) {
    case 'month':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case 'quarter':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case 'year':
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    case 'week':
    default:
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
};

const getActivityWindowDays = (dateRange) => {
  switch (dateRange) {
    case 'month':
      return 30;
    case 'quarter':
      return 90;
    case 'year':
      return 365;
    case 'week':
    default:
      return 7;
  }
};

const isWithinDateRange = (isoDate, rangeStart) => {
  if (!isoDate) {
    return true;
  }

  const parsedDate = new Date(isoDate);
  if (Number.isNaN(parsedDate.getTime())) {
    return true;
  }

  return parsedDate >= rangeStart;
};

const toSafeMetricValue = (value, fallback = 0) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const normalizeGithubRepository = (repository = {}) => {
  const openIssues = toSafeMetricValue(
    repository.open_issues ?? repository.open_issues_count,
    0
  );
  const openPrs = toSafeMetricValue(repository.open_prs, 0);
  const recentCommits = toSafeMetricValue(repository.recent_commits, 0);

  return {
    ...repository,
    open_issues: openIssues,
    open_issues_count: toSafeMetricValue(repository.open_issues_count, openIssues),
    open_prs: openPrs,
    recent_commits: recentCommits,
    last_updated: repository.last_updated || repository.pushed_at || repository.updated_at || null,
  };
};


const normalizeTaskStatus = (status) => {
  if (status === 'completed') {
    return 'done';
  }

  return status;
};

const normalizeAdminDashboardTasks = (tasks = {}) => {
  const backlog = toSafeMetricValue(tasks.backlog, 0);
  const todo = toSafeMetricValue(tasks.todo, 0);
  const inProgress = toSafeMetricValue(tasks.in_progress, 0);
  const review = toSafeMetricValue(tasks.review, 0);
  const done = toSafeMetricValue(tasks.done, 0);

  return {
    ...tasks,
    total: toSafeMetricValue(tasks.total, backlog + todo + inProgress + review + done),
    active: todo + inProgress + review,
    completed: done,
    backlog,
    todo,
    in_progress: inProgress,
    review,
    done,
  };
};

const buildDeveloperProgress = (users, tasks) => {
  const progressTrackingRoles = new Set(['developer', 'team_lead']);
  const tasksByAssignee = new Map();

  tasks.forEach((task) => {
    if (task?.assigned_to === null || task?.assigned_to === undefined) {
      return;
    }

    const assigneeKey = String(task.assigned_to);
    if (!tasksByAssignee.has(assigneeKey)) {
      tasksByAssignee.set(assigneeKey, []);
    }

    tasksByAssignee.get(assigneeKey).push(task);
  });

  return users
    .filter((user) => progressTrackingRoles.has(user.role))
    .map((user) => {
      const userTasks = tasksByAssignee.get(String(user.id)) || [];
      let completedCount = 0;

      userTasks.forEach((task) => {
        if (normalizeTaskStatus(task.status) === 'done') {
          completedCount += 1;
        }
      });

      const recentTasks = [...userTasks]
        .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))
        .slice(0, 5);

      return {
        id: user.id,
        name: user.name,
        role: user.role,
        total_tasks: userTasks.length,
        completed_tasks: completedCount,
        active_tasks: userTasks.length - completedCount,
        recent_tasks: recentTasks
      };
    });
};

// Dashboard service for admin and member dashboards
const dashboardService = {
  getAdminDashboardStats: async (timeRange = 'week') => {
    try {
      const response = await fetchWithAuth(`dashboard/admin?timeRange=${timeRange}`);

      return {
        ...response,
        tasks: normalizeAdminDashboardTasks(response?.tasks),
      };
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
  
  getBasicDashboardStats: async () => {
    try {
      return await fetchWithAuth('dashboard/client');
    } catch (error) {
      console.error("Dashboard fetch error:", error);
      // Return fallback data structure
      return {
        taskCounts: { assigned: 0, inProgress: 0, completed: 0, dueSoon: 0 },
        tasks: { assigned: 0, inProgress: 0, completed: 0, dueSoon: 0 },
        recentTasks: [],
        githubActivity: [],
        projects: [],
        upcomingDeadlines: []
      };
    }
  },

  getDeveloperProgressStats: async () => {
    try {
      const [usersResponse, tasks] = await Promise.all([
        fetchWithAuth('users'),
        taskService.getAllTasks()
      ]);

      const users = Array.isArray(usersResponse?.users) ? usersResponse.users : [];
      const allTasks = Array.isArray(tasks) ? tasks : [];

      return buildDeveloperProgress(users, allTasks);
    } catch (error) {
      console.error('Failed to fetch developer progress stats:', error);
      return [];
    }
  },

  getReportData: async (reportType = 'tasks', dateRange = 'week') => {
    try {
      const rangeStart = getDateRangeStart(dateRange);
      const [tasks, usersResponse] = await Promise.all([
        taskService.getAllTasks(),
        fetchWithAuth('users').catch(() => ({ users: [] }))
      ]);

      const users = Array.isArray(usersResponse?.users) ? usersResponse.users : [];
      const scopedTasks = tasks.filter((task) => isWithinDateRange(task.created_at, rangeStart));

      if (reportType === 'developers') {
        const developers = buildDeveloperProgress(users, tasks);
        const totalTasks = developers.reduce((sum, developer) => sum + (developer.total_tasks || 0), 0);
        const completedTasks = developers.reduce((sum, developer) => sum + (developer.completed_tasks || 0), 0);
        const avgCompletion = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        return {
          summary: {
            developers: developers.length,
            avg_tasks: developers.length > 0 ? Math.round(totalTasks / developers.length) : 0,
            avg_completion: avgCompletion,
            active_devs: developers.filter((developer) => developer.active_tasks > 0).length
          },
          details: developers
        };
      }

      if (reportType === 'github') {
        const githubStatus = await fetchWithAuth('github/status').catch(() => ({ connected: false }));
        const connected = Boolean(githubStatus?.connected);
        const activityWindowDays = getActivityWindowDays(dateRange);
        const repositories = connected
          ? await githubService.getUserRepos({
            perPage: 100,
            fetchAll: true,
            activityWindowDays
          })
          : [];

        // Calculate totals from enriched repo data
        const openIssuesTotal = repositories.reduce((sum, repo) => sum + (repo.open_issues || 0), 0);
        const openPrsTotal = repositories.reduce((sum, repo) => sum + (repo.open_prs || 0), 0);
        const recentCommitsTotal = repositories.reduce((sum, repo) => sum + (repo.recent_commits || 0), 0);

        return {
          summary: {
            repos: repositories.length,
            open_issues: openIssuesTotal,
            open_prs: openPrsTotal,
            recent_commits: recentCommitsTotal
          },
          details: repositories
        };
      }

      const completed = scopedTasks.filter((task) => normalizeTaskStatus(task.status) === 'done').length;
      const inProgress = scopedTasks.filter((task) => normalizeTaskStatus(task.status) === 'in_progress').length;
      const overdue = scopedTasks.filter((task) => {
        if (!task.deadline) {
          return false;
        }

        return new Date(task.deadline) < new Date() && normalizeTaskStatus(task.status) !== 'done';
      }).length;

      return {
        summary: {
          total: scopedTasks.length,
          completed,
          in_progress: inProgress,
          overdue,
          team_members: users.length
        },
        details: scopedTasks
      };
    } catch (error) {
      console.error('Failed to fetch report data:', error);
      return {
        summary: {},
        details: []
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
  getUserRepos: async (options = {}) => {
    try {
      const params = new URLSearchParams();

      if (options.page) {
        params.set('page', String(options.page));
      }

      if (options.perPage) {
        params.set('per_page', String(options.perPage));
      }

      if (options.fetchAll) {
        params.set('all_pages', 'true');
      }

      // Only fetch activity metrics when explicitly requested
      let timeoutOverride = 30000; // default timeout
      if (options.activityWindowDays) {
        params.set('activity_window_days', String(options.activityWindowDays));
        params.set('include_activity', 'true'); // only set when activity is actually needed
        timeoutOverride = 90000; // 90 seconds for activity-heavy requests
      } else {
        params.set('include_activity', 'false');
      }

      if (options.fetchAll) {
        timeoutOverride = Math.max(timeoutOverride, 120000);
      }

      const endpoint = params.toString()
        ? `github/repositories?${params.toString()}`
        : 'github/repositories';
      const response = await fetchWithAuth(endpoint, {
        timeout: timeoutOverride
      });
      
      // Handle potential errors or empty responses
      if (response.error) {
        return [];
      }
      
      const repositories = response?.repositories || response || [];
      return Array.isArray(repositories)
        ? repositories.map((repository) => normalizeGithubRepository(repository))
        : [];
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

  getTaskGithubLinks: async (taskId) => {
    try {
      const response = await fetchWithAuth(`tasks/${taskId}/github`);
      const links = response?.links ?? response;
      return Array.isArray(links) ? links : [];
    } catch (error) {
      console.error(`Failed to get GitHub links for task ${taskId}:`, error);
      return [];
    }
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
  getAllUsers: async () => {
    try {
      const response = await fetchWithAuth('users');
      const users = response?.users ?? response;
      return Array.isArray(users) ? users : [];
    } catch (error) {
      console.error("Failed to fetch all users:", error);
      return [];
    }
  },

  getAllDevelopers: async () => {
    try {
      const response = await fetchWithAuth('users?role=developer');
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
      if (response?.isConnectionError) {
        return response;
      }

      if (response?.isAuthError || (response?.error && !response?.status)) {
        return [];
      }

      if (response?.error) {
        const error = new Error(response.error);
        error.status = response.status;
        throw error;
      }
      
      return response?.notifications || response || [];
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
      if (error?.isConnectionError) {
        return {
          error: error.message,
          isConnectionError: true
        };
      }
      throw error;
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


// Report service
const reportService = {
  saveReport: async (reportType, dateRange, summary, details) => {
    try {
      const response = await fetchWithAuth('reports', {
        method: 'POST',
        body: JSON.stringify({
          report_type: reportType,
          date_range: dateRange,
          summary,
          details
        })
      });
      return response;
    } catch (error) {
      console.error('Failed to save report:', error);
      return { error: error.message };
    }
  },

  getSavedReports: async (filter = {}) => {
    try {
      let endpoint = 'reports';
      const params = new URLSearchParams();
      
      if (filter.type) params.append('type', filter.type);
      if (filter.dateRange) params.append('dateRange', filter.dateRange);
      if (filter.page) params.append('page', filter.page);
      if (filter.per_page) params.append('per_page', filter.per_page);
      
      const queryString = params.toString();
      if (queryString) {
        endpoint = `${endpoint}?${queryString}`;
      }
      
      const response = await fetchWithAuth(endpoint);
      return response;
    } catch (error) {
      console.error('Failed to fetch saved reports:', error);
      return { error: error.message, reports: [] };
    }
  },

  getReportById: async (reportId) => {
    try {
      const response = await fetchWithAuth(`reports/${reportId}`);
      return response;
    } catch (error) {
      console.error(`Failed to fetch report ${reportId}:`, error);
      return { error: error.message };
    }
  },

  deleteReport: async (reportId) => {
    try {
      const response = await fetchWithAuth(`reports/${reportId}`, {
        method: 'DELETE'
      });
      return response;
    } catch (error) {
      console.error(`Failed to delete report ${reportId}:`, error);
      return { error: error.message };
    }
  }
};

// Admin user management service
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

// System settings service
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
  }
};

// Audit log service
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
      console.error(`Failed to fetch audit log ${logId}:`, error);
      return null;
    }
  }
};

export {
  fetchWithAuth,
  taskService,
  projectService,
  githubService,
  userService,
  dashboardService,
  notificationService,
  reportService,
  adminUserService,
  settingsService,
  auditLogService
};
