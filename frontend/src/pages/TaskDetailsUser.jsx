import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { taskService, githubService } from '../services/utils/api';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import ProgressBar from '../components/ProgressBar';
import TaskForm from '../components/TaskForm';

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
  const [loadingRepos, setLoadingRepos] = useState(false);
  
  // Comments state
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  // Task editing state
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [editUsers, setEditUsers] = useState([]);
  const [editProjects, setEditProjects] = useState([]);
  const [loadingEditOptions, setLoadingEditOptions] = useState(false);
  const [savingTaskEdit, setSavingTaskEdit] = useState(false);
  const [editError, setEditError] = useState(null);

  const isManager = currentUser?.role === 'admin' || currentUser?.role === 'team_lead';
  const isAssigned = task?.assigned_to === currentUser?.id;
  const canEditTask = isManager || isAssigned;

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
        
        const linkedGithubItems = await githubService.getTaskGithubLinks(id);
        setGithubLinks(linkedGithubItems || taskData?.github_links || []);
        
      } catch (err) {
        console.error('Task details fetch error:', err);
        setError('Failed to fetch task details. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchTaskDetails();
  }, [id]);

  useEffect(() => {
    const loadRepositories = async () => {
      setLoadingRepos(true);
      try {
        const result = await githubService.getUserRepos();
        setRepositories(result || []);
      } catch (err) {
        console.error('Failed to fetch repositories:', err);
        setRepositories([]);
      } finally {
        setLoadingRepos(false);
      }
    };

    loadRepositories();
  }, []);

  const handleProgressUpdate = async (newProgress) => {
    try {
      setUpdateLoading(true);
      await taskService.updateTask(id, { progress: newProgress });
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

  const handleStartEditingTask = async () => {
    try {
      setLoadingEditOptions(true);
      setEditError(null);

      const [usersData, projectsData] = await Promise.all([
        taskService.getUsers(),
        taskService.getProjects(),
      ]);

      setEditUsers(Array.isArray(usersData) ? usersData : []);
      setEditProjects(Array.isArray(projectsData) ? projectsData : []);
      setIsEditingTask(true);
    } catch (err) {
      console.error('Failed to load task edit options:', err);
      setEditError('Failed to load edit options. Please try again.');
    } finally {
      setLoadingEditOptions(false);
    }
  };

  const handleCancelTaskEdit = () => {
    setIsEditingTask(false);
    setEditError(null);
  };

  const handleTaskEditSubmit = async (editedTask) => {
    try {
      setSavingTaskEdit(true);
      setEditError(null);

      const payload = {
        title: editedTask.title,
        description: editedTask.description,
        status: editedTask.status || task.status,
        priority: editedTask.priority || task.priority,
        assigned_to: editedTask.assignee ? Number(editedTask.assignee) : null,
        project_id: editedTask.project ? Number(editedTask.project) : null,
        deadline: editedTask.deadline ? new Date(editedTask.deadline).toISOString() : null,
      };

      await taskService.updateTask(id, payload);
      const refreshedTask = await taskService.getTaskById(id);

      setTask(refreshedTask || { ...task, ...payload });
      setIsEditingTask(false);
    } catch (err) {
      console.error('Failed to update task details:', err);
      setEditError('Failed to update task. Please try again.');
    } finally {
      setSavingTaskEdit(false);
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

  const handleOpenGithubLink = async () => {
    if (repositories.length === 0) {
      setLoadingRepos(true);
      try {
        const result = await githubService.getUserRepos(); // no activityWindowDays = fast path
        setRepositories(result || []);
      } catch (err) {
        console.error('Failed to fetch repositories:', err);
      } finally {
        setLoadingRepos(false);
      }
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
      const linkedGithubItems = await githubService.getTaskGithubLinks(id);
      setGithubLinks(linkedGithubItems || []);
      
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
        <div className="text-xl text-rose-300 mb-4">{error || 'Task not found'}</div>
        <button 
          onClick={() => navigate('/tasks')} 
          className="px-4 py-2 rounded-full bg-rose-500/90 text-white hover:bg-rose-400"
        >
          Back to Tasks
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-['Space_Grotesk']">
      <div className="max-w-6xl mx-auto px-6 py-10 md:px-10">
        <div className="bg-slate-900/70 rounded-2xl border border-slate-800/70 overflow-hidden shadow-md backdrop-blur-sm">
        {/* Task Header */}
        <div className="bg-slate-900/90 text-slate-100 p-6 border-b border-slate-800/70">
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
                (task.status === 'completed' || task.status === 'done') ? 'bg-emerald-500/15 text-emerald-200' : 
                task.status === 'in_progress' ? 'bg-amber-500/15 text-amber-200' : 
                'bg-slate-800/70 text-slate-300'
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
            <div className="flex items-center justify-between mb-4 gap-3">
              <h2 className="text-xl font-semibold text-slate-100">Task Details</h2>
              {canEditTask && !isEditingTask && (
                <button
                  type="button"
                  onClick={handleStartEditingTask}
                  disabled={loadingEditOptions}
                  className={`px-4 py-2 rounded-full text-sm font-medium ${
                    loadingEditOptions
                      ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                      : 'bg-rose-500/90 text-white hover:bg-rose-400'
                  }`}
                >
                  {loadingEditOptions ? 'Loading...' : 'Edit Task'}
                </button>
              )}
            </div>
            <div className="bg-slate-950/60 rounded-xl border border-slate-800/70 p-4">
              {editError && (
                <div className="mb-4 bg-rose-500/10 border border-rose-400/40 text-rose-200 px-4 py-3 rounded">
                  {editError}
                </div>
              )}

              {isEditingTask ? (
                <>
                  <TaskForm
                    initialData={task}
                    users={editUsers}
                    projects={editProjects}
                    onSubmit={handleTaskEditSubmit}
                  />
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={handleCancelTaskEdit}
                      disabled={savingTaskEdit}
                      className="px-4 py-2 rounded-full border border-slate-600 text-slate-200 hover:bg-slate-800/70 disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mb-4 whitespace-pre-line">{task.description}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div>
                      <p className="text-sm text-slate-400">Assigned to:</p>
                      <p className="font-medium text-slate-100">{task.assignee_name || 'Unassigned'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-400">Priority:</p>
                      <p className={`font-medium ${
                        task.priority === 'high' ? 'text-rose-300' : 
                        task.priority === 'medium' ? 'text-amber-300' : 
                        'text-sky-300'
                      }`}>
                        {task.priority === 'high' ? 'High' : 
                         task.priority === 'medium' ? 'Medium' : 
                         'Low'}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          
          {/* Progress Update (if task is not completed and user can edit) */}
          {task.status !== 'completed' && task.status !== 'done' && canEditTask && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4 text-slate-100">Update Progress</h2>
              <div className="bg-slate-950/60 rounded-xl border border-slate-800/70 p-4">
                <ProgressBar 
                  progress={task.progress || 0}
                  onChange={handleProgressUpdate}
                  disabled={updateLoading || (currentUser.role === 'developer' && !isAssigned)}
                />
              </div>
            </div>
          )}
          
          {/* GitHub Integration */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4 text-slate-100">GitHub Integration</h2>
            <div className="bg-slate-950/60 rounded-xl border border-slate-800/70 p-4">
              {/* Linked GitHub Issues */}
              {githubLinks.length > 0 && (
                <div className="mb-6">
                  <h3 className="font-semibold mb-3 text-slate-100">Linked GitHub Issues:</h3>
                  <div className="space-y-2">
                    {githubLinks.map((link) => (
                      <div key={link.id} className="flex items-center justify-between bg-slate-950/60 p-3 rounded border border-slate-800/70">
                        <div>
                          <span className="font-medium text-slate-100">{link.repo_name}</span>
                          <span className="mx-2 text-slate-500">•</span>
                          <span className="text-slate-300">#{link.issue_number} - {link.issue_title}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <a 
                            href={`https://github.com/${link.repo_name}/issues/${link.issue_number}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-rose-300 hover:text-rose-200"
                          >
                            View
                          </a>
                          <button
                            onClick={() => handleRemoveGithubLink(link.id)}
                            className="text-rose-300 hover:text-rose-200"
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
                {canEditTask && repositories.length > 0 ? (
                  <>
                    <h3 className="font-semibold mb-3 text-slate-100">Link GitHub Issue:</h3>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1">
                        <select 
                          className="w-full p-2 border border-slate-700/60 rounded bg-slate-950/60 text-slate-100"
                          value={selectedRepo}
                          onChange={(e) => handleRepoSelect(e.target.value)}
                        >
                          <option value="">Select Repository</option>
                          {repositories.map((repo) => (
                            <option key={repo.id} value={repo.id}>
                              {repo.full_name || repo.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      
                      <div className="flex-1">
                        <select 
                          className="w-full p-2 border border-slate-700/60 rounded bg-slate-950/60 text-slate-100"
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
                ) : canEditTask ? (
                  <div className="text-center py-4">
                    {loadingRepos ? (
                      <p className="text-slate-400">Loading repositories...</p>
                    ) : repositories.length === 0 ? (
                      <>
                        <p className="text-slate-400 mb-4">Connect your GitHub account to link issues</p>
                        <a 
                          href="/github" 
                          className="px-4 py-2 rounded-full bg-rose-500/90 text-white hover:bg-rose-400"
                        >
                          Connect GitHub Account
                        </a>
                      </>
                    ) : (
                      <>
                        <p className="text-slate-400 mb-4">Load your GitHub repositories to link issues</p>
                        <button 
                          onClick={handleOpenGithubLink}
                          disabled={loadingRepos}
                          className="px-4 py-2 rounded-full bg-rose-500/90 text-white hover:bg-rose-400 disabled:opacity-60"
                        >
                          {loadingRepos ? 'Loading...' : 'Load Repositories'}
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 italic text-center py-4">Only the assignee can link GitHub items.</p>
                )}
              </div>
            </div>
          </div>
          
          {/* Comments Section */}
          <div>
            <h2 className="text-xl font-semibold mb-4 text-slate-100">Comments</h2>
            <div className="bg-slate-950/60 rounded-xl border border-slate-800/70 p-4">
              <div className="mb-4">
                {comments.length > 0 ? (
                  <div className="space-y-4">
                    {comments.map((comment) => (
                      <div key={comment.id} className="bg-slate-950/60 p-4 rounded-lg border border-slate-800/70">
                        <div className="flex justify-between items-start">
                          <span className="font-medium text-slate-200">{comment.author_name}</span>
                          <span className="text-xs text-slate-500">{formatDate(comment.created_at)}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-line text-slate-200">{comment.content}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-center py-4">No comments yet</p>
                )}
              </div>
              
              {/* Add Comment Form */}
              <form onSubmit={handleCommentSubmit} className="mt-4">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="w-full p-3 border border-slate-700/60 bg-slate-950/60 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
                  placeholder="Add a comment..."
                  rows={3}
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingComment || !newComment.trim()}
                    className={`px-4 py-2 rounded ${
                      submittingComment || !newComment.trim()
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-rose-500/90 hover:bg-rose-400'
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
    </div>
  );
}

export default TaskDetailsUser;