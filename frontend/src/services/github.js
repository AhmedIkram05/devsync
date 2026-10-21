// GitHub integration service with improved error handling and token management
import { authApi } from './utils/auth';
import { fetchWithAuth } from './utils/api';

// Base URL for GitHub integration API endpoints
const API_BASE_URL = (() => {
  const configuredBaseUrl = process.env.REACT_APP_API_URL;
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, '');
  }

  const protocol = window.location.protocol || 'http:';
  const hostname = window.location.hostname || 'localhost';
  return process.env.NODE_ENV === 'development' ? `${protocol}//${hostname}:8000/api/v1` : `${protocol}//${hostname}/api/v1`;
})();

const BASE_URL = `${API_BASE_URL}/github`;

// Session-scoped OAuth CSRF storage (tab-isolated, cleared on tab close).
// Single owner of the exchange is GitHubCallback.jsx; AuthContext and
// GitHubIntegration must not initiate or complete the flow.
const OAUTH_STATE_KEY = 'github_oauth_state';
const OAUTH_STATE_TS_KEY = 'github_oauth_state_ts';
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const readStoredOAuthState = () => {
  try {
    const storedState = sessionStorage.getItem(OAUTH_STATE_KEY);
    const storedTsRaw = sessionStorage.getItem(OAUTH_STATE_TS_KEY);
    return { storedState, storedTs: storedTsRaw ? Number(storedTsRaw) : NaN };
  } catch {
    return { storedState: null, storedTs: NaN };
  }
};

const clearStoredOAuthState = () => {
  try {
    sessionStorage.removeItem(OAUTH_STATE_KEY);
    sessionStorage.removeItem(OAUTH_STATE_TS_KEY);
  } catch {
    // storage unavailable (private mode) — validation will fail closed below
  }
  try {
    localStorage.removeItem('github_oauth_state');
  } catch {
    // ignore legacy cleanup failures
  }
};

const generateFallbackState = () => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to Math.random fallback
  }
  return `oauth-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

// Collapse concurrent GET /github/status calls into one request. AuthContext
// and GitHubIntegration both verify on mount, which previously fired two
// identical status requests per page load. The in-flight promise is cleared
// once it settles so later mounts/refreshes still hit the network.
let inFlightConnectionStatus = null;

// GitHub integration API service
export const githubService = {
  // Check GitHub connection status
  checkConnectionStatus: async () => {
    if (inFlightConnectionStatus) {
      return inFlightConnectionStatus;
    }
    const request = (async () => {
      try {
        const data = await fetchWithAuth(`${BASE_URL}/status`);
        return data;
      } catch (error) {
        console.error('Error checking GitHub connection status:', error);
        return { connected: false, error: error.message };
      }
    })();
    inFlightConnectionStatus = request;
    try {
      return await request;
    } finally {
      inFlightConnectionStatus = null;
    }
  },
  
  // Alias for checkConnectionStatus to fix method name mismatch
  checkConnection: async () => {
    return githubService.checkConnectionStatus();
  },
  
  // Generate a state parameter with userId for GitHub OAuth
  createStateParam: (userId) => {
    // Create a simple state object with the user ID and a timestamp
    const stateObj = {
      userId: userId,
      timestamp: Date.now()
    };
    
    // Convert to base64
    return btoa(JSON.stringify(stateObj));
  },
  
  // Initiate GitHub OAuth flow — strict CSRF: server state + issuance time
  // stored in tab-scoped sessionStorage.
  initiateOAuthFlow: async () => {
    try {
      const user = authApi.getCurrentUser();

      // Check if we have a valid user with ID
      if (!user || !user.id) {
        throw new Error('User ID is required for GitHub connection. Please log in again.');
      }

      // Ask backend to build the OAuth URL and canonical state token.
      const response = await fetchWithAuth(`${BASE_URL}/connect`, {
        method: 'POST',
        body: JSON.stringify({
          userId: user.id
        })
      });

      // If we get an authorization URL, redirect to it
      if (response && response.authorization_url) {
        const serverState = response.state
          || (() => { try { return new URL(response.authorization_url).searchParams.get('state'); } catch { return null; } })();
        // Server state is canonical (backend only accepts server-signed states).
        // Fall back to a client nonce so validation still fails closed.
        const stateToStore = serverState || generateFallbackState();
        const issuedAt = Date.now();
        try {
          sessionStorage.setItem(OAUTH_STATE_KEY, stateToStore);
          sessionStorage.setItem(OAUTH_STATE_TS_KEY, String(issuedAt));
        } catch (storageError) {
          console.error('Error storing GitHub OAuth state:', storageError);
          throw new Error('Security validation failed. Please try connecting to GitHub again.');
        }
        try {
          localStorage.removeItem('github_oauth_state');
        } catch {
          // ignore legacy cleanup failures
        }
        // Return the URL for the component to handle the redirect
        return response.authorization_url;
      }

      throw new Error('No authorization URL received from server');
    } catch (error) {
      console.error('Error initiating GitHub OAuth flow:', error);
      throw error;
    }
  },

  // Complete GitHub OAuth flow with the code from callback.
  // Strict: exact state match + 10min TTL + single-use, else throw.
  completeOAuthFlow: async (code, state) => {
    try {
      const user = authApi.getCurrentUser();

      if (!user || !user.id) {
        console.error('No authenticated user found for GitHub callback');
        throw new Error('Authentication required. Please log in again before connecting GitHub.');
      }

      if (!code || !state) {
        throw new Error('Security validation failed. Please try connecting to GitHub again.');
      }

      const { storedState, storedTs } = readStoredOAuthState();

      if (!storedState) {
        throw new Error('Security validation failed. Please try connecting to GitHub again.');
      }

      if (state !== storedState) {
        console.error('OAuth state mismatch - potential CSRF attack');
        clearStoredOAuthState();
        throw new Error('Security validation failed. Please try connecting to GitHub again.');
      }

      if (!Number.isFinite(storedTs) || Date.now() - storedTs > OAUTH_STATE_TTL_MS) {
        console.error('OAuth state expired');
        clearStoredOAuthState();
        throw new Error('Security validation failed. Please try connecting to GitHub again.');
      }

      // Single-use: consume before the network call so a replay finds nothing.
      clearStoredOAuthState();

      // Send the code to the backend along with user information
      const data = await fetchWithAuth(`${BASE_URL}/callback`, {
        method: 'POST',
        body: JSON.stringify({
          code,
          state
        })
      });

      // If successful, update the user's GitHub connection status
      if (data && data.success) {
        // Update the local user state with GitHub connection info
        authApi.updateGitHubStatus(
          true,
          data.github_username || ''
        );
      }

      return data;
    } catch (error) {
      console.error('Error completing GitHub OAuth flow:', error);
      throw error;
    }
  },
  
  // Get user's GitHub repositories
  // NOTE: errors propagate to callers (all wrap in try/catch) so pages can
  // render rate-limit/offline UI instead of a misleading empty state.
  getUserRepos: async (options = {}) => {
    const params = new URLSearchParams();

    if (options.page) {
      params.set('page', String(options.page));
    }

    if (options.perPage) {
      params.set('per_page', String(options.perPage));
    }

    // Only fetch activity metrics when explicitly requested
    let url = `${BASE_URL}/repositories`;
    let timeoutMs = 30000; // default 30 second timeout

    if (options.activityWindowDays) {
      params.set('activity_window_days', String(options.activityWindowDays));
      params.set('include_activity', 'true'); // only set when activity is actually needed
      timeoutMs = 90000; // 90 seconds for activity-heavy requests
    } else {
      params.set('include_activity', 'false');
    }

    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    // Canonical timeout lives in fetchWithAuth (AbortController) — just
    // forward the deadline instead of racing here (no leaked setTimeout).
    const data = await fetchWithAuth(url, { timeout: timeoutMs });
    return data.repositories || data;
  },

  // Alias for getUserRepos to fix method name mismatch
  getUserRepositories: async (page = 1, perPage = 10) => {
    try {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        per_page: perPage.toString(),
        include_activity: 'false'
      }).toString();
      
      const data = await fetchWithAuth(`${BASE_URL}/repositories?${queryParams}`);
      return data.repositories || data;
    } catch (error) {
      console.error('Error fetching GitHub repositories:', error);
      return [];
    }
  },
  
  // Get repository issues
  getRepositoryIssues: async (repoId, options = {}) => {
    try {
      const { state = 'open', page = 1, perPage = 30 } = options;
      const queryParams = new URLSearchParams({
        state,
        page: page.toString(),
        per_page: perPage.toString()
      }).toString();
      
      const data = await fetchWithAuth(`${BASE_URL}/repositories/${repoId}/issues?${queryParams}`);
      return data.issues || data;
    } catch (error) {
      console.error('Error fetching issues for repository', repoId, error);
      return [];
    }
  },
  
  // Get repository pull requests
  getRepositoryPulls: async (repoId, options = {}) => {
    try {
      const { state = 'open', page = 1, perPage = 30 } = options;
      const queryParams = new URLSearchParams({
        state,
        page: page.toString(),
        per_page: perPage.toString()
      }).toString();
      
      const data = await fetchWithAuth(`${BASE_URL}/repositories/${repoId}/pulls?${queryParams}`);
      return data.pull_requests || data;
    } catch (error) {
      console.error('Error fetching pull requests for repository', repoId, error);
      return [];
    }
  },
  
  // Add a repository to track
  addRepository: async (repositoryData) => {
    try {
      const data = await fetchWithAuth(`${BASE_URL}/repositories`, {
        method: 'POST',
        body: JSON.stringify(repositoryData)
      });
      return data;
    } catch (error) {
      console.error('Error adding GitHub repository:', error);
      throw error;
    }
  },
  
  // Link a task with GitHub issue or PR
  linkTaskWithGitHub: async (taskId, linkData) => {
    try {
      const data = await fetchWithAuth(`${BASE_URL}/tasks/${taskId}/github`, {
        method: 'POST',
        body: JSON.stringify(linkData)
      });
      return data;
    } catch (error) {
      console.error('Error linking task', taskId, 'with GitHub:', error);
      throw error;
    }
  },
  
  // Get task's GitHub links
  getTaskGitHubLinks: async (taskId) => {
    try {
      const data = await fetchWithAuth(`${BASE_URL}/tasks/${taskId}/github`);
      return data.links || data;
    } catch (error) {
      console.error('Error fetching GitHub links for task', taskId, error);
      return [];
    }
  },
  
  // Delete a task's GitHub link
  deleteTaskGitHubLink: async (taskId, linkId) => {
    try {
      const data = await fetchWithAuth(`${BASE_URL}/tasks/${taskId}/github/${linkId}`, {
        method: 'DELETE'
      });
      return data;
    } catch (error) {
      console.error('Error deleting GitHub link', linkId, 'from task', taskId, error);
      throw error;
    }
  },

  // Backward-compatible aliases used by existing pages/components.
  getIssues: async (repoId, options = {}) => githubService.getRepositoryIssues(repoId, options),
  getPullRequests: async (repoId, options = {}) => githubService.getRepositoryPulls(repoId, options),
  linkTaskToGithub: async (taskId, linkData) => githubService.linkTaskWithGitHub(taskId, linkData),
  unlinkTaskFromGithub: async (taskId, linkId) => {
    if (typeof linkId === 'undefined') {
      throw new Error('Task ID and link ID are required to unlink GitHub issue');
    }
    return githubService.deleteTaskGitHubLink(taskId, linkId);
  },
  
  // Disconnect GitHub account
  disconnectAccount: async () => {
    try {
      const data = await fetchWithAuth(`${BASE_URL}/disconnect`, {
        method: 'POST'
      });
      return data;
    } catch (error) {
      console.error('Error disconnecting GitHub account:', error);
      throw error;
    }
  },

  // Handle GitHub API rate limit errors
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
    if (error?.status === 429) {
      return {
        title: "GitHub API Rate Limit Exceeded",
        message: "You've reached GitHub's API rate limit. Please wait a few minutes and try again.",
        suggestion: "Try again later.",
        retryAfter: error.retryAfter || error.data?.retryAfter || 60
      };
    }
    
    // If it's not a rate limit error, return null
    return null;
  },

  // Handle any server errors - including 500 Internal Server Error
  handleServerError: (error) => {
    if (error?.status === 500 || error?.isServerError) {
      return {
        title: 'GitHub Integration Server Error',
        message: error.message || 'An internal server error occurred with the GitHub integration.',
        suggestion: 'Please try the following:',
        steps: [
          'Check that your GitHub account has the necessary permissions',
          'Make sure you are logged in to both DevSync and GitHub',
          'Try logging out and logging back in to refresh your session',
          'Check if the DevSync server is running correctly'
        ],
        technicalDetails: error.data || {}
      };
    }
    return null;
  }
};
