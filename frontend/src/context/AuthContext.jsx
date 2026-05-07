import { createContext, useState, useContext, useEffect, useRef } from 'react';
import { authApi } from '../services/utils/auth';
import { githubService } from '../services/github';
import { useNavigate, useLocation } from 'react-router-dom';
import { hasRole, hasPermission } from '../utils/rbac';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

const VALID_ROLES = new Set(["developer", "team_lead", "admin"]);
const DEFAULT_ROLE = "developer";

const hasValidRole = (user) => user?.role && VALID_ROLES.has(user.role);

export const AuthProvider = ({ children }) => {
  // Try to load user immediately during component initialization to prevent flicker
  const initialUser = (() => {
    try {
      const userJson = localStorage.getItem('user');
      if (userJson) {
        const userData = JSON.parse(userJson);
        if (userData && userData.id && userData.token && hasValidRole(userData)) {
          return userData;
        }
        localStorage.removeItem('user');
      }
    } catch (e) {
      console.error("Error initializing user from localStorage:", e);
      localStorage.removeItem('user');
    }
    return null;
  })();

  // State management
  const [currentUser, setCurrentUser] = useState(initialUser);
  const [loading, setLoading] = useState(!initialUser);
  const [error, setError] = useState(null);
  const [githubConnected, setGithubConnected] = useState(initialUser?.github_connected || false);
  const [showGithubPrompt, setShowGithubPrompt] = useState(false);
  const [authInProgress, setAuthInProgress] = useState(false);
  const [permissions, setPermissions] = useState(initialUser?.permissions || []);

  // Keep a ref to track initialization
  const isInitialized = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Function to verify token
  const verifyToken = (user) => {
    if (!user) {
      return false;
    }
    if (!user.token) {
      return false; 
    }
    return true;
  };

  // Load the user from localStorage on component mount
  useEffect(() => {
    // Skip if we already have a user from initialization
    if (initialUser || isInitialized.current) {
      isInitialized.current = true;
      return;
    }

    const loadUser = () => {
      try {
        // Get user from localStorage
        const user = authApi.getCurrentUser();
        if (user) {
          // User exists in localStorage
          if (verifyToken(user) && hasValidRole(user)) {
            // Update the state with the user
            setCurrentUser(user);
            if (user.permissions) {
              setPermissions(user.permissions);
            } else {
              // Fetch permissions if not in localStorage
              fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1'}/auth/permissions`, {
                headers: { 'Authorization': `Bearer ${user.token}` }
              })
                .then(res => res.json())
                .then(data => {
                  setPermissions(data.permissions || []);
                  const updatedUser = { ...user, permissions: data.permissions || [] };
                  localStorage.setItem('user', JSON.stringify(updatedUser));
                  setCurrentUser(updatedUser);
                })
                .catch(err => console.error("Failed to fetch permissions:", err));
            }
            // Set GitHub connection status if available
            if ("github_connected" in user) {
              setGithubConnected(user.github_connected);
              // Check if we should show the GitHub prompt
              if (!user.github_connected) {
                setShowGithubPrompt(true);
              }
            }
          } else {
            // If verification fails, clear the user and redirect to login
            localStorage.removeItem("user");
            navigate("/login", { replace: true });
          }
        }
      } catch (err) {
        console.error("Error loading user from localStorage:", err);
        localStorage.removeItem("user");
      } finally {
        setLoading(false);
        isInitialized.current = true;
      }
    };
    loadUser();
  }, [initialUser, navigate]);

  // Function to connect GitHub account
  const connectGitHub = async () => {
    try {
      setError(null); // Clear previous errors
      setAuthInProgress(true);
      
      // Get current user directly from localStorage to ensure most up-to-date data
      const user = authApi.getCurrentUser();
      if (!user) {
        setError("Authentication required. Please log in again before connecting GitHub.");
        navigate("/login");
        return;
      }
      
      // Use the githubService to get the OAuth URL
      const oauthUrl = await githubService.initiateOAuthFlow(user.id);
      window.location.href = oauthUrl;
    } catch (error) {
      console.error("GitHub connection error:", error);
      setError("Failed to connect to GitHub. Please try again.");
    } finally {
      setAuthInProgress(false);
    }
  };

  const login = async (credentials) => {
    try {
      setError(null);
      setLoading(true);
      setAuthInProgress(true);
      
      // Call login API
      const data = await authApi.login(credentials);
      
      // Extract token with fallbacks
      let token = null;
      if (data.user && data.user.token) {
        token = data.user.token;
      } else if (data.token) {
        token = data.token;
      }
      
      if (data.user) {
        // Store the user with the token in state and localStorage
        const userWithToken = {
          ...data.user,
          token: token || "", 
          github_connected: data.user.github_connected || false,
          github_username: data.user.github_username || "",
          role: data.user.role || (data.user.is_admin ? "admin" : DEFAULT_ROLE),
        };

        if (!hasValidRole(userWithToken)) {
          throw new Error("This account role is no longer supported. Please contact an administrator.");
        }
        
        // Fetch permissions
        try {
          const permRes = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1'}/auth/permissions`, {
            headers: { 'Authorization': `Bearer ${userWithToken.token}` }
          });
          const permData = await permRes.json();
          userWithToken.permissions = permData.permissions || [];
          setPermissions(permData.permissions || []);
        } catch (err) {
          console.error("Failed to fetch permissions during login:", err);
          userWithToken.permissions = [];
        }

        // Save to localStorage first to ensure persistence
        localStorage.setItem("user", JSON.stringify(userWithToken));
        
        // Update state
        setCurrentUser(userWithToken);
        // Set GitHub connection status
        const isGithubConnected = userWithToken.github_connected || false;
        setGithubConnected(isGithubConnected);
        
        // If user is not connected to GitHub, show the prompt after redirection
        if (!isGithubConnected) {
          // Set a timeout to show GitHub prompt shortly after navigating to dashboard
          setTimeout(() => {
            setShowGithubPrompt(true);
          }, 500);
        }
        
        // Use setTimeout to ensure state is updated before navigation
        setTimeout(() => {
          // Navigate to the appropriate dashboard with state to prevent loops
          const redirectPath =
            location.state?.from ||
            (userWithToken.role === "admin" ? "/admin" : "/BasicDashboard");
          navigate(redirectPath, { replace: true });
        }, 100);
        
        return data;
      } else {
        // No user data found - this is an error
        throw new Error("No user data received. Please try again.");
      }
    } catch (err) {
      console.error("Login error:", err);
      setError(err.message || "Login failed");
      throw err;
    } finally {
      setLoading(false);
      setAuthInProgress(false);
    }
  };

  const handleGithubPromptResponse = (connect) => {
    setShowGithubPrompt(false);
    if (connect) {
      // User wants to connect GitHub now
      connectGitHub();
    }
  };

  const register = async (userData) => {
    try {
      setError(null);
      setAuthInProgress(true);
      
      const data = await authApi.register(userData);
      navigate("/login");
      return data;
    } catch (err) {
      console.error("Registration error:", err);
      setError(err.message || "Registration failed");
      throw err;
    } finally {
      setAuthInProgress(false);
    }
  };

  const logout = async () => {
    try {
      setAuthInProgress(true);
      await authApi.logout();
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      localStorage.removeItem("user");
      setCurrentUser(null);
      setPermissions([]);
      setGithubConnected(false);
      setShowGithubPrompt(false);
      setAuthInProgress(false);
      navigate("/login", { replace: true });
    }
  };

  // Function to update current user (used after GitHub connection)
  const updateUser = (userData) => {
    if (!userData) {
      console.warn("Attempted to update user with null/undefined data");
      return;
    }
    
    // Update local state
    setCurrentUser((prevUser) => {
      if (!prevUser) return userData;
      
      // Ensure token is preserved when updating user data
      const updated = {
        ...prevUser,
        ...userData,
        // Only use userData.token if it exists and is not empty
        token: userData.token && userData.token.trim() ? userData.token : prevUser.token,
        github_username:
          userData.github_connected === false
            ? ''
            : (userData.github_username ?? prevUser.github_username ?? ''),
      };
      
      // Also update localStorage
      localStorage.setItem("user", JSON.stringify(updated));
      return updated;
    });
    
    // Update GitHub connection status if that information is included
    if (userData && "github_connected" in userData) {
      setGithubConnected(userData.github_connected);
      if (userData.github_connected) {
        // If GitHub is now connected, make sure to hide the prompt
        setShowGithubPrompt(false);
      }
    }
  };

  // Check if we're returning from a GitHub OAuth flow
  useEffect(() => {
    // Helper function to determine if we're on a GitHub callback route
    const isGitHubCallbackRoute = () => {
      const callbackPaths = [
        '/github/callback',
        '/api/github/callback',
        '/api/v1/github/callback'
      ];
      
      return callbackPaths.some(path => location.pathname.includes(path));
    };

    // Check if we're returning from GitHub OAuth based on URL parameters
    const urlParams = new URLSearchParams(location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const githubSuccess = urlParams.get('github_success');
    const githubUsername = urlParams.get('github_username');
    const userId = urlParams.get('user_id');
    
    // Handle explicit success parameters (our custom format)
    if (githubSuccess === 'true' && githubUsername && userId) {
      setError(null); // Clear any errors
      
      // Update the user in localStorage with GitHub connection status
      const user = authApi.getCurrentUser();
      if (user && user.id && user.id.toString() === userId.toString()) {
        // Update the user object with GitHub connection info
        const updatedUser = {
          ...user,
          github_connected: true,
          github_username: githubUsername
        };
        
        // Save back to localStorage
        localStorage.setItem("user", JSON.stringify(updatedUser));
        
        // Update context state
        updateUser(updatedUser);
        
        // Set GitHub connected flag
        setGithubConnected(true);
        setShowGithubPrompt(false);
        
        // Remove GitHub OAuth parameters from URL to prevent duplicate processing
        navigate(location.pathname.split('?')[0], { replace: true });
      }
    }
    // Handle GitHub OAuth code callback
    else if (code && state && (isGitHubCallbackRoute() || location.pathname.includes('/github'))) {
      (async () => {
        try {
          setAuthInProgress(true);
          
          // Exchange the code for a token at the backend
          const result = await githubService.completeOAuthFlow(code);
          
          if (result && result.success) {
            // Get the current user
            const user = authApi.getCurrentUser();
            if (user) {
              // Update user with GitHub info
              const updatedUser = {
                ...user,
                github_connected: true,
                github_username: result.github_username || ''
              };
              
              // Save to localStorage and update state
              localStorage.setItem("user", JSON.stringify(updatedUser));
              updateUser(updatedUser);
              setGithubConnected(true);
              setShowGithubPrompt(false);
            }
          }
          
          // Clean up URL
          navigate('/github', { replace: true });
        } catch (error) {
          console.error("Error completing GitHub OAuth flow:", error);
          setError("Failed to complete GitHub connection. Please try again.");
        } finally {
          setAuthInProgress(false);
        }
      })();
    }
    
    // Check for error parameter
    const errorMsg = urlParams.get('error');
    if (errorMsg) {
      setError(`GitHub connection error: ${errorMsg}`);
    }
  }, [location.pathname, location.search, navigate]);
  
  const currentUserId = currentUser?.id;
  const currentGithubConnected = Boolean(currentUser?.github_connected);

  // Check GitHub connection status when user changes - verify with server to detect stale state
  useEffect(() => {
    if (!currentUserId) return;
    
    // Always verify against the server — don't trust the localStorage snapshot alone
    const verify = async () => {
      try {
        const status = await githubService.checkConnection();
        const serverConnected = Boolean(status?.connected);
        if (serverConnected !== currentGithubConnected) {
          updateUser({
            github_connected: serverConnected,
            github_username: serverConnected ? (status?.username || '') : '',
          });
          setGithubConnected(serverConnected);
        }
      } catch (e) {
        console.error('Error verifying GitHub connection', e);
      }
    };
    verify();
  }, [currentUserId, currentGithubConnected]);

  // RBAC Helpers
  const can = (permission) => hasPermission(permissions, permission);
  const is = (role) => hasRole(currentUser?.role, role);

  const value = {
    currentUser,
    setCurrentUser: updateUser,
    permissions,
    can,
    is,
    login,
    register,
    logout,
    loading,
    error,
    setError,
    githubConnected,
    connectGitHub,
    showGithubPrompt,
    handleGithubPromptResponse,
    setShowGithubPrompt,
    authInProgress
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
