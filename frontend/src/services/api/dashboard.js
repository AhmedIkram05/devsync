import { fetchWithAuth } from './client';
import { taskService } from './tasks';
import { projectService } from './projects';

const getDateRangeStart = (dateRange) => {
  const now = new Date();

  switch (dateRange) {
    case 'month':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case 'quarter':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case 'year':
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    case 'week':
    default:
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
};

const getActivityWindowDays = (dateRange) => {
  switch (dateRange) {
    case 'month':
      return 30;
    case 'quarter':
      return 90;
    case 'year':
      return 365;
    case 'week':
    default:
      return 7;
  }
};

const isWithinDateRange = (isoDate, rangeStart) => {
  if (!isoDate) {
    return true;
  }

  const parsedDate = new Date(isoDate);
  if (Number.isNaN(parsedDate.getTime())) {
    return true;
  }

  return parsedDate >= rangeStart;
};

const toSafeMetricValue = (value, fallback = 0) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

// List endpoints cap at 100 rows per page. Aggregates (report totals, developer
// stats) must see every row, so page through to the last page instead of
// silently counting only the first 100.
const PAGE_SIZE = 100;

const fetchAllTaskPages = async () => {
  const first = await taskService.getTasksPaginated({ page: 1, per_page: PAGE_SIZE });
  const items = [...first.items];
  const pages = first.pagination?.pages || 1;

  if (pages > 1) {
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, index) =>
        taskService.getTasksPaginated({ page: index + 2, per_page: PAGE_SIZE })
      )
    );
    rest.forEach((page) => items.push(...page.items));
  }

  return items;
};

const fetchAllUsers = async () => {
  const first = await fetchWithAuth('users?page=1&per_page=' + PAGE_SIZE);
  const users = Array.isArray(first?.users) ? [...first.users] : [];
  const pages = first?.pagination?.pages || 1;

  if (pages > 1) {
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, index) =>
        fetchWithAuth(`users?page=${index + 2}&per_page=${PAGE_SIZE}`)
      )
    );
    rest.forEach((page) => {
      if (Array.isArray(page?.users)) users.push(...page.users);
    });
  }

  return { users };
};

const normalizeGithubRepository = (repository = {}) => {
  const openIssues = toSafeMetricValue(
    repository.open_issues ?? repository.open_issues_count,
    0
  );
  const totalPrs = toSafeMetricValue(repository.total_prs, 0);
  const recentCommits = toSafeMetricValue(repository.recent_commits, 0);

  return {
    ...repository,
    open_issues: openIssues,
    open_issues_count: toSafeMetricValue(repository.open_issues_count, openIssues),
    total_prs: totalPrs,
    recent_commits: recentCommits,
    last_updated: repository.last_updated || repository.pushed_at || repository.updated_at || null,
  };
};

const normalizeTaskStatus = (status) => {
  if (status === 'completed') {
    return 'done';
  }

  return status;
};

const normalizeAdminDashboardTasks = (tasks = {}) => {
  const backlog = toSafeMetricValue(tasks.backlog, 0);
  const todo = toSafeMetricValue(tasks.todo, 0);
  const inProgress = toSafeMetricValue(tasks.in_progress, 0);
  const review = toSafeMetricValue(tasks.review, 0);
  const done = toSafeMetricValue(tasks.done, 0);

  return {
    ...tasks,
    total: toSafeMetricValue(tasks.total, backlog + todo + inProgress + review + done),
    active: todo + inProgress + review,
    completed: done,
    backlog,
    todo,
    in_progress: inProgress,
    review,
    done,
  };
};

const buildDeveloperProgress = (users, tasks) => {
  const progressTrackingRoles = new Set(['admin', 'developer', 'team_lead']);
  const tasksByAssignee = new Map();

  const getAssigneeId = (task) => {
    if (!task) return null;
    if (task.assigned_to !== undefined && task.assigned_to !== null) return task.assigned_to;
    if (task.assignedTo !== undefined && task.assignedTo !== null) return task.assignedTo;
    if (task.assignee !== undefined && task.assignee !== null) return task.assignee;
    return null;
  };

  tasks.forEach((task) => {
    const assignee = getAssigneeId(task);
    if (assignee === null || assignee === undefined) return;
    const assigneeKey = String(assignee);
    if (!tasksByAssignee.has(assigneeKey)) tasksByAssignee.set(assigneeKey, []);
    tasksByAssignee.get(assigneeKey).push(task);
  });

  return users
    .filter((user) => progressTrackingRoles.has(user.role))
    .map((user) => {
      const userTasks = tasksByAssignee.get(String(user.id)) || [];

      let completedCount = 0;

      userTasks.forEach((task) => {
        if (normalizeTaskStatus(task.status) === 'done') {
          completedCount += 1;
        }
      });

      const sortedRecent = [...userTasks]
        .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))
        .slice(0, 5);

      return {
        id: user.id,
        name: user.name,
        role: user.role,
        total_tasks: userTasks.length,
        completed_tasks: completedCount,
        active_tasks: userTasks.length - completedCount,
        recent_tasks: sortedRecent
      };
    });
};

const GITHUB_REPORT_CACHE_TTL_MS = 2 * 60 * 1000;
const reportDataCache = new Map();

const getReportCacheScope = () => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    return user?.id ? `user:${user.id}` : 'anonymous';
  } catch {
    return 'anonymous';
  }
};

const getReportCacheKey = (reportType, dateRange) => `${getReportCacheScope()}:${reportType}:${dateRange}`;

const normalizeTaskReportDetails = (tasks = [], users = []) => {
  const usersById = new Map(
    (Array.isArray(users) ? users : []).map((user) => [Number(user?.id), user?.name])
  );

  return (Array.isArray(tasks) ? tasks : []).map((task) => {
    const assigneeId = task?.assigned_to ?? task?.assignedTo ?? null;
    const explicitAssigneeName = typeof task?.assignee === 'object'
      ? task?.assignee?.name
      : null;

    return {
      ...task,
      assignee_name:
        task?.assignee_name
        || task?.assigneeName
        || explicitAssigneeName
        || usersById.get(Number(assigneeId))
        || null,
    };
  });
};

const addReportMeta = (reportData, meta = {}) => ({
  ...reportData,
  meta: {
    ...(reportData?.meta || {}),
    ...meta,
  },
});

const getFreshCachedReport = (cacheKey) => {
  const cached = reportDataCache.get(cacheKey);
  if (!cached?.data || !cached.fetchedAt) {
    return null;
  }

  if (Date.now() - cached.fetchedAt > GITHUB_REPORT_CACHE_TTL_MS) {
    return null;
  }

  return addReportMeta(cached.data, { cache_hit: true });
};

const fetchGithubRepositoriesForReport = async (activityWindowDays) => {
  try {
    const params = new URLSearchParams();
    params.set('per_page', '100');
    params.set('all_pages', 'true');
    params.set('activity_window_days', String(activityWindowDays));
    params.set('include_activity', 'true');

    const response = await fetchWithAuth(`github/repositories?${params.toString()}`, {
      timeout: 120000,
    });

    if (response?.error) {
      return [];
    }

    const repositories = response?.repositories || response || [];
    return Array.isArray(repositories)
      ? repositories.map((repository) => normalizeGithubRepository(repository))
      : [];
  } catch (error) {
    console.error('Failed to get GitHub repositories for report:', error);
    return [];
  }
};

const getGithubReposForReport = async (activityWindowDays) => {
  // Prefer the canonical githubService so existing spies/mocks keep working;
  // lazy require avoids a top-level utils/api <-> dashboard import cycle.
  try {
    // eslint-disable-next-line global-require
    const utilsApi = require('../utils/api');
    if (utilsApi?.githubService?.getUserRepos) {
      return await utilsApi.githubService.getUserRepos({
        perPage: 100,
        fetchAll: true,
        activityWindowDays,
      });
    }
  } catch {
    // fall through to inline fetch below
  }
  return fetchGithubRepositoriesForReport(activityWindowDays);
};

const getReportDataFromNetwork = async (reportType = 'tasks', dateRange = 'week') => {
  if (reportType === 'github') {
    const githubStatus = await fetchWithAuth('github/status').catch(() => ({ connected: false }));
    const connected = Boolean(githubStatus?.connected);
    const activityWindowDays = getActivityWindowDays(dateRange);
    const repositories = connected
      ? await getGithubReposForReport(activityWindowDays)
      : [];

    const openIssuesTotal = repositories.reduce((sum, repo) => sum + (repo.open_issues || 0), 0);
    const totalPrsTotal = repositories.reduce((sum, repo) => sum + (repo.total_prs || 0), 0);
    const recentCommitsTotal = repositories.reduce((sum, repo) => sum + (repo.recent_commits || 0), 0);

    return {
      summary: {
        repos: repositories.length,
        open_issues: openIssuesTotal,
        total_prs: totalPrsTotal,
        recent_commits: recentCommitsTotal
      },
      details: repositories
    };
  }

  const rangeStart = getDateRangeStart(dateRange);
  const [tasks, usersResponse] = await Promise.all([
    fetchAllTaskPages(),
    fetchAllUsers().catch(() => ({ users: [] }))
  ]);

  const users = Array.isArray(usersResponse?.users) ? usersResponse.users : [];
  const scopedTasks = tasks.filter((task) => isWithinDateRange(task.created_at, rangeStart));

  if (reportType === 'developers') {
    const developers = buildDeveloperProgress(users, tasks);
    const totalTasks = developers.reduce((sum, developer) => sum + (developer.total_tasks || 0), 0);
    const completedTasks = developers.reduce((sum, developer) => sum + (developer.completed_tasks || 0), 0);
    const avgCompletion = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      summary: {
        developers: developers.length,
        avg_tasks: developers.length > 0 ? Math.round(totalTasks / developers.length) : 0,
        avg_completion: avgCompletion,
        active_devs: developers.filter((developer) => developer.active_tasks > 0).length
      },
      details: developers
    };
  }

  const completed = scopedTasks.filter((task) => normalizeTaskStatus(task.status) === 'done').length;
  const inProgress = scopedTasks.filter((task) => normalizeTaskStatus(task.status) === 'in_progress').length;
  const overdue = scopedTasks.filter((task) => {
    if (!task.deadline) {
      return false;
    }

    return new Date(task.deadline) < new Date() && normalizeTaskStatus(task.status) !== 'done';
  }).length;

  return {
    summary: {
      total: scopedTasks.length,
      completed,
      in_progress: inProgress,
      overdue,
      team_members: users.length
    },
    details: normalizeTaskReportDetails(scopedTasks, users)
  };
};

// Dashboard service for admin and member dashboards
const dashboardService = {
  getAdminDashboardStats: async (timeRange = 'week') => {
    try {
      const response = await fetchWithAuth(`dashboard/admin?timeRange=${timeRange}`);

      return {
        ...response,
        tasks: normalizeAdminDashboardTasks(response?.tasks),
      };
    } catch (error) {
      console.error("Dashboard fetch error:", error);
      // Return fallback data structure
      return {
        projects: { total: 0 },
        tasks: { active: 0, completed: 0 },
        users: { total: 0 },
        recentProjects: []
      };
    }
  },

  getBasicDashboardStats: async () => {
    try {
      return await fetchWithAuth('dashboard/client');
    } catch (error) {
      console.error("Dashboard fetch error:", error);
      // Return fallback data structure
      return {
        taskCounts: { assigned: 0, inProgress: 0, completed: 0, dueSoon: 0 },
        tasks: { assigned: 0, inProgress: 0, completed: 0, dueSoon: 0 },
        recentTasks: [],
        githubActivity: [],
        projects: [],
        upcomingDeadlines: []
      };
    }
  },

  getDeveloperProgressStats: async (options = {}) => {
    try {
      const [usersResponse, tasks, projects] = await Promise.all([
        fetchAllUsers(),
        fetchAllTaskPages(),
        projectService.getAllProjects()
      ]);

      const users = Array.isArray(usersResponse?.users) ? usersResponse.users : [];
      const allTasks = Array.isArray(tasks) ? tasks : [];
      const allProjects = Array.isArray(projects) ? projects : [];
      const currentUser = options.currentUser || null;

      const scopedProjectIds = new Set();
      if (currentUser?.role === 'team_lead' && currentUser?.id) {
        allProjects.forEach((project) => {
          const teamMembers = Array.isArray(project?.team_members) ? project.team_members : [];
          const teamMemberIds = teamMembers.map((member) => Number(member?.id)).filter(Number.isFinite);
          const isProjectCreator = Number(project?.created_by) === Number(currentUser.id);
          const isOnProjectTeam = teamMemberIds.includes(Number(currentUser.id));

          if (isProjectCreator || isOnProjectTeam) {
            scopedProjectIds.add(Number(project.id));
          }
        });
      }

      const isTeamLead = currentUser?.role === 'team_lead';

      if (isTeamLead && scopedProjectIds.size === 0) {
        return [];
      }

      const scopedUsers = isTeamLead && scopedProjectIds.size > 0
        ? users.filter((user) => {
          if (!['admin', 'developer', 'team_lead'].includes(user.role)) {
            return false;
          }

          return allProjects.some((project) => {
            if (!scopedProjectIds.has(Number(project.id))) {
              return false;
            }

            return Array.isArray(project?.team_members)
              ? project.team_members.some((member) => Number(member?.id) === Number(user.id) && ['admin', 'developer', 'team_lead'].includes(member?.role))
              : false;
          });
        })
        : users;

      const getTaskProjectId = (task) => {
        if (!task) return null;
        if (task.project_id !== undefined && task.project_id !== null) return task.project_id;
        if (task.projectId !== undefined && task.projectId !== null) return task.projectId;
        if (task.project && task.project.id !== undefined && task.project.id !== null) return task.project.id;
        return null;
      };

      const scopedUserIds = new Set((isTeamLead ? scopedUsers.map(u => Number(u.id)).filter(Number.isFinite) : []));

      const getTaskAssigneeId = (task) => {
        if (!task) return null;
        if (task.assigned_to !== undefined && task.assigned_to !== null) return task.assigned_to;
        if (task.assignedTo !== undefined && task.assignedTo !== null) return task.assignedTo;
        if (task.assignee !== undefined && task.assignee !== null) return task.assignee;
        return null;
      };

      const scopedTasks = isTeamLead && scopedProjectIds.size > 0
        ? allTasks.filter((task) => {
          const pid = getTaskProjectId(task);
          const aid = getTaskAssigneeId(task);
          const inProject = pid !== null && scopedProjectIds.has(Number(pid));
          const assignedToTeam = aid !== null && scopedUserIds.has(Number(aid));
          return inProject || assignedToTeam;
        })
        : allTasks;

      const result = buildDeveloperProgress(scopedUsers, scopedTasks);
      return result;
    } catch (error) {
      console.error('Failed to fetch developer progress stats:', error);
      return [];
    }
  },

  getReportData: async (reportType = 'tasks', dateRange = 'week', options = {}) => {
    const cacheKey = getReportCacheKey(reportType, dateRange);
    const isGithubReport = reportType === 'github';
    const forceRefresh = Boolean(options?.forceRefresh);

    if (isGithubReport && !forceRefresh) {
      const cachedReport = getFreshCachedReport(cacheKey);
      if (cachedReport) {
        return cachedReport;
      }

      const pendingReport = reportDataCache.get(cacheKey)?.promise;
      if (pendingReport) {
        return pendingReport;
      }
    }

    const reportPromise = (async () => {
      try {
        const data = await getReportDataFromNetwork(reportType, dateRange);
        const fetchedAt = Date.now();
        const report = addReportMeta(data, {
          cache_hit: false,
          fetched_at: new Date(fetchedAt).toISOString(),
          live: true,
        });

        if (isGithubReport) {
          reportDataCache.set(cacheKey, {
            data: report,
            fetchedAt,
          });
        }

        return report;
      } catch (error) {
        console.error('Failed to fetch report data:', error);
        if (isGithubReport) {
          reportDataCache.delete(cacheKey);
        }

        return {
          summary: {},
          details: [],
          meta: {
            cache_hit: false,
            fetched_at: new Date().toISOString(),
            live: false,
          },
        };
      }
    })();

    if (isGithubReport) {
      reportDataCache.set(cacheKey, {
        promise: reportPromise,
        fetchedAt: 0,
      });
    }

    return reportPromise;
  },

  prefetchReportData: async (reportType = 'github', dateRange = 'year') => {
    try {
      return await dashboardService.getReportData(reportType, dateRange);
    } catch (error) {
      console.error('Failed to prefetch report data:', error);
      return null;
    }
  },

  invalidateReportData: (reportType = 'github', dateRange = 'year') => {
    reportDataCache.delete(getReportCacheKey(reportType, dateRange));
  },

  clearReportDataCache: () => {
    reportDataCache.clear();
  },

  refreshReportData: async (reportType = 'github', dateRange = 'year') => (
    dashboardService.getReportData(reportType, dateRange, { forceRefresh: true })
  )
};

export {
  dashboardService,
  normalizeTaskReportDetails,
  getDateRangeStart,
  getActivityWindowDays,
  isWithinDateRange,
};
export default dashboardService;
