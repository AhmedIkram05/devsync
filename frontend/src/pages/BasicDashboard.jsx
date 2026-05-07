import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { dashboardService } from '../services/utils/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../context/AuthContext';

const panelClass = "bg-slate-900/70 border border-slate-800/70 rounded-2xl overflow-hidden shadow-md backdrop-blur-sm";
const panelHeaderClass = "px-6 py-5 border-b border-slate-800/70 flex justify-between items-center";
const sectionTitleClass = "text-lg font-semibold text-slate-100";

const getCount = (counts, keys, fallback = 0) => {
  for (const key of keys) {
    if (counts?.[key] !== undefined && counts?.[key] !== null) {
      return counts[key];
    }
  }

  return fallback;
};

const formatTaskDate = (dateValue) => {
  if (!dateValue) return 'No deadline';

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 'No deadline';

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};

const getTaskDeadline = (task) => task?.deadline || task?.due_date || null;

const getTaskStatusClass = (status) => {
  const styles = {
    todo: 'bg-slate-800/80 text-slate-300 border border-slate-700',
    backlog: 'bg-slate-800/80 text-slate-300 border border-slate-700',
    in_progress: 'bg-amber-500/15 text-amber-300 border border-amber-400/20',
    review: 'bg-sky-500/15 text-sky-300 border border-sky-400/20',
    done: 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/20',
    completed: 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/20',
  };

  return styles[status] || 'bg-slate-800/80 text-slate-300 border border-slate-700';
};

const getPriorityClass = (priority) => {
  const styles = {
    high: 'bg-rose-500/15 text-rose-300 border border-rose-400/20',
    medium: 'bg-amber-500/15 text-amber-300 border border-amber-400/20',
    low: 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/20',
  };

  return styles[priority] || 'bg-slate-800/80 text-slate-300 border border-slate-700';
};

const getStatusLabel = (status) => {
  const normalized = (status || 'unknown').replace(/[_-]/g, ' ');
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
};

const BasicDashboard = () => {
  const [dashboardData, setDashboardData] = useState(null);
  const [teamUsers, setTeamUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { is } = useAuth();

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await dashboardService.getBasicDashboardStats();
      setDashboardData(data);
      
      // Fetch team data if Team Lead or Admin
      if (is('team_lead') || is('admin')) {
        try {
          const { userService } = await import('../services/utils/api');
          const users = await userService.getAllUsers();
          setTeamUsers(users);
        } catch (err) {
          console.error("Failed to fetch team users:", err);
        }
      }
      
      setError(null);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [is]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleRefresh = async () => {
    fetchDashboardData();
  };

  // Use full tasks list if provided by API, otherwise fall back to recentTasks
  // Limit to last 10 most recent tasks, sorted by most recent first
  const tasksToShow = ((dashboardData?.tasks && dashboardData.tasks.length) ? dashboardData.tasks : (dashboardData?.recentTasks || []))
    .sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
      const dateB = new Date(b.updated_at || b.created_at || 0).getTime();
      return dateB - dateA;
    })
    .slice(0, 10);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-['Space_Grotesk']">
      <div className="max-w-6xl mx-auto px-6 py-10 md:px-10">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">My Dashboard</h1>
            <p className="mt-1 text-sm text-slate-400">
              View your tasks, projects, and GitHub activity
            </p>
          </div>

          <div className="mt-4 md:mt-0 flex items-center gap-3">
            <Link to="/admin/create-task" className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium text-white bg-slate-800/60 hover:bg-slate-800/40 focus:outline-none">
              Create Task
            </Link>
            <button
              onClick={handleRefresh}
              className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium text-white bg-rose-500/90 hover:bg-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
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
                value={getCount(dashboardData?.taskCounts || dashboardData?.tasks, ['assigned', 'assigned_count', 'total'])}
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                }
                color="primary"
              />

              <StatCard
                title="In Progress"
                value={getCount(dashboardData?.taskCounts || dashboardData?.tasks, ['inProgress', 'in_progress'])}
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                color="warning"
              />

              <StatCard
                title="Completed"
                value={getCount(dashboardData?.taskCounts || dashboardData?.tasks, ['completed', 'done'])}
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                color="success"
              />

              <StatCard
                title="Tasks Due Soon"
                value={getCount(dashboardData?.taskCounts || dashboardData?.tasks, ['dueSoon', 'due_soon'])}
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                color="error"
              />
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch min-h-[720px]">
              <div className="lg:col-span-2 flex flex-col gap-6 h-full">
                <div className={`${panelClass} flex-1 min-h-[520px] max-h-[70vh]`}>
                  <div className={panelHeaderClass}>
                    <div>
                      <h3 className={sectionTitleClass}>My Tasks</h3>
                      <p className="mt-1 text-xs text-slate-500">Your latest assigned work, with the same fields you see on the tasks page.</p>
                    </div>
                    <Link to="/tasks" className="text-sm text-rose-300 hover:text-rose-200 font-medium">
                      View all tasks
                    </Link>
                  </div>

                  {tasksToShow.length > 0 ? (
                    <ul className={`divide-y divide-slate-800 overflow-y-auto`} style={{ maxHeight: 'calc(100% - 96px)' }}>
                      {tasksToShow.map((task) => (
                        <li key={task.id} className="px-5 py-4 hover:bg-slate-800/60 transition-colors">
                          <Link to={`/tasks/${task.id}`} className="block">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-semibold text-slate-100 truncate">{task.title}</p>
                                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${getTaskStatusClass(task.status)}`}>
                                    {getStatusLabel(task.status)}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${getPriorityClass(task.priority)}`}>
                                    {getStatusLabel(task.priority)} Priority
                                  </span>
                                </div>
                                <p className="mt-1 text-sm text-slate-400 line-clamp-2">
                                  {task.description || 'No description provided'}
                                </p>
                                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                  <span>{task.project_name || 'No project'}</span>
                                  <span>•</span>
                                  <span>Due {formatTaskDate(getTaskDeadline(task))}</span>
                                  <span>•</span>
                                  <span>{task.progress || 0}% complete</span>
                                </div>
                                <div className="mt-3 w-full bg-slate-800 rounded-full h-1.5">
                                  <div
                                    className="bg-rose-400 h-1.5 rounded-full"
                                    style={{ width: `${task.progress || 0}%` }}
                                  />
                                </div>
                              </div>
                              <span className="shrink-0 text-xs text-rose-300 font-medium pt-1">View</span>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
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

              <div className="flex flex-col gap-6 h-full">
                <div className={`${panelClass} flex-1 min-h-[220px] max-h-[70vh]`}>
                  <div className="px-4 py-5 sm:px-6 border-b border-slate-800">
                    <h3 className={sectionTitleClass}>My Projects</h3>
                  </div>

                    {dashboardData?.projects?.length > 0 ? (
                    <ul className={`divide-y divide-slate-800 overflow-y-auto`} style={{ maxHeight: 'calc(100% - 96px)' }}>
                      {dashboardData.projects.map((project) => (
                        <li key={project.id} className="px-4 py-4 hover:bg-slate-800/60 transition-colors">
                          <Link to={`/projects/${project.id}`}>
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium text-slate-100">{project.name}</p>
                              <ProjectStatusBadge status={project.status} />
                            </div>
                            <div className="mt-1 flex items-center text-xs text-slate-400">
                              <span>{project.task_count ?? 0} tasks</span>
                              <span className="mx-1">•</span>
                              <span>{project.completion_percentage ?? 0}% complete</span>
                            </div>
                            <div className="mt-3 w-full bg-slate-800 rounded-full h-1.5">
                              <div
                                className="bg-rose-400 h-1.5 rounded-full"
                                style={{ width: `${project.completion_percentage ?? 0}%` }}
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

                <div className={`${panelClass} flex-1 min-h-[220px] max-h-[70vh]`}>
                  <div className="px-4 py-5 sm:px-6 border-b border-slate-800">
                    <h3 className={sectionTitleClass}>Upcoming Deadlines</h3>
                  </div>
                  {dashboardData?.upcomingDeadlines?.length > 0 ? (
                    <ul className={`divide-y divide-slate-800 overflow-y-auto`} style={{ maxHeight: 'calc(100% - 96px)' }}>
                      {dashboardData.upcomingDeadlines.map((task) => (
                        <li key={task.id} className="px-4 py-3 hover:bg-slate-800/60 transition-colors">
                          <Link to={`/tasks/${task.id}`} className="block">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-slate-100 truncate">{task.title}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  Due {formatTaskDate(getTaskDeadline(task))} {task.project_name ? `• ${task.project_name}` : ''}
                                </p>
                              </div>
                              <TaskPriorityBadge priority={task.priority} />
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

                {(is('team_lead') || is('admin')) && (
                  <div className={`${panelClass} flex-1 min-h-[220px] max-h-[70vh]`}>
                    <div className={panelHeaderClass}>
                      <h3 className={sectionTitleClass}>Team Overview</h3>
                      <Link to="/admin/developer-progress" className="text-xs text-rose-300 hover:text-rose-200">
                        View Progress
                      </Link>
                    </div>
                    {teamUsers.length > 0 ? (
                      <ul className="divide-y divide-slate-800 overflow-y-auto" style={{ maxHeight: 'calc(100% - 96px)' }}>
                        {teamUsers.slice(0, 5).map((user) => (
                          <li key={user.id} className="px-4 py-3 flex items-center justify-between">
                            <div className="flex items-center">
                              <div className="h-8 w-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400 border border-slate-700">
                                {user.name?.charAt(0) || 'U'}
                              </div>
                              <div className="ml-3">
                                <p className="text-sm font-medium text-slate-200">{user.name}</p>
                                <p className="text-xs text-slate-500 capitalize">{user.role}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-xs text-slate-400">Active</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="p-6 text-center text-slate-400">
                        <p>No team members found</p>
                      </div>
                    )}
                  </div>
                )}
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
    blue:   'bg-sky-500/15 text-sky-300 border border-sky-400/20',
    green:  'bg-emerald-500/15 text-emerald-300 border border-emerald-400/20',
    yellow: 'bg-amber-500/15 text-amber-300 border border-amber-400/20',
    red:    'bg-rose-500/15 text-rose-300 border border-rose-400/20',
    purple: 'bg-purple-500/15 text-purple-300 border border-purple-400/20',
  };

  const selectedColor = color === 'primary' ? 'blue' : 
                       color === 'success' ? 'green' :
                       color === 'warning' ? 'yellow' :
                       color === 'error' ? 'red' : color;

  return (
    <div className={`rounded-2xl p-6 shadow-md backdrop-blur-sm ${colorClasses[selectedColor] || 'bg-slate-900/70 text-slate-400 border border-slate-800/70'}`}>
      <div className="flex items-center gap-5">
        <div className="p-3 rounded-xl bg-slate-950/40 border border-white/5">
          {icon}
        </div>
        <div>
          <p className="text-xs font-medium opacity-75 uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold mt-1 text-white">{value}</p>
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

export default BasicDashboard;