import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { dashboardService } from '../services/utils/api';
import TaskCard from '../components/TaskCard';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../context/AuthContext';

const ClientDashboard = () => {
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { currentUser } = useAuth();
  
  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      console.log("Fetching dashboard data with token:", JSON.stringify(currentUser?.token).substring(0, 20) + "...");
      console.log("Fetching dashboard stats...");
      const data = await dashboardService.getClientDashboardStats();
      setDashboardData(data);
      setError(null);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);
  
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleRefresh = async () => {
    fetchDashboardData();
  };

  return (
    <div className="bg-neutral-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">My Dashboard</h1>
            <p className="mt-1 text-sm text-neutral-600">
              View your tasks, projects, and GitHub activity
            </p>
          </div>
          
          <button
            onClick={handleRefresh}
            className="mt-4 md:mt-0 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <LoadingSpinner size="lg" />
          </div>
        ) : error ? (
          <div className="bg-error-50 p-4 rounded-lg border border-error-300 text-error-800">
            <div className="flex">
              <svg className="h-5 w-5 text-error-400 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>{error}</p>
            </div>
            <button 
              onClick={handleRefresh}
              className="mt-3 text-sm font-medium text-error-600 hover:text-error-500"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stats Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <StatCard 
                title="Assigned Tasks" 
                value={dashboardData?.taskCounts?.assigned || 0} 
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                }
                color="primary"
              />
              
              <StatCard 
                title="In Progress" 
                value={dashboardData?.taskCounts?.inProgress || 0} 
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                color="warning"
              />
              
              <StatCard 
                title="Completed" 
                value={dashboardData?.taskCounts?.completed || 0} 
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                color="success"
              />
              
              <StatCard 
                title="Tasks Due Soon" 
                value={dashboardData?.taskCounts?.dueSoon || 0} 
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                color="error"
              />
            </div>
            
            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* My Tasks Section */}
              <div className="lg:col-span-2">
                <div className="bg-white rounded-lg shadow-card overflow-hidden h-full">
                  <div className="px-4 py-5 sm:px-6 border-b border-neutral-200 flex justify-between items-center">
                    <h3 className="text-lg leading-6 font-medium text-neutral-900">My Tasks</h3>
                    <Link to="/tasks" className="text-sm text-primary-600 hover:text-primary-500 font-medium">
                      View all tasks
                    </Link>
                  </div>
                  <div className="overflow-hidden">
                    <div className="px-4 py-2 border-b border-neutral-200 flex space-x-1">
                      <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-0.5 rounded">In Progress</span>
                      <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded">High Priority</span>
                      <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">Due Soon</span>
                    </div>
                    
                    {/* Task Cards */}
                    <div className="divide-y divide-neutral-200">
                      {dashboardData?.recentTasks?.length > 0 ? (
                        dashboardData.recentTasks.map((task) => (
                          <TaskCard 
                            key={task.id} 
                            task={task} 
                            showProject={true} 
                            compact={true}
                          />
                        ))
                      ) : (
                        <div className="p-6 text-center text-neutral-500">
                          <svg className="mx-auto h-12 w-12 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          <h3 className="mt-2 text-sm font-medium text-neutral-900">No tasks found</h3>
                          <p className="mt-1 text-sm text-neutral-500">You don't have any tasks assigned yet.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Side Column */}
              <div className="space-y-6">
                {/* GitHub Section */}
                <div className="bg-white rounded-lg shadow-card overflow-hidden">
                  <div className="px-4 py-5 sm:px-6 border-b border-neutral-200">
                    <h3 className="text-lg leading-6 font-medium text-neutral-900">GitHub Activity</h3>
                  </div>
                  
                  {!currentUser.github_connected ? (
                    <div className="p-6 flex flex-col items-center text-center">
                      <svg className="h-12 w-12 text-neutral-400" fill="currentColor" viewBox="0 0 24 24">
                        <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                      </svg>
                      <h3 className="mt-2 text-sm font-medium text-neutral-900">Connect GitHub</h3>
                      <p className="mt-1 text-sm text-neutral-500">
                        Link your GitHub account to track contributions and sync tasks with issues.
                      </p>
                      <div className="mt-4">
                        <Link
                          to="/github"
                          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                        >
                          Connect Now
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="p-4 border-b border-neutral-100 flex items-center">
                        <img 
                          src={`https://github.com/${currentUser.github_username}.png`} 
                          alt={currentUser.github_username}
                          className="h-8 w-8 rounded-full"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = "https://avatars.githubusercontent.com/u/0";
                          }}
                        />
                        <div className="ml-3">
                          <p className="text-sm font-medium text-neutral-900">
                            @{currentUser.github_username}
                          </p>
                          <p className="text-xs text-neutral-500">Connected</p>
                        </div>
                      </div>
                      
                      {dashboardData?.githubActivity?.length > 0 ? (
                        <ul className="divide-y divide-neutral-200">
                          {dashboardData.githubActivity.map((activity, index) => (
                            <li key={index} className="px-4 py-3 hover:bg-neutral-50">
                              <div className="flex items-start">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm text-neutral-900">
                                    {activity.type === 'issue' ? (
                                      <span className="mr-1">🔍</span> 
                                    ) : activity.type === 'pull_request' ? (
                                      <span className="mr-1">🔀</span>
                                    ) : (
                                      <span className="mr-1">📝</span>
                                    )}
                                    <a href={activity.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-600 hover:text-primary-500">
                                      {activity.title}
                                    </a>
                                  </p>
                                  <p className="text-xs text-neutral-500">
                                    {activity.repo} • {new Date(activity.date).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="p-4 text-center text-neutral-500">
                          <p>No recent GitHub activity</p>
                        </div>
                      )}
                      
                      <div className="px-4 py-3 bg-neutral-50 text-right">
                        <Link to="/github" className="text-sm font-medium text-primary-600 hover:text-primary-500">
                          View all activity
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Projects Section */}
                <div className="bg-white rounded-lg shadow-card overflow-hidden">
                  <div className="px-4 py-5 sm:px-6 border-b border-neutral-200">
                    <h3 className="text-lg leading-6 font-medium text-neutral-900">My Projects</h3>
                  </div>
                  
                  {dashboardData?.projects?.length > 0 ? (
                    <ul className="divide-y divide-neutral-200">
                      {dashboardData.projects.map((project) => (
                        <li key={project.id} className="px-4 py-4 hover:bg-neutral-50">
                          <Link to={`/projects/${project.id}`}>
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium text-neutral-900">{project.name}</p>
                              <ProjectStatusBadge status={project.status} />
                            </div>
                            <div className="mt-1 flex items-center text-xs text-neutral-500">
                              <span>{project.task_count} tasks</span>
                              <span className="mx-1">•</span>
                              <span>{project.completion_percentage}% complete</span>
                            </div>
                            <div className="mt-2 w-full bg-neutral-200 rounded-full h-1.5">
                              <div 
                                className="bg-primary-600 h-1.5 rounded-full" 
                                style={{ width: `${project.completion_percentage}%` }}
                              ></div>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="p-6 text-center text-neutral-500">
                      <p>You are not assigned to any projects yet</p>
                    </div>
                  )}
                </div>
                
                {/* Upcoming Deadlines */}
                <div className="bg-white rounded-lg shadow-card overflow-hidden">
                  <div className="px-4 py-5 sm:px-6 border-b border-neutral-200">
                    <h3 className="text-lg leading-6 font-medium text-neutral-900">Upcoming Deadlines</h3>
                  </div>
                  
                  {dashboardData?.upcomingDeadlines?.length > 0 ? (
                    <ul className="divide-y divide-neutral-200">
                      {dashboardData.upcomingDeadlines.map((task) => (
                        <li key={task.id} className="px-4 py-3 hover:bg-neutral-50">
                          <Link to={`/tasks/${task.id}`}>
                            <div className="flex justify-between">
                              <p className="text-sm font-medium text-neutral-900 truncate">{task.title}</p>
                              <TaskPriorityBadge priority={task.priority} />
                            </div>
                            <div className="mt-1 flex items-center text-xs">
                              <span className={`${isOverdue(task.due_date) ? 'text-error-600 font-medium' : 'text-neutral-500'}`}>
                                Due {formatDueDate(task.due_date)}
                              </span>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="p-6 text-center text-neutral-500">
                      <p>No upcoming deadlines</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Helper Components
const StatCard = ({ title, value, icon, color }) => {
  const colorClasses = {
    primary: {
      bg: 'bg-primary-500',
      light: 'bg-primary-100',
      text: 'text-primary-700'
    },
    success: {
      bg: 'bg-success-500',
      light: 'bg-success-100',
      text: 'text-success-700'
    },
    warning: {
      bg: 'bg-warning-500',
      light: 'bg-warning-100',
      text: 'text-warning-700'
    },
    error: {
      bg: 'bg-error-500',
      light: 'bg-error-100',
      text: 'text-error-700'
    }
  };
  
  const classes = colorClasses[color] || colorClasses.primary;

  return (
    <div className="bg-white overflow-hidden rounded-lg shadow-card">
      <div className="p-5">
        <div className="flex items-center">
          <div className={`flex-shrink-0 rounded-md ${classes.light} p-3`}>
            <div className={classes.text}>{icon}</div>
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-neutral-500 truncate">{title}</dt>
              <dd>
                <div className="text-xl font-bold text-neutral-900">{value}</div>
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
};

const ProjectStatusBadge = ({ status }) => {
  let bgColor = '';
  let textColor = '';
  
  switch(status) {
    case 'active':
      bgColor = 'bg-green-100';
      textColor = 'text-green-800';
      break;
    case 'completed':
      bgColor = 'bg-blue-100';
      textColor = 'text-blue-800';
      break;
    case 'on-hold':
      bgColor = 'bg-yellow-100';
      textColor = 'text-yellow-800';
      break;
    default:
      bgColor = 'bg-neutral-100';
      textColor = 'text-neutral-800';
  }
  
  return (
    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${bgColor} ${textColor}`}>
      {status === 'on-hold' ? 'On Hold' : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

const TaskPriorityBadge = ({ priority }) => {
  let bgColor = '';
  let textColor = '';
  
  switch(priority) {
    case 'low':
      bgColor = 'bg-green-100';
      textColor = 'text-green-800';
      break;
    case 'medium':
      bgColor = 'bg-yellow-100';
      textColor = 'text-yellow-800';
      break;
    case 'high':
      bgColor = 'bg-red-100';
      textColor = 'text-red-800';
      break;
    default:
      bgColor = 'bg-neutral-100';
      textColor = 'text-neutral-800';
  }
  
  return (
    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${bgColor} ${textColor}`}>
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  );
};

// Helper functions
const isOverdue = (dueDate) => {
  return new Date(dueDate) < new Date();
};

const formatDueDate = (dueDate) => {
  const date = new Date(dueDate);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  
  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === tomorrow.toDateString()) {
    return 'Tomorrow';
  } else {
    return date.toLocaleDateString();
  }
};

export default ClientDashboard;