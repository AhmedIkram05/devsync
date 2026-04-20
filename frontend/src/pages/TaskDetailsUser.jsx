import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { taskService, githubService } from '../services/utils/api';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import ProgressBar from '../components/ProgressBar';

function TaskDetailsUser() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updateLoading, setUpdateLoading] = useState(false);
  
  // GitHub integration states
  const [repositories, setRepositories] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [issues, setIssues] = useState([]);
  const [githubLinks, setGithubLinks] = useState([]);
  const [loadingIssues, setLoadingIssues] = useState(false);
  
  // Comments state
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  useEffect(() => {
    const fetchTaskDetails = async () => {
      try {
        setLoading(true);
        
        // Fetch task details
        const taskData = await taskService.getTaskById(id);
        setTask(taskData);
        
        // Fetch task comments
        const commentsData = await taskService.getTaskComments(id);
        setComments(commentsData || []);
        
        // Try to fetch GitHub repositories and linked issues
        try {
          const repos = await githubService.getUserRepos();
          setRepositories(repos || []);
          
          // Check if task has any GitHub links
          if (taskData.github_links && taskData.github_links.length > 0) {
            setGithubLinks(taskData.github_links);
          }
        } catch (githubError) {
          console.warn('Could not fetch GitHub data:', githubError);
          // Don't fail the entire task load if GitHub data fails
        }
        
      } catch (err) {
        console.error('Task details fetch error:', err);
        setError('Failed to fetch task details. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchTaskDetails();
  }, [id]);

  const handleProgressUpdate = async (newProgress) => {
    try {
      setUpdateLoading(true);
      await taskService.updateTaskProgress(id, { progress: newProgress });
      setTask(prev => ({ ...prev, progress: newProgress }));
      
      // If progress is 100%, ask if user wants to mark task as completed
      if (newProgress === 100) {
        const shouldComplete = window.confirm('Would you like to mark this task as completed?');
        if (shouldComplete) {
          await taskService.updateTask(id, { status: 'done', completed_date: new Date().toISOString() });
          setTask(prev => ({ ...prev, status: 'done', completed_date: new Date().toISOString() }));
        }
      }
    } catch (err) {
      console.error('Failed to update progress:', err);
      alert('Failed to update progress. Please try again.');
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    
    if (!newComment.trim()) return;
    
    try {
      setSubmittingComment(true);
      
      const commentData = {
        content: newComment.trim(),
        author_id: currentUser.id,
        author_name: currentUser.name || currentUser.email
      };
      
      const response = await taskService.addTaskComment(id, commentData);
      
      // Add the new comment to the list
      setComments(prevComments => [...prevComments, response]);
      
      // Clear the comment input
      setNewComment('');
    } catch (err) {
      console.error('Failed to post comment:', err);
      alert('Failed to post comment. Please try again.');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleRepoSelect = async (repoId) => {
    setSelectedRepo(repoId);
    if (!repoId) {
      setIssues([]);
      return;
    }
    
    try {
      setLoadingIssues(true);
      const issuesData = await githubService.getIssues(repoId);
      setIssues(issuesData || []);
    } catch (err) {
      console.error('Failed to fetch repository issues:', err);
      alert('Failed to fetch GitHub issues. Please try again.');
      setIssues([]);
    } finally {
      setLoadingIssues(false);
    }
  };

  const handleLinkIssue = async (issueId) => {
    if (!issueId) return;
    
    try {
      setUpdateLoading(true);
      
      // Find the selected repository and issue for display purposes
      const selectedIssue = issues.find(issue => issue.id.toString() === issueId.toString());
      const selectedRepository = repositories.find(repo => repo.id.toString() === selectedRepo.toString());
      
      if (!selectedIssue || !selectedRepository) {
        throw new Error('Selected issue or repository not found');
      }
      
      const linkData = {
        repo_id: Number(selectedRepo),
        repo_name: selectedRepository.full_name,
        issue_id: Number(issueId),
        issue_number: selectedIssue.number,
        issue_title: selectedIssue.title
      };
      
      await githubService.linkTaskToGithub(id, linkData);
      
      // Update the local state with the new link
      setGithubLinks(prevLinks => [...prevLinks, {
        id: Date.now(), // Temporary ID until we refresh data
        ...linkData
      }]);
      
      // Reset selections
      setSelectedRepo('');
      setIssues([]);
      
    } catch (err) {
      console.error('Failed to link issue:', err);
      alert('Failed to link GitHub issue. Please try again.');
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleRemoveGithubLink = async (linkId) => {
    try {
      setUpdateLoading(true);
      await githubService.unlinkTaskFromGithub(id, linkId);
      
      // Remove the link from local state
      setGithubLinks(prevLinks => prevLinks.filter(link => link.id !== linkId));
    } catch (err) {
      console.error('Failed to remove GitHub link:', err);
      alert('Failed to remove GitHub link. Please try again.');
    } finally {
      setUpdateLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString() + ' at ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    } catch (error) {
      return 'Invalid date';
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="flex flex-col h-screen items-center justify-center p-6">
        <div className="text-xl text-red-600 mb-4">{error || 'Task not found'}</div>
        <button 
          onClick={() => navigate('/tasks')} 
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Back to Tasks
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-4xl">
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        {/* Task Header */}
        <div className="bg-blue-600 text-white p-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold mb-2">{task.title}</h1>
              <div className="flex items-center space-x-4 text-sm">
                <span className="flex items-center">
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Created: {formatDate(task.created_at)}
                </span>
                {task.deadline && (
                  <span className="flex items-center">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Due: {formatDate(task.deadline)}
                  </span>
                )}
              </div>
            </div>
            <span 
              className={`px-3 py-1 rounded-full text-sm font-semibold ${
                (task.status === 'completed' || task.status === 'done') ? 'bg-green-100 text-green-800' : 
                task.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' : 
                'bg-gray-100 text-gray-800'
              }`}
            >
              {task.status === 'in_progress' ? 'In Progress' : 
               (task.status === 'completed' || task.status === 'done') ? 'Completed' : 
               task.status === 'todo' ? 'To Do' : 
               task.status === 'backlog' ? 'Backlog' : 
               task.status}
            </span>
          </div>
        </div>
        
        {/* Task Body */}
        <div className="p-6">
          {/* Task Details */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Task Details</h2>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="mb-4 whitespace-pre-line">{task.description}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <p className="text-sm text-gray-600">Assigned to:</p>
                  <p className="font-medium">{task.assignee_name || 'Unassigned'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Priority:</p>
                  <p className={`font-medium ${
                    task.priority === 'high' ? 'text-red-600' : 
                    task.priority === 'medium' ? 'text-yellow-600' : 
                    'text-blue-600'
                  }`}>
                    {task.priority === 'high' ? 'High' : 
                     task.priority === 'medium' ? 'Medium' : 
                     'Low'}
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Progress Update (if task is not completed) */}
          {task.status !== 'completed' && task.status !== 'done' && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Update Progress</h2>
              <div className="bg-gray-50 rounded-lg p-4">
                <ProgressBar 
                  progress={task.progress || 0}
                  onChange={handleProgressUpdate}
                  disabled={updateLoading}
                />
              </div>
            </div>
          )}
          
          {/* GitHub Integration */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">GitHub Integration</h2>
            <div className="bg-gray-50 rounded-lg p-4">
              {/* Linked GitHub Issues */}
              {githubLinks.length > 0 && (
                <div className="mb-6">
                  <h3 className="font-semibold mb-3">Linked GitHub Issues:</h3>
                  <div className="space-y-2">
                    {githubLinks.map((link) => (
                      <div key={link.id} className="flex items-center justify-between bg-white p-3 rounded border border-gray-200">
                        <div>
                          <span className="font-medium">{link.repo_name}</span>
                          <span className="mx-2">•</span>
                          <span>#{link.issue_number} - {link.issue_title}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <a 
                            href={`https://github.com/${link.repo_name}/issues/${link.issue_number}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800"
                          >
                            View
                          </a>
                          <button
                            onClick={() => handleRemoveGithubLink(link.id)}
                            className="text-red-600 hover:text-red-800"
                            disabled={updateLoading}
                          >
                            Unlink
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Link new GitHub Issue */}
              <div>
                <h3 className="font-semibold mb-3">Link GitHub Issue:</h3>
                {repositories.length > 0 ? (
                  <>
                    <div className="flex flex-col md:flex-row md:items-center gap-2">
                      <div className="flex-1">
                        <select 
                          className="w-full p-2 border rounded"
                          value={selectedRepo}
                          onChange={(e) => handleRepoSelect(e.target.value)}
                          disabled={updateLoading}
                        >
                          <option value="">Select Repository</option>
                          {repositories.map((repo) => (
                            <option key={repo.id} value={repo.id}>
                              {repo.full_name}
                            </option>
                          ))}
                        </select>
                      </div>
                      
                      <div className="flex-1">
                        <select 
                          className="w-full p-2 border rounded"
                          disabled={!selectedRepo || loadingIssues || updateLoading}
                          onChange={(e) => handleLinkIssue(e.target.value)}
                          defaultValue=""
                        >
                          <option value="">
                            {loadingIssues ? 'Loading issues...' : 'Select Issue'}
                          </option>
                          {issues.map((issue) => (
                            <option key={issue.id} value={issue.id}>
                              #{issue.number} - {issue.title}
                            </option>
                          ))}
                          {!loadingIssues && issues.length === 0 && selectedRepo && (
                            <option value="" disabled>No issues found</option>
                          )}
                        </select>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-gray-600 mb-4">Connect your GitHub account to link issues</p>
                    <a 
                      href="/github" 
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Connect GitHub Account
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Comments Section */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Comments</h2>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="mb-4">
                {comments.length > 0 ? (
                  <div className="space-y-4">
                    {comments.map((comment) => (
                      <div key={comment.id} className="bg-white p-4 rounded-lg border border-gray-200">
                        <div className="flex justify-between items-start">
                          <span className="font-medium">{comment.author_name}</span>
                          <span className="text-xs text-gray-500">{formatDate(comment.created_at)}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-line">{comment.content}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">No comments yet</p>
                )}
              </div>
              
              {/* Add Comment Form */}
              <form onSubmit={handleCommentSubmit} className="mt-4">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Add a comment..."
                  rows={3}
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingComment || !newComment.trim()}
                    className={`px-4 py-2 rounded ${
                      submittingComment || !newComment.trim()
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700'
                    } text-white`}
                  >
                    {submittingComment ? 'Posting...' : 'Post Comment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TaskDetailsUser;