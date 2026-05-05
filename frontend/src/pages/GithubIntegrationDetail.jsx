import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { githubService } from '../services/github'; // Updated import to use consolidated service
import { taskService } from '../services/utils/api'; 
import LoadingSpinner from '../components/LoadingSpinner';

function GitHubIntegrationDetail() {
  const { repoId } = useParams();
  const navigate = useNavigate();
  
  const [repository, setRepository] = useState(null);
  const [issues, setIssues] = useState([]);
  const [pullRequests, setPullRequests] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [loadingPullRequests, setLoadingPullRequests] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [error, setError] = useState(null);
  const [linkingIssue, setLinkingIssue] = useState(false);
  const [linkingPullRequest, setLinkingPullRequest] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Fetch available tasks
  const fetchAvailableTasks = async () => {
    try {
      setLoadingTasks(true);
      const tasksData = await taskService.getAllTasks();
      
      // Filter tasks that are not completed
      const availableTasks = tasksData.filter(task => 
        task.status !== 'completed'
      );
      
      setTasks(availableTasks || []);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
      // Don't set error state here to avoid blocking the main repository view
    } finally {
      setLoadingTasks(false);
    }
  };

  useEffect(() => {
    if (!repoId) {
      navigate('/github');
      return;
    }
    
    // Moved fetchRepositoryData inside useEffect to fix dependency array warning
    const fetchRepositoryData = async () => {
      try {
        setLoading(true);
        
        // Get repository details using consolidated GitHub service
        const repositories = await githubService.getUserRepos();
        
        const currentRepo = repositories.find(repo => repo.id.toString() === repoId.toString());
        
        if (!currentRepo) {
          throw new Error('Repository not found');
        }
        
        setRepository(currentRepo);
        
        // Get repository issues using consolidated GitHub service
        setLoadingIssues(true);
        const issuesResponse = await githubService.getIssues(repoId);
        // Handle different response structures
        const issuesData = issuesResponse.issues || issuesResponse || [];
        setIssues(issuesData);

        // Get repository pull requests using consolidated GitHub service
        setLoadingPullRequests(true);
        const pullsResponse = await githubService.getPullRequests(repoId);
        const pullsData = pullsResponse.pull_requests || pullsResponse || [];
        setPullRequests(pullsData);
        
      } catch (err) {
        console.error('Failed to fetch repository data:', err);
        setError('Failed to fetch repository data. Please try again.');
      } finally {
        setLoading(false);
        setLoadingIssues(false);
        setLoadingPullRequests(false);
      }
    };

    fetchRepositoryData();
    fetchAvailableTasks();
  }, [repoId, navigate]); // Removed fetchRepositoryData from dependencies

  const handleLinkIssue = async (issueId) => {
    if (!selectedTask || !issueId) {
      alert('Please select a task to link with this issue');
      return;
    }
    
    try {
      setLinkingIssue(true);
      
      // Find the selected issue for display purposes
      const selectedIssue = issues.find(issue => issue.id.toString() === issueId.toString());
      
      if (!selectedIssue) {
        throw new Error('Selected issue not found');
      }
      
      const linkData = {
        repo_id: repoId,
        repo_name: repository.full_name,
        issue_id: issueId,
        issue_number: selectedIssue.number,
        issue_title: selectedIssue.title
      };
      
      await githubService.linkTaskToGithub(selectedTask, linkData);
      
      setSuccessMessage(`Successfully linked issue #${selectedIssue.number} to task!`);
      setTimeout(() => setSuccessMessage(''), 5000); // Clear message after 5 seconds
      
      // Reset selection
      setSelectedTask('');
    } catch (err) {
      console.error('Failed to link issue to task:', err);
      setError('Failed to link issue to task. Please try again.');
    } finally {
      setLinkingIssue(false);
    }
  };

  const handleLinkPullRequest = async (pullRequestId) => {
    if (!selectedTask || !pullRequestId) {
      alert('Please select a task to link with this pull request');
      return;
    }
    
    try {
      setLinkingPullRequest(true);
      
      const selectedPullRequest = pullRequests.find(
        (pullRequest) => pullRequest.id.toString() === pullRequestId.toString()
      );
      
      if (!selectedPullRequest) {
        throw new Error('Selected pull request not found');
      }
      
      const linkData = {
        repo_id: repoId,
        repo_name: repository.full_name,
        pull_request_number: selectedPullRequest.number,
        pull_request_title: selectedPullRequest.title
      };
      
      await githubService.linkTaskToGithub(selectedTask, linkData);
      
      setSuccessMessage(`Successfully linked PR #${selectedPullRequest.number} to task!`);
      setTimeout(() => setSuccessMessage(''), 5000);
      
      setSelectedTask('');
    } catch (err) {
      console.error('Failed to link pull request to task:', err);
      setError('Failed to link pull request to task. Please try again.');
    } finally {
      setLinkingPullRequest(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !repository) {
    return (
      <div className="flex flex-col h-screen items-center justify-center p-6">
        <div className="text-xl text-red-600 mb-4">{error || 'Repository not found'}</div>
        <Link 
          to="/github" 
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Back to GitHub Integration
        </Link>
      </div>
    );
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const getPullRequestStatus = (pullRequest) => {
    if (pullRequest.draft) {
      return { text: 'Draft', className: 'bg-yellow-100 text-yellow-800' };
    }

    if (pullRequest.merged) {
      return { text: 'Merged', className: 'bg-purple-100 text-purple-800' };
    }

    if (pullRequest.state === 'closed') {
      return { text: 'Closed', className: 'bg-gray-100 text-gray-800' };
    }

    return { text: 'Open', className: 'bg-green-100 text-green-800' };
  };

  return (
    <div className="container mx-auto p-4 md:p-8">
      {/* Repository Header */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center">
          <div>
            <div className="flex items-center mb-2">
              <h1 className="text-2xl font-bold">{repository.name}</h1>
              <span className="ml-3 bg-gray-100 px-2 py-1 text-xs rounded text-gray-600">
                {repository.private ? 'Private' : 'Public'}
              </span>
            </div>
            <p className="text-gray-600 mb-4">{repository.description || 'No description provided'}</p>
            <div className="flex flex-wrap gap-4 text-sm text-gray-600">
              {repository.language && (
                <div className="flex items-center">
                  <span className="h-3 w-3 rounded-full bg-blue-500 mr-1"></span>
                  {repository.language}
                </div>
              )}
              <div>Updated: {formatDate(repository.updated_at)}</div>
              <div>Stars: {repository.stargazers_count || 0}</div>
              <div>Forks: {repository.forks_count || 0}</div>
            </div>
          </div>
          <div className="mt-4 md:mt-0">
            <a 
              href={repository.html_url} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded inline-flex items-center"
            >
              <svg className="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
              View on GitHub
            </a>
          </div>
        </div>
      </div>
      
      {/* Pull Requests Section */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Repository Pull Requests</h2>
          <span className="text-sm text-gray-500">{pullRequests.length} total</span>
        </div>
        
        {loadingPullRequests ? (
          <div className="py-10 text-center">
            <LoadingSpinner />
          </div>
        ) : pullRequests.length > 0 ? (
          <div className="space-y-4">
            {pullRequests.map((pullRequest) => {
              const pullRequestStatus = getPullRequestStatus(pullRequest);

              return (
                <div key={pullRequest.id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 className="font-medium">
                        <a 
                          href={pullRequest.html_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800"
                        >
                          #{pullRequest.number} {pullRequest.title}
                        </a>
                      </h3>
                      <div className="text-sm text-gray-500 mt-1">
                        Opened on {formatDate(pullRequest.created_at)} by {pullRequest.user?.login || 'Unknown'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 text-xs rounded ${pullRequestStatus.className}`}>
                        {pullRequestStatus.text}
                      </span>
                      <button
                        onClick={() => handleLinkPullRequest(pullRequest.id)}
                        disabled={!selectedTask || linkingPullRequest}
                        className={`px-3 py-1 rounded text-sm ${
                          !selectedTask || linkingPullRequest
                            ? 'bg-gray-300 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                      >
                        {linkingPullRequest ? 'Linking...' : 'Link to Task'}
                      </button>
                    </div>
                  </div>
                  {pullRequest.body && (
                    <div className="mt-2 text-sm text-gray-600 line-clamp-2">
                      {pullRequest.body}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {pullRequest.labels?.map(label => (
                      <span 
                        key={label.id || label.name}
                        className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800"
                      >
                        {label.name}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-10 text-gray-500">
            No pull requests found in this repository.
          </div>
        )}
      </div>

      {/* Task Linking Section */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Link Issues to Tasks</h2>
        
        {successMessage && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
            {successMessage}
          </div>
        )}
        
        {loadingTasks ? (
          <div className="py-4 text-center">
            <LoadingSpinner size="small" />
          </div>
        ) : tasks.length > 0 ? (
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2">
              Select a Task to Link
            </label>
            <select
              className="w-full p-2 border rounded"
              value={selectedTask}
              onChange={(e) => setSelectedTask(e.target.value)}
              disabled={linkingIssue || linkingPullRequest}
            >
              <option value="">Choose a task...</option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title} ({task.status})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-100 text-yellow-800 p-4 rounded mb-4">
            No available tasks found. Please create a task first.
          </div>
        )}
      </div>
      
      {/* Issues Section */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Repository Issues</h2>
        
        {loadingIssues ? (
          <div className="py-10 text-center">
            <LoadingSpinner />
          </div>
        ) : issues.length > 0 ? (
          <div className="space-y-4">
            {issues.map((issue) => (
              <div key={issue.id} className="border rounded-lg p-4 hover:bg-gray-50">
                <div className="flex justify-between">
                  <div>
                    <h3 className="font-medium">
                      <a 
                        href={issue.html_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800"
                      >
                        #{issue.number} {issue.title}
                      </a>
                    </h3>
                    <div className="text-sm text-gray-500 mt-1">
                      Opened on {formatDate(issue.created_at)} by {issue.user?.login || 'Unknown'}
                    </div>
                  </div>
                  <button
                    onClick={() => handleLinkIssue(issue.id)}
                    disabled={!selectedTask || linkingIssue || linkingPullRequest}
                    className={`px-3 py-1 rounded text-sm ${
                      !selectedTask || linkingIssue || linkingPullRequest
                        ? 'bg-gray-300 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {linkingIssue ? 'Linking...' : 'Link to Task'}
                  </button>
                </div>
                {issue.body && (
                  <div className="mt-2 text-sm text-gray-600 line-clamp-2">
                    {issue.body}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {issue.labels?.map(label => (
                    <span 
                      key={label.id || label.name}
                      className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800"
                    >
                      {label.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 text-gray-500">
            No issues found in this repository.
          </div>
        )}
      </div>
    </div>
  );
}

export default GitHubIntegrationDetail;