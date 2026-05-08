import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { dashboardService, projectService, userService, auditLogService, taskService, reportService } from '../services/utils/api';
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

// Shared panel styles to keep Basic/Admin dashboards consistent
const panelClass = "bg-slate-900/70 border border-slate-800/70 rounded-2xl overflow-hidden shadow-md backdrop-blur-sm";
const panelHeaderClass = "px-5 py-4 border-b border-slate-800 flex items-center justify-between";
const sectionTitleClass = "text-lg font-semibold text-slate-100";

// ─── Admin Dashboard ───────────────────────────────────────────────────────────
const AdminDashboard = () => {
  const { currentUser } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [teamUsers, setTeamUsers]         = useState([]);
  const [recentAuditLogs, setRecentAuditLogs] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);

  const fetchDashboardData = useCallback(async (range = 'week') => {
    try {
      setLoading(true);

      // Base dashboard stats
      const data = await dashboardService.getAdminDashboardStats(range);
      setDashboardData(data);

      // Team users
      try {
        const users = await userService.getAllUsers();
        setTeamUsers(users || []);
      } catch (userErr) {
        console.error('Failed to fetch team users:', userErr);
        setTeamUsers([]);
      }

      // Recent audit logs (admin-only)
      try {
        if (currentUser?.role === 'admin') {
          const auditResponse = await auditLogService.getLogs({ per_page: 5, page: 1 });
          setRecentAuditLogs(auditResponse?.logs || []);
        } else {
          setRecentAuditLogs([]);
        }
      } catch (auditErr) {
        console.error('Failed to fetch audit logs:', auditErr);
        setRecentAuditLogs([]);
      }

      // Fetch projects and tasks for KPI calculations and scoping
      try {
        const [allProjects, allTasks, reportsResp] = await Promise.all([
          projectService.getAllProjects(),
          taskService.getAllTasks(),
          reportService.getSavedReports({ per_page: 5 })
        ]);

        const projects = Array.isArray(allProjects) ? allProjects : [];
        const tasks = Array.isArray(allTasks) ? allTasks : [];

        // Compute admin-scoped projects (projects the admin is assigned to)
        const adminProjectIds = new Set();
        projects.forEach((p) => {
          const members = Array.isArray(p.team_members) ? p.team_members : [];
          const isAssigned = members.some((m) => {
            if (m == null) return false;
            if (typeof m === 'number' || typeof m === 'string') return Number(m) === Number(currentUser?.id);
            const mid = m.id ?? m.user_id ?? m.userId ?? m.member_id ?? null;
            if (mid != null) return Number(mid) === Number(currentUser?.id);
            return false;
          }) || Number(p?.created_by) === Number(currentUser?.id);
          if (isAssigned) adminProjectIds.add(Number(p.id));
        });

        // My projects: projects admin is assigned to
        const myProjects = projects.filter(p => adminProjectIds.has(Number(p.id)));

        // KPI: total incomplete projects (all projects with status active or on-hold)
        const incompleteProjectsCount = projects.filter(p => ['active', 'on-hold', 'on_hold'].includes(String(p.status))).length;

        // KPI: overdue tasks scoped to admin's projects only
        const now = new Date();
        const overdueTasksCount = tasks.filter((t) => {
          const pid = t.project_id ?? t.projectId ?? (t.project && (t.project.id ?? t.project.project_id)) ?? null;
          if (pid === null) return false;
          if (!adminProjectIds.has(Number(pid))) return false;
          const status = (t.status || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
          if (['review', 'in_review', 'in-review', 'done', 'completed'].includes(status)) return false;
          const deadlineVal = t.deadline ?? t.due_date ?? t.dueDate ?? t.due_at ?? t.dueAt ?? t.due ?? null;
          if (!deadlineVal) return false;
          try {
            const d = new Date(deadlineVal);
            if (Number.isNaN(d.getTime())) {
              // try parsing as seconds since epoch
              const maybeNum = Number(deadlineVal);
              if (!Number.isNaN(maybeNum)) return new Date(maybeNum * (maybeNum > 1e12 ? 1 : 1000)) < now;
              return false;
            }
            return d < now;
          } catch (e) {
            return false;
          }
        }).length;

        // KPI: tasks in review scoped to admin's projects
        const tasksInReviewCount = tasks.filter((t) => {
          const pid = t.project_id ?? t.projectId ?? (t.project && t.project.id) ?? null;
          if (pid === null) return false;
          if (!adminProjectIds.has(Number(pid))) return false;
          const statusNorm = (t.status || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
          return ['review', 'in_review', 'inreview', 'in_review'].includes(statusNorm);
        }).length;

        // My assigned tasks for "My Tasks"
        const myAssignedTasks = tasks
          .filter((t) => {
            let aid = t.assigned_to ?? t.assignedTo ?? t.assignee ?? null;
            if (aid && typeof aid === 'object') aid = aid.id ?? aid.user_id ?? aid.userId ?? null;
            return aid !== null && Number(aid) === Number(currentUser?.id);
          })
          .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));

        setDashboardData(prev => ({
          ...prev,
          _allProjects: projects,
          myProjects,
          _incompleteProjectsCount: incompleteProjectsCount,
            _overdueTasksCount: overdueTasksCount,
            _tasksInReviewCount: tasksInReviewCount || data?.tasks?.review || data?.tasks?.inReview || data?.tasks?.in_review || 0,
          _myAssignedTasks: myAssignedTasks,
          recentReports: (reportsResp?.reports) ? reportsResp.reports : (reportsResp?.data ?? [])
        }));
      } catch (e) {
        console.error('Failed to fetch projects/tasks/reports for dashboard:', e);
      }

      setError(null);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => { fetchDashboardData(); }, [fetchDashboardData]);

  // Listen for global task-updated events and refresh dashboard KPIs live
  useEffect(() => {
    const handler = () => {
      try {
        fetchDashboardData();
      } catch (e) {
        console.warn('Failed to refresh dashboard on task update', e);
      }
    };

    window.addEventListener('devsync:task-updated', handler);
    window.addEventListener('devsync:dashboard-updated', handler);
    return () => {
      window.removeEventListener('devsync:task-updated', handler);
      window.removeEventListener('devsync:dashboard-updated', handler);
    };
  }, [fetchDashboardData]);

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
            <Link
              to="/admin/create-task"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium
                         text-white bg-slate-800/60 hover:bg-slate-800/40 transition-colors
                         focus:outline-none focus:ring-2 focus:ring-slate-500/60"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v12m6-6H6" />
              </svg>
              Create Task
            </Link>
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

            {/* Admin Snapshot (similar to Team Lead snapshot) */}
            {currentUser?.role === 'admin' && (
              <div className="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-5 shadow-md backdrop-blur-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-300">Management Snapshot</p>
                    <h2 className="mt-1 text-lg font-semibold text-slate-100">Keep the team moving without leaving this dashboard</h2>
                    <p className="mt-1 text-sm text-slate-400">Admin users can review progress, access audit logs, and manage users from the same workspace.</p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Link to="/admin/audit-logs" className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/40 px-4 py-2 text-sm font-medium text-slate-100 hover:border-slate-600 hover:bg-slate-800/60">
                      Audit logs
                    </Link>
                    <Link to="/admin/users" className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/40 px-4 py-2 text-sm font-medium text-slate-100 hover:border-slate-600 hover:bg-slate-800/60">
                      Manage users
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Team Members"
                value={dashboardData?.users?.total ?? teamUsers.length ?? 0}
                color="primary"
                icon={
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6
                         6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                }
              />

              <StatCard
                title="Incomplete Projects"
                value={dashboardData?._incompleteProjectsCount ?? (dashboardData?.projects?.total ?? 0)}
                color="secondary"
                icon={
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                }
              />

              <StatCard
                title="Overdue Tasks"
                value={dashboardData?.tasks?.overdue ?? dashboardData?._overdueTasksCount ?? 0}
                color="error"
                icon={
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />

              <StatCard
                title="Tasks In Review"
                value={dashboardData?._tasksInReviewCount ?? 0}
                color="warning"
                icon={
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />
            </div>

            {/* Main content: left 2/3 = My Projects + My Tasks, right 1/3 = stacked widgets */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start lg:min-h-[760px]">
              <div className="lg:col-span-2 flex flex-col gap-6 h-full">

                {/* My Projects moved to top of left column */}
                <div className={`${panelClass} flex flex-col h-[300px] lg:h-[300px]`}> 
                  <div className={panelHeaderClass}>
                    <div>
                      <h3 className={sectionTitleClass}>My Projects</h3>
                      <p className="mt-1 text-xs text-slate-500">Projects you are assigned to</p>
                    </div>
                    <Link to="/admin/projects" className="text-sm text-rose-300 hover:text-rose-200 font-medium">View all</Link>
                  </div>
                  {((dashboardData?.myProjects?.length > 0) || (dashboardData?.recentProjects?.length > 0)) ? (
                    <ul className={`flex-1 divide-y divide-slate-800 overflow-y-auto min-h-0`}>
                      {(dashboardData.myProjects?.length > 0 ? dashboardData.myProjects : dashboardData.recentProjects).map(project => (
                        <li key={project.id} className="px-4 py-4 hover:bg-slate-800/60 transition-colors">
                          <Link to={`/projects/${project.id}`}>
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium text-slate-100">{project.name}</p>
                              <StatusBadge status={project.status} />
                            </div>
                            <div className="mt-1 flex items-center text-xs text-slate-400">
                              <span>{project.task_count ?? 0} tasks</span>
                              <span className="mx-1">•</span>
                              <span>{project.completion_percentage ?? 0}% complete</span>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="p-6 text-center text-slate-400">You are not assigned to any projects yet</div>
                  )}
                </div>

                <div className={`${panelClass} flex flex-col h-[500px] lg:h-[500px]`}> 
                  <div className={panelHeaderClass}>
                    <div>
                      <h3 className={sectionTitleClass}>My Tasks</h3>
                      <p className="mt-1 text-xs text-slate-500">Your latest assigned work, with the same fields you see on the tasks page.</p>
                    </div>
                    <Link to="/tasks" className="text-sm text-rose-300 hover:text-rose-200 font-medium">View all tasks</Link>
                  </div>

                  { (dashboardData?._myAssignedTasks && dashboardData._myAssignedTasks.length > 0) ? (
                    <ul className={`flex-1 divide-y divide-slate-800 overflow-y-auto min-h-0`}>
                      {dashboardData._myAssignedTasks.map((task) => (
                        <li key={task.id} className="px-5 py-4 hover:bg-slate-800/60 transition-colors">
                          <Link to={`/tasks/${task.id}`} className="block">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-semibold text-slate-100 truncate">{task.title}</p>
                                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${/* reuse StatusBadge colors via classes directly */ ''}`}> {String(task.status || '').replace(/[_-]/g,' ')}</span>
                                </div>
                                <p className="mt-1 text-sm text-slate-400 line-clamp-2">{task.description || 'No description provided'}</p>
                                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                  <span>{task.project_name || task.project?.name || 'No project'}</span>
                                  <span>•</span>
                                  <span>Due {(task.deadline ?? task.due_date ?? task.dueDate) ? new Date(task.deadline ?? task.due_date ?? task.dueDate).toLocaleDateString() : '—'}</span>
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

              <div className="flex flex-col gap-6">
                {/* Task Breakdown */}
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

                {/* removed right-column My Projects panel per layout changes */}

                {/* Recent Audit Logs */}
                <Panel>
                  <PanelHeader title="Recent Audit Logs" linkTo="/admin/audit-logs" />
                  {recentAuditLogs.length > 0 ? (
                    <ul className="divide-y divide-slate-800 overflow-y-auto" style={{ maxHeight: '220px' }}>
                      {recentAuditLogs.slice(0,5).map(log => (
                        <li key={log.id} className="px-5 py-3 hover:bg-slate-800/50 transition-colors">
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 pt-0.5">
                              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-slate-800">
                                <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-100 truncate">{log.action}</p>
                              <p className="text-xs text-slate-400 mt-0.5">{log.resource_type}{log.resource_id ? ` #${log.resource_id}` : ''}</p>
                              <p className="text-xs text-slate-500 mt-1">{new Date(log.created_at).toLocaleDateString()} {new Date(log.created_at).toLocaleTimeString()}</p>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="px-5 py-10 text-center text-slate-500 text-sm">No recent audit logs found.</div>
                  )}
                </Panel>

                {/* Recent Created Reports */}
                <Panel>
                  <PanelHeader title="Recent Created Reports" linkTo="/admin/reports" />
                  {dashboardData?.recentReports?.length > 0 ? (
                    <ul className="divide-y divide-slate-800 overflow-y-auto" style={{ maxHeight: '220px' }}>
                      {dashboardData.recentReports.map((r) => {
                        const typeKey = r.report_type || r.type || r.reportType || 'report';
                        const typeLabel = {
                          tasks: 'Task Report',
                          github: 'GitHub Activity',
                          developers: 'Developer Performance'
                        }[typeKey] || String(typeKey).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                        const createdAt = r.created_at || r.generatedAt || r.createdAt || r.created || null;

                        return (
                          <li key={r.id || r.report_id} className="px-5 py-3 hover:bg-slate-800/50 transition-colors">
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-100 truncate">{typeLabel}</p>
                                <p className="text-xs text-slate-400 mt-0.5">{createdAt ? new Date(createdAt).toLocaleString() : ''}</p>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="px-5 py-10 text-center text-slate-500 text-sm">No reports found.</div>
                  )}
                </Panel>
              </div>

            </div>

            {/* Team overview and recent activity removed per request */}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;