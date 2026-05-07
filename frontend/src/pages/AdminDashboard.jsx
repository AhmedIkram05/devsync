import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { dashboardService, projectService, userService } from '../services/utils/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../context/AuthContext';

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ title, value, change, icon, color, currentTimeRange }) => {
  const colorClasses = {
    primary:   'bg-sky-500/15 text-sky-300 border border-sky-400/20',
    secondary: 'bg-rose-500/15 text-rose-300 border border-rose-400/20',
    success:   'bg-emerald-500/15 text-emerald-300 border border-emerald-400/20',
    warning:   'bg-amber-500/15 text-amber-300 border border-amber-400/20',
    error:     'bg-rose-500/15 text-rose-300 border border-rose-400/20',
    purple:    'bg-purple-500/15 text-purple-300 border border-purple-400/20',
  };

  return (
    <div className={`rounded-2xl p-6 shadow-md backdrop-blur-sm ${colorClasses[color] || 'bg-slate-900/70 text-slate-400 border border-slate-800/70'}`}>
      <div className="flex items-center gap-5">
        <div className="p-3 rounded-xl bg-slate-950/40 border border-white/5 text-slate-100">
          {icon}
        </div>
        <div className="flex-1">
          <p className="text-xs font-medium opacity-75 uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold mt-1 text-white">{value}</p>
          {change !== undefined && (
            <div className="flex items-center mt-1.5 text-[10px] font-bold uppercase tracking-tight">
              {change > 0 ? (
                <span className="text-emerald-400 flex items-center">
                  <svg className="w-3 h-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                  {change}%
                </span>
              ) : change < 0 ? (
                <span className="text-rose-400 flex items-center">
                  <svg className="w-3 h-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                  {Math.abs(change)}%
                </span>
              ) : (
                <span className="text-slate-500">No change</span>
              )}
              <span className="ml-1.5 text-slate-500 opacity-60">vs last {currentTimeRange}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Status Badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const styles = {
    active:    'bg-emerald-500/15 text-emerald-300 border border-emerald-400/20',
    completed: 'bg-sky-500/15     text-sky-300     border border-sky-400/20',
    'on-hold': 'bg-amber-500/15   text-amber-300   border border-amber-400/20',
    on_hold:   'bg-amber-500/15   text-amber-300   border border-amber-400/20',
    cancelled: 'bg-rose-500/15    text-rose-300    border border-rose-400/20',
  }[status] ?? 'bg-slate-800 text-slate-300 border border-slate-700';

  const label = (status || 'unknown')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  return (
    <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${styles}`}>
      {label}
    </span>
  );
};

// ─── Panel wrapper ─────────────────────────────────────────────────────────────
const Panel = ({ children, className = '' }) => (
  <div className={`bg-slate-900/70 border border-slate-800/70 rounded-2xl overflow-hidden shadow-md backdrop-blur-sm ${className}`}>
    {children}
  </div>
);

const PanelHeader = ({ title, linkTo, linkLabel }) => (
  <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
    <h3 className="text-base font-semibold text-slate-100">{title}</h3>
    {linkTo && (
      <Link to={linkTo} className="text-sm text-rose-300 hover:text-rose-200 transition-colors">
        {linkLabel ?? 'View all'}
      </Link>
    )}
  </div>
);

// ─── Admin Dashboard ───────────────────────────────────────────────────────────
const AdminDashboard = () => {
  const { currentUser } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [teamUsers, setTeamUsers]         = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [timeRange, setTimeRange]         = useState('week');

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await dashboardService.getAdminDashboardStats(timeRange);
      setDashboardData(data);
      
      // Fetch team users for the overview
      try {
        const users = await userService.getAllUsers();
        setTeamUsers(users || []);
      } catch (userErr) {
        console.error('Failed to fetch team users:', userErr);
      }
      
      setError(null);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => { fetchDashboardData(); }, [fetchDashboardData]);

  // Fallback: derive recentProjects from projectService if API omits them
  useEffect(() => {
    if (!dashboardData) return;
    const hasRecent = Array.isArray(dashboardData.recentProjects) && dashboardData.recentProjects.length > 0;
    if (hasRecent || !dashboardData.projects?.total) return;

    (async () => {
      try {
        const all = await projectService.getAllProjects();
        const recent = Array.isArray(all)
          ? all
              .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))
              .slice(0, 5)
              .map(p => ({
                id:         p.id,
                name:       p.name,
                status:     p.status,
                created_at: p.created_at,
                task_count: p.task_count ?? p.tasks?.length ?? 0,
              }))
          : [];
        setDashboardData(prev => ({ ...prev, recentProjects: recent }));
      } catch (e) {
        console.error('Fallback recent projects failed:', e);
      }
    })();
  }, [dashboardData]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-['Space_Grotesk']">
      <div className="max-w-6xl mx-auto px-6 py-10 md:px-10">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">
              {currentUser?.role === 'team_lead' ? 'Management Dashboard' : 'Admin Dashboard'}
            </h1>
            <p className="mt-1 text-sm text-slate-400">Overview of projects, tasks, and team progress</p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={timeRange}
              onChange={e => setTimeRange(e.target.value)}
              className="rounded-lg px-3 py-2 text-sm bg-slate-900 border border-slate-700 text-slate-200
                         focus:outline-none focus:ring-2 focus:ring-rose-400/60 focus:border-rose-400
                         hover:border-slate-600 transition-colors"
            >
              <option value="week">Last 7 days</option>
              <option value="month">Last 30 days</option>
              <option value="quarter">Last 90 days</option>
            </select>

            <button
              onClick={fetchDashboardData}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium
                         text-white bg-rose-500/90 hover:bg-rose-400 transition-colors
                         focus:outline-none focus:ring-2 focus:ring-rose-400/60"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0
                     0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {/* ── Loading ── */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <LoadingSpinner size="lg" />
          </div>

        /* ── Error ── */
        ) : error ? (
          <div className="bg-rose-500/10 p-4 rounded-xl border border-rose-400/40 text-rose-200">
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 text-rose-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>{error}</p>
            </div>
            <button
              onClick={fetchDashboardData}
              className="mt-3 text-sm font-medium text-rose-300 hover:text-rose-200 transition-colors"
            >
              Try again
            </button>
          </div>

        /* ── Content ── */
        ) : (
          <div className="space-y-6">

            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Total Projects"
                value={dashboardData?.projects?.total || 0}
                change={dashboardData?.projects?.change}
                color="primary"
                currentTimeRange={timeRange}
                icon={
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                }
              />
              <StatCard
                title="Active Tasks"
                value={dashboardData?.tasks?.active || 0}
                change={dashboardData?.tasks?.activeChange}
                color="secondary"
                currentTimeRange={timeRange}
                icon={
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0
                         01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                }
              />
              <StatCard
                title="Completed Tasks"
                value={dashboardData?.tasks?.done || 0}
                change={dashboardData?.tasks?.completedChange}
                color="success"
                currentTimeRange={timeRange}
                icon={
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0
                         00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                }
              />
              <StatCard
                title="Team Members"
                value={dashboardData?.users?.total || 0}
                change={dashboardData?.users?.change}
                color="warning"
                currentTimeRange={timeRange}
                icon={
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6
                         6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                }
              />
            </div>

            {/* Recent Projects + placeholder columns for future widgets */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Recent Projects */}
              <Panel>
                <PanelHeader title="Recent Projects" linkTo="/admin/projects" />
                {dashboardData?.recentProjects?.length > 0 ? (
                  <ul className="divide-y divide-slate-800">
                    {dashboardData.recentProjects.map(project => (
                      <li key={project.id}>
                        <Link
                          to={`/projects/${project.id}`}
                          className="block px-5 py-4 hover:bg-slate-800/50 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <p className="text-sm font-medium text-slate-100 truncate">{project.name}</p>
                            <StatusBadge status={project.status} />
                          </div>
                          <div className="flex items-center gap-4 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0
                                  002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0
                                  00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                              </svg>
                              {new Date(project.created_at).toLocaleDateString()}
                            </span>
                            <span className="flex items-center gap-1">
                              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000
                                  2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0
                                  0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0
                                  102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                              {project.task_count} tasks
                            </span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="px-5 py-10 text-center text-slate-500 text-sm">
                    No recent projects found.
                  </div>
                )}
              </Panel>

              {/* Task Status Breakdown */}
              <Panel>
                <PanelHeader title="Task Breakdown" />
                <div className="p-5 space-y-4">
                  {(() => {
                    const backlog = dashboardData?.tasks?.backlog || 0;
                    const todo = dashboardData?.tasks?.todo || 0;
                    const inProgress = dashboardData?.tasks?.in_progress ?? dashboardData?.tasks?.active ?? 0;
                    const inReview = dashboardData?.tasks?.review ?? dashboardData?.tasks?.inReview ?? 0;
                    const done = dashboardData?.tasks?.done || 0;
                    const total = backlog + todo + inProgress + inReview + done;

                    return [
                      { label: 'Backlog', value: backlog, color: 'bg-orange-500' },
                      { label: 'To Do', value: todo, color: 'bg-slate-500' },
                      { label: 'In Progress', value: inProgress, color: 'bg-sky-500' },
                      { label: 'In Review', value: inReview, color: 'bg-amber-500' },
                      { label: 'Done', value: done, color: 'bg-emerald-500' },
                    ].map(({ label, value, color }) => {
                      const pct = total > 0 ? Math.round((value / total) * 100) : 0;

                      return (
                        <div key={label}>
                          <div className="flex justify-between text-sm mb-1.5">
                            <span className="text-slate-300">{label}</span>
                            <span className="text-slate-400">{value} <span className="text-slate-600">({pct}%)</span></span>
                          </div>
                          <div className="w-full bg-slate-800 rounded-full h-1.5">
                            <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </Panel>

              {/* Admin Functions */}
              <Panel>
                <PanelHeader title="Admin Quick Actions" />
                <div className="p-5 space-y-2">
                  {[
                    { label: 'Create New Task', to: '/admin/create-task', show: true },
                    { label: 'Manage Projects', to: '/admin/projects',    show: true },
                    { label: 'Manage Users',    to: '/admin/users',       show: true },
                    { label: 'All Tasks',       to: '/tasks',             show: true },
                    { label: 'Audit Logs',      to: '/admin/audit-logs',  show: currentUser?.role === 'admin' },
                    { label: 'System Settings', to: '/admin/settings',    show: currentUser?.role === 'admin' },
                  ].filter(action => action.show).map(({ label, to, icon }) => (
                    <Link
                      key={to}
                      to={to}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-slate-300
                                 hover:bg-slate-800/70 hover:text-slate-100 transition-colors"
                    >
                      <span>{icon}</span>
                      {label}
                      <svg className="h-4 w-4 ml-auto text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  ))}
                </div>
              </Panel>

            </div>

            {/* Team Overview Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Panel>
                <PanelHeader 
                  title="Team Overview" 
                  linkTo={currentUser?.role === 'admin' ? "/admin/users" : undefined} 
                  linkLabel={currentUser?.role === 'admin' ? "Manage Users" : undefined} 
                />
                {teamUsers.length > 0 ? (
                  <ul className="divide-y divide-slate-800">
                    {teamUsers.slice(0, 5).map((user) => (
                      <li key={user.id} className="px-5 py-4 flex items-center justify-between">
                        <div className="flex items-center">
                          <div className="h-9 w-9 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-400 border border-slate-700">
                            {user.name?.charAt(0) || 'U'}
                          </div>
                          <div className="ml-4">
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
                  <div className="px-5 py-10 text-center text-slate-500 text-sm">
                    No team members found.
                  </div>
                )}
              </Panel>

              {/* Reports/Stats Placeholder */}
              {currentUser?.role === 'admin' && (
                <Panel>
                  <PanelHeader title="Recent Activity" linkTo="/admin/audit-logs" />
                  <div className="px-5 py-10 text-center text-slate-500 text-sm italic">
                    Additional system metrics and audit highlights will appear here.
                  </div>
                </Panel>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;