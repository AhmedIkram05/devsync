import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { taskService } from '../services/utils/api';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

const TaskList = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    status: 'all',
    priority: 'all',
    search: ''
  });
  
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const canCreateTasks = currentUser?.role === 'admin' || currentUser?.role === 'team_lead';

  // Fetch tasks when component mounts
  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const tasksData = await taskService.getAllTasks();
      setTasks(Array.isArray(tasksData) ? tasksData : []);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
      setError('Failed to load tasks. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (taskId, newStatus) => {
    try {
      setUpdating(true);
      await taskService.updateTask(taskId, { status: newStatus });
      
      // Update the task in the local state instead of refetching all tasks
      setTasks(prevTasks => 
        prevTasks.map(task => 
          task.id === taskId ? { ...task, status: newStatus } : task
        )
      );
    } catch (err) {
      console.error('Failed to update task:', err);
      setError('Failed to update task status.');
    } finally {
      setUpdating(false);
    }
  };

  const handleViewDetails = (taskId) => {
    navigate(`/tasks/${taskId}`);
  };

  // Format date to be more readable
  const formatDate = (dateString) => {
    if (!dateString) return 'No deadline';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (e) {
      return 'Invalid date';
    }
  };

  // Check if a task is overdue
  const isOverdue = (deadline) => {
    if (!deadline) return false;
    const today = new Date();
    const dueDate = new Date(deadline);
    return dueDate < today;
  };

  // Get status badge color and format status text
  const getStatusInfo = (status) => {
    const statusMap = {
      'todo': { class: 'bg-slate-800/70 text-slate-300', text: 'To Do' },
      'backlog': { class: 'bg-slate-800/70 text-slate-300', text: 'Backlog' },
      'in_progress': { class: 'bg-amber-500/15 text-amber-200', text: 'In Progress' },
      'review': { class: 'bg-sky-500/15 text-sky-200', text: 'Review' },
      'completed': { class: 'bg-emerald-500/15 text-emerald-200', text: 'Completed' }
    };
    
    return statusMap[status] || { class: 'bg-gray-100 text-gray-800', text: status };
  };
  
  // Get priority badge
  const getPriorityBadge = (priority) => {
    const priorityMap = {
      'high': { class: 'bg-rose-500/15 text-rose-200', text: 'High', icon: '❗' },
      'medium': { class: 'bg-amber-500/15 text-amber-200', text: 'Medium', icon: '⚠️' },
      'low': { class: 'bg-sky-500/15 text-sky-200', text: 'Low', icon: '🔽' }
    };
    
    return priorityMap[priority] || { class: 'bg-gray-100 text-gray-800', text: priority };
  };

  // Filter tasks based on selected filters
  const filteredTasks = tasks.filter(task => {
    // Filter by status
    if (filters.status !== 'all' && task.status !== filters.status) {
      return false;
    }
    
    // Filter by priority
    if (filters.priority !== 'all' && task.priority !== filters.priority) {
      return false;
    }
    
    // Filter by search text
    if (filters.search && !task.title.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }
    
    return true;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <LoadingSpinner size="large" message="Loading tasks..." />
      </div>
    );
  }

  return (
    <div className="bg-slate-950 min-h-screen p-4 md:p-6 text-slate-100">
      <div className="max-w-7xl mx-auto">
        <div className="bg-slate-900/70 rounded-2xl border border-slate-800/70 p-6 mb-6">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-6">
            <h1 className="text-2xl font-bold mb-4 md:mb-0 text-slate-100">Tasks</h1>
            <div className="flex flex-col md:flex-row gap-4">
              <button 
                onClick={() => fetchTasks()}
                disabled={loading || updating}
                className={`inline-flex items-center px-4 py-2 rounded ${
                  loading || updating
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'border border-slate-700 text-slate-200 hover:border-slate-500'
                }`}
              >
                <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
              
              {canCreateTasks && (
                <button 
                  onClick={() => navigate('/admin/create-task')}
                  className="inline-flex items-center px-4 py-2 rounded-full bg-rose-500/90 hover:bg-rose-400 text-white"
                >
                  <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  New Task
                </button>
              )}
            </div>
          </div>
          
          {error && (
            <div className="bg-rose-500/10 border border-rose-400/40 text-rose-200 px-4 py-3 rounded mb-4">
              {error}
              <button 
                onClick={() => setError(null)} 
                className="float-right font-bold text-rose-200"
              >
                &times;
              </button>
            </div>
          )}
          
          {/* Filters */}
          <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="statusFilter" className="block text-sm font-medium text-slate-300 mb-1">
                Status
              </label>
              <select
                id="statusFilter"
                value={filters.status}
                onChange={(e) => setFilters({...filters, status: e.target.value})}
                className="w-full p-2 border border-slate-700/60 rounded-md bg-slate-950/60 text-slate-100 focus:outline-none focus:ring-rose-400/60 focus:border-rose-400/60"
              >
                <option value="all">All Statuses</option>
                <option value="todo">To Do</option>
                <option value="backlog">Backlog</option>
                <option value="in_progress">In Progress</option>
                <option value="review">Review</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            
            <div>
              <label htmlFor="priorityFilter" className="block text-sm font-medium text-slate-300 mb-1">
                Priority
              </label>
              <select
                id="priorityFilter"
                value={filters.priority}
                onChange={(e) => setFilters({...filters, priority: e.target.value})}
                className="w-full p-2 border border-slate-700/60 rounded-md bg-slate-950/60 text-slate-100 focus:outline-none focus:ring-rose-400/60 focus:border-rose-400/60"
              >
                <option value="all">All Priorities</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            
            <div>
              <label htmlFor="searchFilter" className="block text-sm font-medium text-slate-300 mb-1">
                Search
              </label>
              <input
                id="searchFilter"
                type="text"
                placeholder="Search tasks..."
                value={filters.search}
                onChange={(e) => setFilters({...filters, search: e.target.value})}
                className="w-full p-2 border border-slate-700/60 rounded-md bg-slate-950/60 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-rose-400/60 focus:border-rose-400/60"
              />
            </div>
          </div>
          
          {/* Task List */}
          {filteredTasks.length === 0 ? (
            <div className="text-center py-10 text-slate-500 border border-slate-800/70 rounded-lg bg-slate-900/60">
              <svg className="mx-auto h-12 w-12 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              <p className="mt-2 text-lg">No tasks found matching your filters</p>
              {filters.status !== 'all' || filters.priority !== 'all' || filters.search ? (
                <button
                  onClick={() => setFilters({ status: 'all', priority: 'all', search: '' })}
                  className="mt-3 text-rose-300 hover:text-rose-200"
                >
                  Clear filters
                </button>
              ) : (
                <p className="mt-2">Create a new task or check back later</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-800/70">
              <table className="min-w-full divide-y divide-slate-800/70">
                <thead className="bg-slate-900/70">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Task
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Deadline
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Priority
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Progress
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-slate-950/60 divide-y divide-slate-800/70">
                  {filteredTasks.map((task) => {
                    const statusInfo = getStatusInfo(task.status);
                    const priorityInfo = getPriorityBadge(task.priority);
                    const isTaskOverdue = isOverdue(task.deadline) && task.status !== 'completed';
                    
                    return (
                      <tr key={task.id} className="hover:bg-slate-900/80 cursor-pointer" onClick={() => handleViewDetails(task.id)}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-slate-100">{task.title}</div>
                          <div className="text-sm text-slate-400 truncate max-w-xs">
                            {task.description || 'No description'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className={`text-sm ${isTaskOverdue ? 'text-rose-300 font-medium' : 'text-slate-100'}`}>
                            {formatDate(task.deadline)}
                            {isTaskOverdue && (
                              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-500/15 text-rose-200">
                                Overdue
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${statusInfo.class}`}>
                            {statusInfo.text}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${priorityInfo.class}`}>
                            {priorityInfo.icon} {priorityInfo.text}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="w-full bg-slate-800/70 rounded-full h-2.5 mr-2 max-w-[100px]">
                              <div 
                                className={`h-2.5 rounded-full ${
                                  task.progress >= 100 ? 'bg-emerald-400' : 
                                  task.progress >= 50 ? 'bg-sky-400' : 
                                  task.progress > 0 ? 'bg-amber-400' : 
                                  'bg-slate-600'
                                }`}
                                style={{ width: `${task.progress || 0}%` }}
                              ></div>
                            </div>
                            <span className="text-sm text-slate-400">{task.progress || 0}%</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium" onClick={(e) => e.stopPropagation()}>
                          <div className="flex space-x-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewDetails(task.id);
                              }}
                              className="text-rose-300 hover:text-rose-200"
                            >
                              View Details
                            </button>
                            <select
                              value={task.status}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleUpdateStatus(task.id, e.target.value);
                              }}
                              disabled={updating}
                              className="text-sm border-slate-700/60 rounded-md bg-slate-950/60 text-slate-100 focus:outline-none focus:ring-rose-400/60 focus:border-rose-400/60 mr-2"
                            >
                              <option value="todo">To Do</option>
                              <option value="backlog">Backlog</option>
                              <option value="in_progress">In Progress</option>
                              <option value="review">Review</option>
                              <option value="completed">Completed</option>
                            </select>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskList;
