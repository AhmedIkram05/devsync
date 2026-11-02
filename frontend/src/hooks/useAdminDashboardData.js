import { useState, useEffect, useCallback, useRef } from 'react';
import { dashboardService, projectService, userService, auditLogService, taskService, reportService } from '../services/utils/api';
import { useAuth } from '../context/AuthContext';

// Data fetching + derived KPIs for the admin/team-lead dashboard. Extracted
// from AdminDashboard.jsx so the page only composes presentation. Effect
// ordering and dependencies are unchanged (tests assert fetch call counts).
export const useAdminDashboardData = () => {
  const { currentUser } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [teamUsers, setTeamUsers]         = useState([]);
  const [recentAuditLogs, setRecentAuditLogs] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);

  // Keep the rendered dashboard in place on background re-fetches (task-updated
  // events, auth churn) — only the first load shows the full-page spinner.
  const hasLoadedRef = useRef(false);

  const fetchDashboardData = useCallback(async (range = 'week') => {
    try {
      if (!hasLoadedRef.current) {
        setLoading(true);
      }

      // Base dashboard stats
      const data = await dashboardService.getAdminDashboardStats(range);
      setDashboardData(data);
      hasLoadedRef.current = true;

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

      // For Admins: compute project scoping for additional KPIs
      if (currentUser?.role === 'admin') {
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

          // KPI: total active projects (all projects with status active)
          const activeProjectsCount = projects.filter(p => ['active'].includes(String(p.status))).length;

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

          setDashboardData(prev => ({
            ...prev,
            _allProjects: projects,
            myProjects,
            _activeProjectsCount: activeProjectsCount,
            _overdueTasksCount: overdueTasksCount,
            _tasksInReviewCount: tasksInReviewCount || data?.tasks?.review || data?.tasks?.inReview || data?.tasks?.in_review || 0,
            recentReports: (reportsResp?.reports) ? reportsResp.reports : (reportsResp?.data ?? [])
          }));
        } catch (e) {
          console.error('Failed to fetch projects/tasks/reports for admin dashboard:', e);
        }
      } else if (currentUser?.role === 'team_lead') {
        // For Team Leads: fetch reports, but use backend-provided my_assigned_tasks and team_lead_kpis
        try {
          const reportsResp = await reportService.getSavedReports({ per_page: 5 });
          setDashboardData(prev => ({
            ...prev,
            recentReports: (reportsResp?.reports) ? reportsResp.reports : (reportsResp?.data ?? [])
          }));
        } catch (e) {
          console.error('Failed to fetch reports for TL dashboard:', e);
        }
      }

      setError(null);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
    // Primitive deps: AuthContext emits a new user object on each auth event,
    // which would otherwise re-create this callback and re-run the effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.role, currentUser?.id]);

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

  return { dashboardData, teamUsers, recentAuditLogs, loading, error, fetchDashboardData };
};
