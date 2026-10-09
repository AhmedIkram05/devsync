const API_BASE_URL = (() => {
  const configuredBaseUrl = process.env.REACT_APP_API_URL;
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, '');
  }

  const protocol = window.location.protocol || 'http:';
  const hostname = window.location.hostname || 'localhost';
  return process.env.NODE_ENV === 'development' ? `${protocol}//${hostname}:8000/api/v1` : `${protocol}//${hostname}/api/v1`;
})();

const API_URL = `${API_BASE_URL}/auth`;

const SENSITIVE_KEYS = new Set([
  'token',
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'refresh-token',
]);

const sanitizeUser = (user) => {
  if (!user || typeof user !== 'object') return user;
  const clean = { ...user };
  SENSITIVE_KEYS.forEach((key) => {
    delete clean[key];
  });
  return clean;
};

const persistProfile = (user) => {
  const clean = sanitizeUser(user);
  localStorage.setItem('user', JSON.stringify(clean));
  return clean;
};

const readCookie = (name) => {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
};

// The API accepts the JWT from a cookie, so every mutating request needs the
// matching double-submit token echoed back in a header. Access and refresh
// tokens carry different csrf claims, hence the argument.
export const csrfHeaders = (token = 'access') => ({
  'X-CSRF-TOKEN': readCookie(`csrf_${token}_token`),
});

// Helper function to handle fetch with proper error handling
const fetchWrapper = async (url, { csrf, ...options } = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: { ...csrfHeaders(csrf), ...options.headers },
    credentials: 'include', // Always include cookies
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || 'API request failed');
    error.data = data;
    error.status = response.status;
    throw error;
  }

  return data;
};

export const authApi = {
  register: async (userData) => {
    try {
      const data = await fetchWrapper(`${API_URL}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      if (data.user) {
        const clean = persistProfile(data.user);
        return { ...data, user: clean };
      }

      return data;
    } catch (error) {
      console.error("Registration error:", error);
      throw error;
    }
  },

  login: async (credentials) => {
    try {
      const data = await fetchWrapper(`${API_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      if (data.user) {
        const clean = persistProfile({
          ...data.user,
          github_connected: data.user.github_connected || false,
          github_username: data.user.github_username || ''
        });

        return { ...data, user: clean };
      } else {
        console.error("Login response doesn't contain user data:", data);
        return data;
      }
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    }
  },

  logout: async () => {
    try {
      await fetchWrapper(`${API_URL}/logout`, {
        method: 'POST',
      });

      localStorage.removeItem('user');
      return { success: true };
    } catch (error) {
      console.error("Logout error:", error);
      // Still remove the user from localStorage even if the API call fails
      localStorage.removeItem('user');
      throw error;
    }
  },

  getCurrentUser: () => {
    try {
      const userJson = localStorage.getItem('user');
      if (!userJson) {
        return null;
      }

      const user = JSON.parse(userJson);

      // Validate the user object has minimum required fields
      if (!user || !user.id || !user.email) {
        console.warn("Incomplete user data in localStorage - missing required fields");
        return null;
      }

      // Strip legacy token material if present and re-persist clean profile
      const hasSensitive = Object.keys(user).some((key) => SENSITIVE_KEYS.has(key));
      if (hasSensitive) {
        return persistProfile(user);
      }

      return user;
    } catch (error) {
      console.error("Error parsing user from localStorage:", error);
      // If there's an error parsing, clear the localStorage
      localStorage.removeItem('user');
      return null;
    }
  },

  // Validate the cookie session against the server. Returns { user, exp }.
  verifySession: async () => {
    const data = await fetchWrapper(`${API_URL}/me`, {
      method: 'GET',
    });

    if (!data || !data.user) {
      throw new Error('Session validation failed - no user in response');
    }

    const clean = persistProfile({
      ...data.user,
      exp: data.exp ?? data.user.exp,
    });

    return { user: clean, exp: data.exp ?? data.user.exp ?? null };
  },

  // Rotate the cookie session via the refresh cookie, then re-read profile.
  refreshToken: async () => {
    try {
      await fetchWrapper(`${API_URL}/refresh`, {
        method: 'POST',
        csrf: 'refresh',
      });

      const session = await authApi.verifySession();
      return session.user;

    } catch (error) {
      console.error("Token refresh error:", error);

      // If refresh fails with unauthorized, the session is likely completely expired
      if (error.status === 401) {
        console.warn("Session expired, clearing user data");
        localStorage.removeItem('user');
      }

      throw error;
    }
  },

  // Best-effort local expiry hint from the profile's exp (populated by /me).
  // Without exp we cannot determine expiry locally — return false and let a
  // 401 from the API trigger a cookie refresh.
  isTokenExpired: () => {
    try {
      const user = authApi.getCurrentUser();
      if (!user) return true;

      if (user.exp) {
        const currentTime = Math.floor(Date.now() / 1000);
        return currentTime > (user.exp - 300);
      }

      return false;
    } catch (error) {
      console.error("Error checking token expiration:", error);
      return true;
    }
  },

  // Improved method to update GitHub connection status in local storage
  updateGitHubStatus: (connected, username = '') => {
    const user = authApi.getCurrentUser();

    if (user) {
      const updatedUser = persistProfile({
        ...user,
        github_connected: connected,
        github_username: username || user.github_username || ''
      });

      return updatedUser;
    } else {
      console.warn("Cannot update GitHub status - no user found in localStorage");
      return null;
    }
  }
};
