import { fetchWithAuth } from './client';

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

  // Aggregation lives server-side: one request instead of page-everything.
  const params = new URLSearchParams({ type: reportType, date_range: dateRange });
  const response = await fetchWithAuth(`reports/data?${params.toString()}`);

  if (response?.error) {
    throw new Error(response.error);
  }

  return {
    summary: response?.summary || {},
    details: Array.isArray(response?.details) ? response.details : [],
    meta: response?.meta || {},
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

  // Server-side aggregate: one GROUP BY replaces paging every task and user
  // (the old client-side loop that grew with the dataset). The paginated
  // helpers stay for getReportData, which still needs the task rows themselves.
  getDeveloperProgressStats: async () => {
    try {
      const response = await fetchWithAuth('dashboard/developer-progress');
      return Array.isArray(response?.developers) ? response.developers : [];
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
  getDateRangeStart,
  getActivityWindowDays,
  isWithinDateRange,
};
export default dashboardService;
