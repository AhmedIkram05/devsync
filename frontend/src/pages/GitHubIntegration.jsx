import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { githubService } from "../services/github"; 
import { authApi } from "../services/utils/auth";
import { useAuth } from "../context/AuthContext";
import GitHubRepoCard from "../components/GitHubRepoCard";
import LoadingSpinner from "../components/LoadingSpinner";

const GitHubIntegration = () => {
  const [connectionStatus, setConnectionStatus] = useState({
    connected: false,
    username: '',
    loading: true,
    error: null,
    rateLimitError: false
  });
  const [repos, setRepos] = useState([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);
  
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, setCurrentUser, setError: setAuthError } = useAuth();
  
  // Define fetchRepositories function earlier so it can be referenced
  const fetchRepositories = async () => {
    try {
      setLoadingRepos(true);
      console.log("Fetching GitHub repositories...");
      const data = await githubService.getUserRepos();
      console.log("GitHub repositories received:", data);
      
      // Ensure we have an array of repos
      const repos = Array.isArray(data) ? data : (data?.repositories || []);
      setRepos(repos);
    } catch (error) {
      console.error("Failed to fetch repositories:", error);
      // Check for rate limit error
      const rateLimitInfo = githubService.handleRateLimitError(error);
      if (rateLimitInfo) {
        setConnectionStatus(prev => ({
          ...prev,
          error: rateLimitInfo.message,
          rateLimitError: true,
          rateLimitInfo
        }));
      } else {
        setConnectionStatus(prev => ({
          ...prev,
          error: "Failed to fetch repositories. Please try again later."
        }));
      }
    } finally {
      setLoadingRepos(false);
    }
  };

  useEffect(() => {
    // Clear any auth errors when mounting this component
    setAuthError && setAuthError(null);
    
    // Log current user info
    if (currentUser) {
      console.log("GitHubIntegration - Current user:", 
        currentUser.email, 
        "Role:", currentUser.role, 
        "GitHub connected:", currentUser.github_connected);
    } else {
      console.log("GitHubIntegration - No current user found");
    }
  }, [setAuthError, currentUser]);
  
  // Define checkGitHubConnection with useCallback to fix dependency array issue
  const checkGitHubConnection = useCallback(async (justConnected = false) => {
    try {
      setConnectionStatus(prev => ({ ...prev, loading: true, error: null, rateLimitError: false }));
      
      console.log("Checking GitHub connection status...");
      const data = await githubService.checkConnection();
      console.log("GitHub connection status:", data);
      
      // If we just connected or the status changed, update local storage
      if (justConnected) {
        const updatedUser = authApi.updateGitHubStatus(data.connected, data.username);
        if (updatedUser && typeof setCurrentUser === "function") {
          setCurrentUser(updatedUser);
        }
      }
      
      setConnectionStatus({
        connected: data.connected,
        username: data.username || '',
        loading: false,
        error: null,
        rateLimitError: false
      });
      
      // If connected, fetch repositories
      if (data.connected) {
        fetchRepositories();
      }
    } catch (error) {
      console.error("Error checking GitHub connection status:", error);
      
      // Handle 401 errors specially - likely not authenticated
      if (error.status === 401) {
        setConnectionStatus({
          connected: false,
          username: '',
          loading: false,
          error: "Authentication required. Please login again.",
          rateLimitError: false
        });
        return;
      }
      
      // Check for rate limit error specifically
      const rateLimitInfo = githubService.handleRateLimitError(error);
      if (rateLimitInfo) {
        setConnectionStatus({
          connected: false,
          username: '',
          loading: false,
          error: rateLimitInfo.message,
          rateLimitError: true,
          rateLimitInfo
        });
      } else {
        setConnectionStatus({
          connected: false,
          username: '',
          loading: false,
          error: "Failed to check GitHub connection status. Please try again.",
          rateLimitError: false
        });
      }
    }
  }, [setCurrentUser]);

  // Function to handle the OAuth callback code
  const handleOAuthCallback = useCallback(async (code, state) => {
    try {
      console.log("Processing GitHub OAuth callback with code:", code.substring(0, 5) + "...");
      setIsConnecting(true);
      
      // Send the code to your backend
      const result = await githubService.completeOAuthFlow(code, state);
      console.log("OAuth flow completion result:", result);
      
      // Check the connection status now that we've authorized
      await checkGitHubConnection(true);
      
      // Clean up the URL by removing the code parameter
      navigate('/github', { replace: true });
    } catch (error) {
      console.error("Failed to complete GitHub OAuth flow:", error);
      
      // Check for rate limit error specifically
      const rateLimitInfo = githubService.handleRateLimitError(error);
      if (rateLimitInfo) {
        setConnectionStatus({
          connected: false,
          username: '',
          loading: false,
          error: rateLimitInfo.message,
          rateLimitError: true,
          rateLimitInfo
        });
      } else {
        setConnectionStatus({
          connected: false,
          username: '',
          loading: false,
          error: "Failed to connect GitHub account. Please try again.",
          rateLimitError: false
        });
      }
    } finally {
      setIsConnecting(false);
    }
  }, [navigate, checkGitHubConnection]);
  
  // Check if we're returning from GitHub OAuth flow with code parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');
    
    // If there's a code parameter, we're returning from GitHub authorization
    if (code) {
      console.log("GitHub OAuth code detected in URL, handling callback...");
      handleOAuthCallback(code, state);
    }
    
    // Handle GitHub OAuth errors
    if (error) {
      console.error("GitHub OAuth error:", error);
      setConnectionStatus({
        connected: false,
        username: '',
        loading: false,
        error: "GitHub authentication was denied or failed. Please try again.",
        rateLimitError: false
      });
    }
  }, [location, handleOAuthCallback]);
  
  // Check connection status on component mount
  useEffect(() => {
    console.log("GitHubIntegration component mounted, checking connection status");
    checkGitHubConnection();
  }, [checkGitHubConnection]);
  
  const connectGitHub = async () => {
    try {
      console.log("Initiating GitHub OAuth flow...");
      setIsConnecting(true);
      setConnectionStatus(prev => ({ ...prev, error: null, rateLimitError: false }));
      
      // Get the OAuth URL from our service
      const oauthUrl = await githubService.initiateOAuthFlow();
      console.log("Received GitHub OAuth URL:", oauthUrl);
      
      if (!oauthUrl) {
        throw new Error("No GitHub authorization URL received from server");
      }
      
      // Redirect user to GitHub for authorization
      console.log("Redirecting to GitHub authorization page...");
      window.location.href = oauthUrl;
    } catch (error) {
      console.error("GitHub connection error:", error);
      setIsConnecting(false);
      
      // Check for rate limit error
      const rateLimitInfo = githubService.handleRateLimitError(error);
      if (rateLimitInfo) {
        setConnectionStatus({
          ...connectionStatus,
          error: rateLimitInfo.message,
          rateLimitError: true,
          rateLimitInfo
        });
      } else {
        setConnectionStatus(prev => ({
          ...prev,
          error: error.message || "Failed to connect to GitHub. Please try again."
        }));
      }
    }
  };
  
  const disconnectGitHub = async () => {
    const confirmed = window.confirm("Are you sure you want to disconnect your GitHub account? This will remove all repository links.");
    
    if (confirmed) {
      try {
        console.log("Disconnecting GitHub account...");
        await githubService.disconnectAccount();
        
        // Update local storage
        const updatedUser = authApi.updateGitHubStatus(false, '');
        if (updatedUser && typeof setCurrentUser === 'function') {
          setCurrentUser(updatedUser);
        }
        
        setConnectionStatus({
          connected: false,
          username: '',
          loading: false,
          error: null,
          rateLimitError: false
        });
        
        setRepos([]);
        console.log("GitHub account disconnected successfully");
      } catch (error) {
        console.error("GitHub disconnect error:", error);
        // Check for rate limit error
        const rateLimitInfo = githubService.handleRateLimitError(error);
        if (rateLimitInfo) {
          setConnectionStatus({
            ...connectionStatus,
            error: rateLimitInfo.message,
            rateLimitError: true,
            rateLimitInfo
          });
        } else {
          setConnectionStatus(prev => ({
            ...prev,
            error: "Failed to disconnect from GitHub. Please try again."
          }));
        }
      }
    }
  };
  
  // Render a special message for rate limit errors
  const renderRateLimitError = () => {
    if (connectionStatus.rateLimitError && connectionStatus.rateLimitInfo) {
      const { title, message, suggestion } = connectionStatus.rateLimitInfo;
      return (
        <div className="bg-amber-500/10 border border-amber-400/40 text-amber-200 px-4 py-3 rounded mb-4">
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1">{message}</p>
          {suggestion && <p className="mt-2 text-sm opacity-75">{suggestion}</p>}
          <p className="mt-3 text-sm">
            <a 
              href="https://docs.github.com/en/rest/rate-limit" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-rose-300 hover:text-rose-200"
            >
              Learn more about GitHub API rate limits
            </a>
          </p>
        </div>
      );
    }
    
    return null;
  };
  
  if (connectionStatus.loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="container mx-auto p-4 md:p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-4">GitHub Integration</h1>
        
        {connectionStatus.rateLimitError ? renderRateLimitError() : connectionStatus.error && (
          <div className="bg-rose-500/10 border border-rose-400/40 text-rose-200 px-4 py-3 rounded mb-4">
            {connectionStatus.error}
          </div>
        )}
        
        {!connectionStatus.connected ? (
          <div className="bg-slate-900/70 rounded-2xl border border-slate-800/70 p-6 mb-6">
            <h2 className="text-xl font-semibold mb-3 text-slate-100">Connect Your GitHub Account</h2>
            <p className="mb-4 text-slate-400">
              Connect your GitHub account to link tasks with repositories and issues. 
              This integration allows you to:
            </p>
            <ul className="list-disc pl-5 mb-6 text-slate-400">
              <li className="mb-1">View your GitHub repositories and issues within DevSync</li>
              <li className="mb-1">Link tasks to specific GitHub issues</li>
              <li className="mb-1">Track GitHub activity related to your tasks</li>
            </ul>
            <button
              onClick={connectGitHub}
              disabled={isConnecting}
              className={`flex items-center rounded-full bg-rose-500/90 text-white px-6 py-3 hover:bg-rose-400 ${
                isConnecting ? 'opacity-70 cursor-not-allowed' : ''
              }`}
            >
              {isConnecting ? (
                <>
                  <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Connecting...
                </>
              ) : (
                <>
                  <svg className="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                  </svg>
                  Connect with GitHub
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="bg-slate-900/70 rounded-2xl border border-slate-800/70 mb-8">
            <div className="p-6 border-b border-slate-800/70">
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <svg className="h-8 w-8 mr-3 text-slate-200" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h2 className="text-xl font-semibold text-slate-100">GitHub Account Connected</h2>
                    <p className="text-slate-400">Connected as: {connectionStatus.username}</p>
                  </div>
                </div>
                <button 
                  onClick={disconnectGitHub}
                  className="bg-rose-500/90 hover:bg-rose-400 text-white px-4 py-2 rounded-full"
                >
                  Disconnect
                </button>
              </div>
            </div>
            
            {/* GitHub Repositories Section */}
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">Your Repositories</h3>
                <button 
                  onClick={fetchRepositories}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1 rounded flex items-center"
                >
                  <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </button>
              </div>
              
              {loadingRepos ? (
                <div className="flex justify-center py-10">
                  <LoadingSpinner />
                </div>
              ) : repos.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {repos.map((repo) => (
                    <GitHubRepoCard key={repo.id} repo={repo} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 text-slate-400">
                  No repositories found. Make sure you have repositories in your GitHub account.
                </div>
              )}
            </div>
          </div>
                )}
        </div>
      </div>
    </div>
  );
};

export default GitHubIntegration;