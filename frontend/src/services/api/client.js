import { csrfHeaders } from '../utils/auth';

const API_URL = (() => {
  const configuredBaseUrl = process.env.REACT_APP_API_URL;
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, '');
  }

  const protocol = window.location.protocol || 'http:';
  const hostname = window.location.hostname || 'localhost';
  return process.env.NODE_ENV === 'development' ? `${protocol}//${hostname}:8000/api/v1` : `${protocol}//${hostname}/api/v1`;
})();

/**
 * Cookie-auth fetch utility. JWTs travel in HttpOnly cookies; the browser
 * attaches them via credentials:include and we echo the double-submit CSRF
 * token. No Bearer headers — raw tokens must never touch JS/localStorage.
 */
const stripAuthHeader = (headers = {}) => {
  const clean = { ...headers };
  Object.keys(clean).forEach((key) => {
    if (key.toLowerCase() === 'authorization') {
      delete clean[key];
    }
  });
  return clean;
};

// Auth endpoints must never trigger the 401 refresh-and-retry path: a 401 on
// these is a real credential failure, and recursion on /auth/refresh would loop.
const isExcludedFromRefresh = (endpoint = '') =>
  endpoint.includes('auth/refresh') ||
  endpoint.includes('auth/login') ||
  endpoint.includes('auth/register');

// Cookie session access tokens are short-lived; when one expires mid-session
// every request 401s at once. A single in-flight refresh is shared by all
// concurrent callers so the rotation happens once, not once per request.
let inFlightRefresh = null;

const refreshAccessToken = () => {
  if (!inFlightRefresh) {
    inFlightRefresh = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: stripAuthHeader({
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...csrfHeaders('refresh'),
      }),
      credentials: 'include',
    }).then((response) => {
      if (!response.ok) {
        throw new Error('Token refresh failed.');
      }
      return true;
    }).finally(() => {
      inFlightRefresh = null;
    });
  }

  return inFlightRefresh;
};

const fetchWithAuth = async (endpoint, options = {}) => {
  try {
    // Set up default headers — cookies carry auth, CSRF header proves origin.
    const headers = stripAuthHeader({
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...csrfHeaders(),
      ...(options.headers || {})
    });
    const sanitizedHeaders = stripAuthHeader(headers);

    // Configure fetch options
    const fetchOptions = {
      ...options,
      headers: sanitizedHeaders,
      credentials: 'include', // Important for cookies/auth
    };

    // Make sure we don't override the headers with empty ones
    if (options.headers) {
      fetchOptions.headers = {
        ...sanitizedHeaders,
        ...stripAuthHeader(options.headers)
      };
    }

    // Create URL - absolute URLs (from consolidated callers) pass through,
    // relative endpoints resolve against API_URL.
    const isAbsoluteUrl = /^https?:\/\//i.test(endpoint);
    const url = isAbsoluteUrl ? endpoint : `${API_URL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;

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
      // Expired access token: rotate the cookie session once, then retry the
      // original request. Guarded so auth endpoints and an already-retried
      // request fall straight through to the error below (no loop).
      if (!options.__authRetried && !isExcludedFromRefresh(endpoint)) {
        try {
          await refreshAccessToken();
          return await fetchWithAuth(endpoint, { ...options, __authRetried: true });
        } catch (refreshError) {
          // Refresh failed — surface the original auth error below.
        }
      }

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
      const retryAfter = response.headers?.get?.('Retry-After') || 30;
      const error = new Error('Rate limit exceeded. Too many requests.');
      error.status = 429;
      error.retryAfter = parseInt(retryAfter, 10);
      throw error;
    }

    if (!response.ok) {
      let errorData = {};

      // Try to parse error data if available
      try {
        if (response.headers?.get?.('content-type')?.includes('application/json')) {
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
    const contentType = response.headers?.get?.('content-type');
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

export { API_URL, fetchWithAuth };
export default fetchWithAuth;
