import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { githubService } from '../services/github';
import { taskService } from '../services/utils/api';
import LoadingSpinner from '../components/LoadingSpinner';

const panelClass = "bg-slate-900/70 border border-slate-800/70 rounded-2xl p-6 shadow-[0_10px_30px_rgba(0,0,0,0.25)]";
const sectionTitleClass = "text-xl font-semibold text-slate-100";

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

  const fetchAvailableTasks = async () => {
    try {
      setLoadingTasks(true);
      const tasksData = await taskService.getAllTasks();
      const availableTasks = tasksData.filter(task => task.status !== 'completed');
      setTasks(availableTasks || []);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoadingTasks(false);
    }
  };

  useEffect(() => {
    if (!repoId) {
      navigate('/github');
      return;
    }

    const fetchRepositoryData = async () => {
      try {
        setLoading(true);

        const repositories = await githubService.getUserRepos();
        const currentRepo = repositories.find(repo => repo.id.toString() === repoId.toString());

        if (!currentRepo) {
          throw new Error('Repository not found');
        }

        setRepository(currentRepo);

        setLoadingIssues(true);
        const issuesResponse = await githubService.getIssues(repoId);
        const issuesData = issuesResponse.issues || issuesResponse || [];
        setIssues(issuesData);

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
  }, [repoId, navigate]);

  const handleLinkIssue = async (issueId) => {
    if (!selectedTask || !issueId) {
      alert('Please select a task to link with this issue');
      return;
    }

    try {
      setLinkingIssue(true);
      const selectedIssue = issues.find(issue => issue.id.toString() === issueId.toString());

      if (!selectedIssue) throw new Error('Selected issue not found');

      const linkData = {
        repo_id: repoId,
        repo_name: repository.full_name,
        issue_id: issueId,
        issue_number: selectedIssue.number,
        issue_title: selectedIssue.title
      };

      await githubService.linkTaskToGithub(selectedTask, linkData);
      setSuccessMessage(`Successfully linked issue #${selectedIssue.number} to task!`);
      setTimeout(() => setSuccessMessage(''), 5000);
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
        (pr) => pr.id.toString() === pullRequestId.toString()
      );

      if (!selectedPullRequest) throw new Error('Selected pull request not found');

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
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !repository) {
    return (
      <div className="flex flex-col h-screen items-center justify-center p-6 bg-slate-950">
        <div className="text-xl text-rose-300 mb-4">{error || 'Repository not found'}</div>
        <Link
          to="/github"
          className="px-4 py-2 bg-rose-500/90 hover:bg-rose-400 text-white rounded-full transition-colors"
        >
          Back to GitHub Integration
        </Link>
      </div>
    );
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  };

  const getPullRequestStatus = (pullRequest) => {
    if (pullRequest.draft) {
      return { text: 'Draft', className: 'bg-amber-500/15 text-amber-300 border border-amber-400/20' };
    }
    if (pullRequest.merged) {
      return { text: 'Merged', className: 'bg-purple-500/15 text-purple-300 border border-purple-400/20' };
    }
    if (pullRequest.state === 'closed') {
      return { text: 'Closed', className: 'bg-slate-700 text-slate-300 border border-slate-600' };
    }
    return { text: 'Open', className: 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/20' };
  };

  const linkButtonClass = (disabled) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
      disabled
        ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
        : 'bg-rose-500/90 hover:bg-rose-400 text-white'
    }`;

  const itemCardClass =
    "bg-slate-800/50 border border-slate-700/60 rounded-xl p-4 hover:bg-slate-800 transition-colors";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Repository Header */}
        <div className={panelClass}>
          <div className="flex flex-col md:flex-row md:justify-between md:items-center">
            <div>
              <div className="flex items-center mb-2 gap-3">
                <h1 className="text-2xl font-bold text-slate-100">{repository.name}</h1>
                <span className="bg-slate-800 text-slate-300 border border-slate-700 px-2.5 py-1 text-xs rounded-full">
                  {repository.private ? 'Private' : 'Public'}
                </span>
              </div>
              <p className="text-slate-400 mb-4">
                {repository.description || 'No description provided'}
              </p>
              <div className="flex flex-wrap gap-4 text-sm text-slate-400">
                {repository.language && (
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-sky-400"></span>
                    {repository.language}
                  </div>
                )}
                <div>Updated: {formatDate(repository.updated_at)}</div>
                <div>Stars: {repository.stargazers_count || 0}</div>
                <div>Forks: {repository.forks_count || 0}</div>
              </div>
            </div>
            <div className="mt-4 md:mt-0 shrink-0">
              <a
                href={repository.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-100 px-4 py-2 rounded-lg inline-flex items-center gap-2 transition-colors text-sm font-medium"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                View on GitHub
              </a>
            </div>
          </div>
        </div>

        {/* Pull Requests Section */}
        <div className={panelClass}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={sectionTitleClass}>Repository Pull Requests</h2>
            <span className="text-sm text-slate-400">{pullRequests.length} total</span>
          </div>

          {loadingPullRequests ? (
            <div className="py-10 text-center">
              <LoadingSpinner />
            </div>
          ) : pullRequests.length > 0 ? (
            <div className="space-y-3">
              {pullRequests.map((pullRequest) => {
                const pullRequestStatus = getPullRequestStatus(pullRequest);
                return (
                  <div key={pullRequest.id} className={itemCardClass}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h3 className="font-medium">
                          <a
                            href={pullRequest.html_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-rose-300 hover:text-rose-200 transition-colors"
                          >
                            #{pullRequest.number} {pullRequest.title}
                          </a>
                        </h3>
                        <div className="text-sm text-slate-400 mt-1">
                          Opened on {formatDate(pullRequest.created_at)} by {pullRequest.user?.login || 'Unknown'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${pullRequestStatus.className}`}>
                          {pullRequestStatus.text}
                        </span>
                        <button
                          onClick={() => handleLinkPullRequest(pullRequest.id)}
                          disabled={!selectedTask || linkingPullRequest}
                          className={linkButtonClass(!selectedTask || linkingPullRequest)}
                        >
                          {linkingPullRequest ? 'Linking...' : 'Link to Task'}
                        </button>
                      </div>
                    </div>
                    {pullRequest.body && (
                      <div className="mt-2 text-sm text-slate-400 line-clamp-2">
                        {pullRequest.body}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {pullRequest.labels?.map(label => (
                        <span
                          key={label.id || label.name}
                          className="px-2 py-1 text-xs rounded-full bg-sky-500/15 text-sky-300 border border-sky-400/20"
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
            <div className="text-center py-10 text-slate-400">
              No pull requests found in this repository.
            </div>
          )}
        </div>

        {/* Task Linking Section */}
        <div className={panelClass}>
          <h2 className={`${sectionTitleClass} mb-4`}>Link Issues to Tasks</h2>

          {successMessage && (
            <div className="bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 px-4 py-3 rounded-lg mb-4">
              {successMessage}
            </div>
          )}

          {loadingTasks ? (
            <div className="py-4 text-center">
              <LoadingSpinner size="small" />
            </div>
          ) : tasks.length > 0 ? (
            <div className="mb-4">
              <label className="block text-slate-300 text-sm font-semibold mb-2">
                Select a Task to Link
              </label>
              <select
                className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-400/60 transition-colors"
                value={selectedTask}
                onChange={(e) => setSelectedTask(e.target.value)}
                disabled={linkingIssue || linkingPullRequest}
              >
                <option value="" className="bg-slate-800">Choose a task...</option>
                {tasks.map((task) => (
                  <option key={task.id} value={task.id} className="bg-slate-800">
                    {task.title} ({task.status})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="bg-amber-500/10 border border-amber-400/20 text-amber-300 p-4 rounded-lg mb-4">
              No available tasks found. Please create a task first.
            </div>
          )}
        </div>

        {/* Issues Section */}
        <div className={panelClass}>
          <h2 className={`${sectionTitleClass} mb-4`}>Repository Issues</h2>

          {loadingIssues ? (
            <div className="py-10 text-center">
              <LoadingSpinner />
            </div>
          ) : issues.length > 0 ? (
            <div className="space-y-3">
              {issues.map((issue) => (
                <div key={issue.id} className={itemCardClass}>
                  <div className="flex justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-medium">
                        <a
                          href={issue.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-rose-300 hover:text-rose-200 transition-colors"
                        >
                          #{issue.number} {issue.title}
                        </a>
                      </h3>
                      <div className="text-sm text-slate-400 mt-1">
                        Opened on {formatDate(issue.created_at)} by {issue.user?.login || 'Unknown'}
                      </div>
                    </div>
                    <div className="shrink-0">
                      <button
                        onClick={() => handleLinkIssue(issue.id)}
                        disabled={!selectedTask || linkingIssue || linkingPullRequest}
                        className={linkButtonClass(!selectedTask || linkingIssue || linkingPullRequest)}
                      >
                        {linkingIssue ? 'Linking...' : 'Link to Task'}
                      </button>
                    </div>
                  </div>
                  {issue.body && (
                    <div className="mt-2 text-sm text-slate-400 line-clamp-2">
                      {issue.body}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {issue.labels?.map(label => (
                      <span
                        key={label.id || label.name}
                        className="px-2 py-1 text-xs rounded-full bg-sky-500/15 text-sky-300 border border-sky-400/20"
                      >
                        {label.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-slate-400">
              No issues found in this repository.
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default GitHubIntegrationDetail;