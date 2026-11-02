import React from 'react';
import { Link } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import StatCard from '../components/StatCard';
import {
  MyProjectsPanel,
  MyTasksPanel,
  TaskBreakdownPanel,
  RecentAuditLogsPanel,
  RecentReportsPanel,
} from '../components/AdminDashboardPanels';
import { useAuth } from '../context/AuthContext';
import { useAdminDashboardData } from '../hooks/useAdminDashboardData';

// ─── Admin Dashboard ───────────────────────────────────────────────────────────
const AdminDashboard = () => {
  const { currentUser } = useAuth();
  const { dashboardData, teamUsers, recentAuditLogs, loading, error, fetchDashboardData } = useAdminDashboardData();

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
              {currentUser?.role === 'team_lead' ? (
                <>
                  <StatCard
                    title="In Review Tasks"
                    value={dashboardData?.team_lead_kpis?.in_review_tasks ?? 0}
                    color="warning"
                    icon={
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    }
                  />

                  <StatCard
                    title="Due Soon"
                    value={dashboardData?.team_lead_kpis?.due_soon_tasks ?? 0}
                    color="secondary"
                    icon={
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    }
                  />

                  <StatCard
                    title="Overdue & Active"
                    value={dashboardData?.team_lead_kpis?.overdue_not_complete_tasks ?? 0}
                    color="error"
                    icon={
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    }
                  />

                  <StatCard
                    title="Active Projects"
                    value={dashboardData?.team_lead_kpis?.current_projects ?? 0}
                    color="success"
                    icon={
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                    }
                  />
                </>
              ) : (
                <>
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
                    title="Active Projects"
                    value={dashboardData?._activeProjectsCount ?? (dashboardData?.projects?.total ?? 0)}
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
                </>
              )}
            </div>

            {/* Main content: left 2/3 = My Projects + My Tasks, right 1/3 = stacked widgets */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start lg:min-h-[760px]">
              <div className="lg:col-span-2 flex flex-col gap-6 h-full">
                <MyProjectsPanel
                  myProjects={dashboardData?.myProjects}
                  recentProjects={dashboardData?.recentProjects}
                />
                <MyTasksPanel tasks={dashboardData?.my_assigned_tasks} />
              </div>

              <div className="flex flex-col gap-6">
                <TaskBreakdownPanel tasks={dashboardData?.tasks} />

                <RecentAuditLogsPanel logs={recentAuditLogs} />

                <RecentReportsPanel reports={dashboardData?.recentReports} />
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
