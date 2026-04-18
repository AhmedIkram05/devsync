import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { githubService } from '../services/github';
import { authApi } from '../services/utils/auth';
import LoadingSpinner from '../components/LoadingSpinner';

const GitHubCallback = () => {
  const [status, setStatus] = useState('Processing GitHub authorization...');
  const [error, setError] = useState(null);
  const [processingComplete, setProcessingComplete] = useState(false);
  
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, setCurrentUser, setError: setAuthError } = useAuth();

  useEffect(() => {
    // Don't process if already completed
    if (processingComplete) {
      return;
    }
    
    const handleCallback = async () => {
      try {
        // Clear any existing auth errors when this component mounts
        setAuthError && setAuthError(null);
        
        const urlParams = new URLSearchParams(location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        
        // Check for explicit GitHub success format first
        const githubSuccess = urlParams.get('github_success');
        const githubUsername = urlParams.get('github_username');
        const userId = urlParams.get('user_id');
        
        // Handle GitHub success parameter format
        if (githubSuccess === 'true' && githubUsername && userId) {
          setStatus('Successfully connected to GitHub!');
          
          // Update the user in localStorage with GitHub connection status
          const user = authApi.getCurrentUser();
          if (user && user.id && user.id.toString() === userId.toString()) {
            // Update the user object with GitHub connection info
            const updatedUser = authApi.updateGitHubStatus(true, githubUsername);
            if (updatedUser && typeof setCurrentUser === 'function') {
              setCurrentUser(updatedUser);
            }
          }
          
          // Redirect to GitHub integration page
          setTimeout(() => {
            navigate('/github', { replace: true });
          }, 1000);
          
          setProcessingComplete(true);
          return;
        }
        
        // Check for error case
        const errorMsg = urlParams.get('error');
        if (errorMsg) {
          setError(`GitHub connection error: ${errorMsg}`);
          setProcessingComplete(true);
          return;
        }
        
        // Handle standard GitHub authorization code
        if (!code) {
          setError('No authorization code received from GitHub');
          setProcessingComplete(true);
          return;
        }
        
        setStatus('Exchanging code for access token...');
        
        // Get current user for authentication
        if (!currentUser || !currentUser.token) {
          setStatus('Checking authentication status...');
          
          // Try to get user from localStorage
          const user = authApi.getCurrentUser();
          if (!user || !user.token) {
            setError('Authentication required. Please log in again.');
            setTimeout(() => {
              navigate('/login', { 
                replace: true,
                state: { from: '/github' } 
              });
            }, 2000);
            setProcessingComplete(true);
            return;
          }
        }
        
        // Exchange the code for an access token via our backend
        const response = await githubService.completeOAuthFlow(code, state);
        
        if (response && (response.success || response.connected)) {
          setStatus('GitHub connected successfully!');
          
          // Update the GitHub information in local storage
          const username = response.github_username || response.username || '';
          const updatedUser = authApi.updateGitHubStatus(true, username);
          
          if (updatedUser && typeof setCurrentUser === 'function') {
            setCurrentUser(updatedUser);
          }
          
          // Redirect to GitHub integration page after a short delay
          setTimeout(() => {
            navigate('/github', { replace: true });
          }, 1500);
        } else {
          setError(response?.message || 'Failed to connect GitHub account');
        }
      } catch (err) {
        // Handle connection errors specially
        if (err.message && (
          err.message.includes('Failed to fetch') ||
          err.message.includes('Network Error') ||
          err.message.includes('Connection failed')
        )) {
          setError('Server connection error. Please ensure the server is running and try again.');
        } else {
          setError('Error processing GitHub authorization: ' + (err.message || 'Unknown error'));
        }
      } finally {
        setProcessingComplete(true);
      }
    };
    
    handleCallback();
  }, [location.search, navigate, setCurrentUser, setAuthError, currentUser, processingComplete]);

  // Handle retry action
  const handleRetry = () => {
    setError(null);
    setProcessingComplete(false);
    
    // Attempt to reconnect
    if (location.search.includes('code=')) {
      // Try processing the callback again
      window.location.reload();
    } else {
      // Go back to GitHub integration page to start over
      navigate('/github');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-6">GitHub Integration</h1>
        
        {error ? (
          <div className="p-4 bg-red-100 border-l-4 border-red-500 text-red-700 mb-5">
            <p className="font-bold">Error</p>
            <p>{error}</p>
            <div className="mt-4 space-y-2">
              <button 
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
                onClick={handleRetry}
              >
                Try Again
              </button>
              <button 
                className="w-full bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
                onClick={() => navigate('/github')}
              >
                Return to GitHub Integration
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <LoadingSpinner />
            <p className="mt-4 text-gray-600">{status}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default GitHubCallback;
