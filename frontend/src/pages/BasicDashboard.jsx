import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { dashboardService } from '../services/utils/api';
import TaskCard from '../components/TaskCard';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../context/AuthContext';

const panelClass = "bg-slate-900/70 border border-slate-800/70 rounded-2xl overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.25)]";
const panelHeaderClass = "px-4 py-5 sm:px-6 border-b border-slate-800 flex justify-between items-center";
const sectionTitleClass = "text-lg font-semibold text-slate-100";

const BasicDashboard = () => {
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { currentUser } = useAuth();

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      console.log("Fetching dashboard data with token:", JSON.stringify(currentUser?.token).substring(0, 20) + "...");
      console.log("Fetching dashboard stats...");
      const data = await dashboardService.getBasicDashboardStats();
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
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">My Dashboard</h1>
            <p className="mt-1 text-sm text-slate-400">
              View your tasks, projects, and GitHub activity
            </p>
          </div>

          <button
            onClick={handleRefresh}
            className="mt-4 md:mt-0 inline-flex items-center px-4 py-2 rounded-full text-sm font-medium text-white bg-rose-500/90 hover:bg-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
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
          <div className="bg-rose-500/10 p-4 rounded-lg border border-rose-400/40 text-rose-200">
            <div className="flex">
              <svg className="h-5 w-5 text-rose-300 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>{error}</p>
            </div>
            <button
              onClick={handleRefresh}
              className="mt-3 text-sm font-medium text-rose-300 hover:text-rose-200"
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
                <div className={`${panelClass} h-full`}>
                  <div className={panelHeaderClass}>
                    <h3 className={sectionTitleClass}>My Tasks</h3>
                    <Link to="/tasks" className="text-sm text-rose-300 hover:text-rose-200 font-medium">
                      View all tasks
                    </Link>
                  </div>
                  <div className="overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-800 flex flex-wrap gap-2">
                      <span className="bg-amber-500/15 text-amber-300 border border-amber-400/20 text-xs font-medium px-2.5 py-1 rounded-full">In Progress</span>
                      <span className="bg-rose-500/15 text-rose-300 border border-rose-400/20 text-xs font-medium px-2.5 py-1 rounded-full">High Priority</span>
                      <span className="bg-sky-500/15 text-sky-300 border border-sky-400/20 text-xs font-medium px-2.5 py-1 rounded-full">Due Soon</span>
                    </div>

                    {/* Task Cards */}
                    <div className="divide-y divide-slate-800">
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
                        <div className="p-6 text-center text-slate-400">
                          <svg className="mx-auto h-12 w-12 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          <h3 className="mt-2 text-sm font-medium text-slate-200">No tasks found</h3>
                          <p className="mt-1 text-sm text-slate-400">You don't have any tasks assigned yet.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Side Column */}
              <div className="space-y-6">
                {/* GitHub Section */}
                <div className={panelClass}>
                  <div className="px-4 py-5 sm:px-6 border-b border-slate-800">
                    <h3 className={sectionTitleClass}>GitHub Activity</h3>
                  </div>

                  {!currentUser.github_connected ? (
                    <div className="p-6 flex flex-col items-center text-center">
                      <svg className="h-12 w-12 text-slate-500" fill="currentColor" viewBox="0 0 24 24">
                        <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                      </svg>
                      <h3 className="mt-2 text-sm font-medium text-slate-200">Connect GitHub</h3>
                      <p className="mt-1 text-sm text-slate-400">
                        Link your GitHub account to track contributions and sync tasks with issues.
                      </p>
                      <div className="mt-4">
                        <Link
                          to="/github"
                          className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium text-white bg-rose-500/90 hover:bg-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
                        >
                          Connect Now
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="p-4 border-b border-slate-800 flex items-center">
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
                          <p className="text-sm font-medium text-slate-100">
                            @{currentUser.github_username}
                          </p>
                          <p className="text-xs text-emerald-400">Connected</p>
                        </div>
                      </div>

                      {dashboardData?.githubActivity?.length > 0 ? (
                        <ul className="divide-y divide-slate-800">
                          {dashboardData.githubActivity.map((activity, index) => (
                            <li key={index} className="px-4 py-3 hover:bg-slate-800/60 transition-colors">
                              <div className="flex items-start">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm text-slate-200">
                                    {activity.type === 'issue' ? (
                                      <span className="mr-1">🔍</span>
                                    ) : activity.type === 'pull_request' ? (
                                      <span className="mr-1">🔀</span>
                                    ) : (
                                      <span className="mr-1">📝</span>
                                    )}
                                    <a href={activity.url} target="_blank" rel="noopener noreferrer" className="font-medium text-rose-300 hover:text-rose-200">
                                      {activity.title}
                                    </a>
                                  </p>
                                  <p className="text-xs text-slate-400">
                                    {activity.repo} • {new Date(activity.date).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="p-4 text-center text-slate-400">
                          <p>No recent GitHub activity</p>
                        </div>
                      )}

                      <div className="px-4 py-3 bg-slate-900/80 border-t border-slate-800 text-right">
                        <Link to="/github" className="text-sm font-medium text-rose-300 hover:text-rose-200">
                          View all activity
                        </Link>
                      </div>
                    </div>
                  )}
                </div>

                {/* Projects Section */}
                <div className={panelClass}>
                  <div className="px-4 py-5 sm:px-6 border-b border-slate-800">
                    <h3 className={sectionTitleClass}>My Projects</h3>
                  </div>

                  {dashboardData?.projects?.length > 0 ? (
                    <ul className="divide-y divide-slate-800">
                      {dashboardData.projects.map((project) => (
                        <li key={project.id} className="px-4 py-4 hover:bg-slate-800/60 transition-colors">
                          <Link to={`/projects/${project.id}`}>
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium text-slate-100">{project.name}</p>
                              <ProjectStatusBadge status={project.status} />
                            </div>
                            <div className="mt-1 flex items-center text-xs text-slate-400">
                              <span>{project.task_count} tasks</span>
                              <span className="mx-1">•</span>
                              <span>{project.completion_percentage}% complete</span>
                            </div>
                            <div className="mt-3 w-full bg-slate-800 rounded-full h-1.5">
                              <div
                                className="bg-rose-400 h-1.5 rounded-full"
                                style={{ width: `${project.completion_percentage}%` }}
                              />
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="p-6 text-center text-slate-400">
                      <p>You are not assigned to any projects yet</p>
                    </div>
                  )}
                </div>

                {/* Upcoming Deadlines */}
                <div className={panelClass}>
                  <div className="px-4 py-5 sm:px-6 border-b border-slate-800">
                    <h3 className={sectionTitleClass}>Upcoming Deadlines</h3>
                  </div>

                  {dashboardData?.upcomingDeadlines?.length > 0 ? (
                    <ul className="divide-y divide-slate-800">
                      {dashboardData.upcomingDeadlines.map((task) => (
                        <li key={task.id} className="px-4 py-3 hover:bg-slate-800/60 transition-colors">
                          <Link to={`/tasks/${task.id}`}>
                            <div className="flex justify-between gap-2">
                              <p className="text-sm font-medium text-slate-100 truncate">{task.title}</p>
                              <TaskPriorityBadge priority={task.priority} />
                            </div>
                            <div className="mt-1 flex items-center text-xs">
                              <span className={isOverdue(task.due_date) ? 'text-rose-300 font-medium' : 'text-slate-400'}>
                                Due {formatDueDate(task.due_date)}
                              </span>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="p-6 text-center text-slate-400">
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
      light: 'bg-sky-500/15 border-sky-400/20',
      text: 'text-sky-300'
    },
    success: {
      light: 'bg-emerald-500/15 border-emerald-400/20',
      text: 'text-emerald-300'
    },
    warning: {
      light: 'bg-amber-500/15 border-amber-400/20',
      text: 'text-amber-300'
    },
    error: {
      light: 'bg-rose-500/15 border-rose-400/20',
      text: 'text-rose-300'
    }
  };

  const classes = colorClasses[color] || colorClasses.primary;

  return (
    <div className="bg-slate-900/70 overflow-hidden rounded-2xl border border-slate-800/70">
      <div className="p-5">
        <div className="flex items-center">
          <div className={`flex-shrink-0 rounded-xl ${classes.light} p-3 border`}>
            <div className={`${classes.text}`}>{icon}</div>
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-slate-400 truncate">{title}</dt>
              <dd>
                <div className="text-xl font-bold text-slate-100">{value}</div>
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
};

const ProjectStatusBadge = ({ status }) => {
  const styles = {
    active:    'bg-emerald-500/15 text-emerald-300 border border-emerald-400/20',
    completed: 'bg-sky-500/15 text-sky-300 border border-sky-400/20',
    'on-hold': 'bg-amber-500/15 text-amber-300 border border-amber-400/20',
    on_hold:   'bg-amber-500/15 text-amber-300 border border-amber-400/20',
    cancelled: 'bg-rose-500/15 text-rose-300 border border-rose-400/20',
  };

  const badgeClass = styles[status] || 'bg-slate-800 text-slate-300 border border-slate-700';

  return (
    <span className={`px-2.5 py-1 inline-flex text-xs font-semibold rounded-full whitespace-nowrap ${badgeClass}`}>
      {(status || 'unknown')
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase())}
    </span>
  );
};

const TaskPriorityBadge = ({ priority = 'medium' }) => {
  const styles = {
    low:    'bg-emerald-500/15 text-emerald-300 border border-emerald-400/20',
    medium: 'bg-amber-500/15 text-amber-300 border border-amber-400/20',
    high:   'bg-rose-500/15 text-rose-300 border border-rose-400/20',
  };

  const badgeClass = styles[priority] || 'bg-slate-800 text-slate-300 border border-slate-700';

  return (
    <span className={`px-2.5 py-1 inline-flex text-xs font-semibold rounded-full whitespace-nowrap ${badgeClass}`}>
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

export default BasicDashboard;