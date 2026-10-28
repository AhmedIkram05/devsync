// Back-compat shim: domain services live in services/api/*, this module
// re-exports them so all 57 existing import paths keep working.
import { fetchWithAuth } from '../api/client';
import { taskService } from '../api/tasks';
import { projectService } from '../api/projects';
import {
  dashboardService,
  normalizeTaskReportDetails,
  getDateRangeStart,
  getActivityWindowDays,
  isWithinDateRange,
} from '../api/dashboard';
import { reportService } from '../api/reports';
import { adminUserService, settingsService, auditLogService } from '../api/admin';

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

  // Complete OAuth flow — back-compat forward to the strict contract.
  // Requires code+state; throws before any network call if state is missing
  // so the insecure {code}-only path can never reach the backend.
  completeOAuthFlow: async (code, state) => {
    if (!code || !state) {
      throw new Error('Security validation failed. Please try connecting to GitHub again.');
    }
    return await fetchWithAuth('github/callback', {
      method: 'POST',
      body: JSON.stringify({ code, state })
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
      const toSafeMetricValue = (value, fallback = 0) => {
        const numericValue = Number(value);
        return Number.isFinite(numericValue) ? numericValue : fallback;
      };
      const normalizeGithubRepository = (repository = {}) => {
        const openIssues = toSafeMetricValue(
          repository.open_issues ?? repository.open_issues_count,
          0
        );
        return {
          ...repository,
          open_issues: openIssues,
          open_issues_count: toSafeMetricValue(repository.open_issues_count, openIssues),
          total_prs: toSafeMetricValue(repository.total_prs, 0),
          recent_commits: toSafeMetricValue(repository.recent_commits, 0),
          last_updated: repository.last_updated || repository.pushed_at || repository.updated_at || null,
        };
      };
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
      console.error('Failed to get issues for repository', repoId, error);
      return [];
    }
  },

  // Get repository pull requests
  getPullRequests: async (repoId) => {
    try {
      const response = await fetchWithAuth(`github/repositories/${repoId}/pulls`);
      return response?.pulls || response || [];
    } catch (error) {
      console.error('Failed to get pull requests for repository', repoId, error);
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
      console.error('Failed to get GitHub links for task', taskId, error);
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
  // Accepts an optional query string (e.g. '?page=2&per_page=100') so callers
  // can page past the backend's 100-item per_page cap.
  getAllUsers: async (queryString = '') => {
    try {
      const response = await fetchWithAuth(`users${queryString}`);
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
      console.error('Failed to fetch progress for user', userId, error);
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
  },

  deleteNotification: async (notificationId) => {
    return await fetchWithAuth(`notifications/${notificationId}`, {
      method: 'DELETE'
    });
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
  auditLogService,
  normalizeTaskReportDetails,
  getDateRangeStart,
  getActivityWindowDays,
  isWithinDateRange
};

export default fetchWithAuth;
