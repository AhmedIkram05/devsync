import {
  dashboardService,
  fetchWithAuth,
  githubService,
  notificationService,
  projectService,
  reportService,
  taskService,
  normalizeTaskReportDetails,
} from '../../../services/utils/api';

const makeResponse = ({
  status = 200,
  ok = true,
  body = {},
  headers = {},
} = {}) => ({
  status,
  ok,
  headers: {
    get: (name) => {
      if (name === 'content-type' || name === 'Content-Type') {
        return headers['content-type'] || headers['Content-Type'] || 'application/json';
      }

      return headers[name] ?? headers[name.toLowerCase()] ?? null;
    },
  },
  json: jest.fn().mockResolvedValue(body),
});

describe('normalizeTaskReportDetails', () => {
  test('hydrates assignee_name from the user list when task rows only expose assigned_to ids', () => {
    const tasks = [
      { id: 1, title: 'Task A', assigned_to: 9 },
      { id: 2, title: 'Task B', assigned_to: 10 },
      { id: 3, title: 'Task C', assigned_to: null },
    ];

    const users = [
      { id: 9, name: 'Developer One' },
      { id: 10, name: 'Developer Two' },
    ];

    const normalized = normalizeTaskReportDetails(tasks, users);

    expect(normalized).toEqual([
      { id: 1, title: 'Task A', assigned_to: 9, assignee_name: 'Developer One' },
      { id: 2, title: 'Task B', assigned_to: 10, assignee_name: 'Developer Two' },
      { id: 3, title: 'Task C', assigned_to: null, assignee_name: null },
    ]);
  });

  test('handles empty tasks array', () => {
    const tasks = [];
    const users = [{ id: 1, name: 'User' }];
    const normalized = normalizeTaskReportDetails(tasks, users);
    expect(normalized).toEqual([]);
  });

  test('handles empty users array', () => {
    const tasks = [{ id: 1, title: 'Task', assigned_to: 1 }];
    const users = [];
    const normalized = normalizeTaskReportDetails(tasks, users);
    expect(normalized[0].assignee_name).toBeNull();
  });

  test('handles undefined inputs', () => {
    expect(normalizeTaskReportDetails(undefined, undefined)).toEqual([]);
    expect(normalizeTaskReportDetails([], undefined)).toEqual([]);
  });

  test('matches user by id across multiple tasks', () => {
    const tasks = [
      { id: 1, title: 'Task 1', assigned_to: 5 },
      { id: 2, title: 'Task 2', assigned_to: 5 },
      { id: 3, title: 'Task 3', assigned_to: 6 },
    ];

    const users = [
      { id: 5, name: 'Same Dev' },
      { id: 6, name: 'Other Dev' },
    ];

    const normalized = normalizeTaskReportDetails(tasks, users);

    expect(normalized[0].assignee_name).toBe('Same Dev');
    expect(normalized[1].assignee_name).toBe('Same Dev');
    expect(normalized[2].assignee_name).toBe('Other Dev');
  });

  test('preserves other task properties during normalization', () => {
    const tasks = [
      {
        id: 1,
        title: 'Task A',
        assigned_to: 1,
        status: 'done',
        priority: 'high',
        customField: 'preserved',
      },
    ];

    const users = [{ id: 1, name: 'Dev' }];

    const normalized = normalizeTaskReportDetails(tasks, users);

    expect(normalized[0].status).toBe('done');
    expect(normalized[0].priority).toBe('high');
    expect(normalized[0].customField).toBe('preserved');
  });
});

describe('api service branches', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    global.fetch = jest.fn();
    dashboardService.clearReportDataCache();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  test('fetchWithAuth removes corrupted user data and still performs the request', async () => {
    const removeItemSpy = jest.spyOn(Storage.prototype, 'removeItem');
    const getItemSpy = jest.spyOn(Storage.prototype, 'getItem').mockReturnValue('not-json');
    global.fetch.mockResolvedValue(makeResponse({ body: { ok: true } }));

    const result = await fetchWithAuth('tasks');

    expect(result).toEqual({ ok: true });
    expect(getItemSpy).toHaveBeenCalledWith('user');
    expect(removeItemSpy).toHaveBeenCalledWith('user');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('fetchWithAuth returns an empty object for no-content responses', async () => {
    global.fetch.mockResolvedValue(makeResponse({ status: 204, ok: true }));

    await expect(fetchWithAuth('tasks/1')).resolves.toEqual({});
  });

  test('fetchWithAuth surfaces rate limit errors with retryAfter', async () => {
    global.fetch.mockResolvedValue(makeResponse({
      status: 429,
      ok: false,
      headers: { 'Retry-After': '15' },
    }));

    await expect(fetchWithAuth('tasks')).rejects.toMatchObject({
      status: 429,
      retryAfter: 15,
    });
  });

  test('notificationService returns an empty list on non-critical auth errors', async () => {
    global.fetch.mockResolvedValue(makeResponse({ status: 401, ok: false }));

    await expect(notificationService.getNotifications()).resolves.toEqual([]);
  });

  test('github OAuth initiation surfaces API error details', async () => {
    global.fetch.mockResolvedValue(makeResponse({
      status: 400,
      ok: false,
      body: { message: 'GitHub said no' },
    }));

    await expect(githubService.initiateOAuthFlow()).rejects.toThrow('GitHub said no');
  });

  test('taskService builds query strings and normalizes response shapes', async () => {
    global.fetch.mockResolvedValue(makeResponse({ body: { tasks: [{ id: 1 }] } }));

    const tasks = await taskService.getAllTasks({ assigned_to: 5, status: 'todo' });

    expect(tasks).toEqual([{ id: 1 }]);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/tasks?assigned_to=5&status=todo'),
      expect.objectContaining({ credentials: 'include' })
    );
  });

  test('taskService falls back to an empty array on fetch failure', async () => {
    global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(taskService.getAllTasks()).resolves.toEqual([]);
  });

  test('projectService falls back to null and empty arrays on errors', async () => {
    global.fetch.mockRejectedValue(new Error('boom'));

    await expect(projectService.getProjectById(9)).resolves.toBeNull();
    await expect(projectService.getAllProjects()).resolves.toEqual([]);
  });

  test('dashboardService normalizes admin task metrics and uses fallback data on failure', async () => {
    global.fetch.mockResolvedValue(makeResponse({
      body: {
        tasks: {
          backlog: '1',
          todo: '2',
          in_progress: '3',
          review: '4',
          done: '5',
        },
        projects: { total: 9 },
        users: { total: 6 },
        recentProjects: [{ id: 1 }],
      },
    }));

    const stats = await dashboardService.getAdminDashboardStats('week');

    expect(stats.tasks.total).toBe(15);
    expect(stats.tasks.active).toBe(9);
    expect(stats.tasks.completed).toBe(5);

    global.fetch.mockRejectedValueOnce(new Error('boom'));
    await expect(dashboardService.getAdminDashboardStats('week')).resolves.toEqual({
      projects: { total: 0 },
      tasks: { active: 0, completed: 0 },
      users: { total: 0 },
      recentProjects: [],
    });
  });

  test('dashboardService returns developer progress for the full trackable role set', async () => {
    const usersResponse = { users: [
      { id: 1, name: 'Admin', role: 'admin' },
      { id: 2, name: 'Dev', role: 'developer' },
      { id: 3, name: 'TL', role: 'team_lead' },
      { id: 4, name: 'Guest', role: 'viewer' },
    ] };

    jest.spyOn(taskService, 'getAllTasks').mockResolvedValue([
      { id: 10, assigned_to: 1, status: 'done', updated_at: '2026-01-01T00:00:00.000Z' },
      { id: 11, assigned_to: 2, status: 'in_progress', updated_at: '2026-01-02T00:00:00.000Z' },
      { id: 12, assigned_to: 3, status: 'completed', updated_at: '2026-01-03T00:00:00.000Z' },
      { id: 13, assigned_to: 4, status: 'todo', updated_at: '2026-01-04T00:00:00.000Z' },
    ]);
    jest.spyOn(projectService, 'getAllProjects').mockResolvedValue([]);
    global.fetch.mockResolvedValue(makeResponse({ body: usersResponse }));

    const progress = await dashboardService.getDeveloperProgressStats({ currentUser: { id: 2, role: 'developer' } });

    expect(progress).toEqual([
      expect.objectContaining({ id: 1, role: 'admin', total_tasks: 1, completed_tasks: 1 }),
      expect.objectContaining({ id: 2, role: 'developer', total_tasks: 1, completed_tasks: 0 }),
      expect.objectContaining({ id: 3, role: 'team_lead', total_tasks: 1, completed_tasks: 1 }),
    ]);
  });

  test('githubService normalizes repository payloads and handles rate limit helpers', async () => {
    global.fetch.mockResolvedValue(makeResponse({
      body: {
        repositories: [
          {
            name: 'devsync',
            open_issues_count: '3',
            total_prs: '4',
            recent_commits: '5',
            pushed_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    }));

    const repos = await githubService.getUserRepos({ fetchAll: true, activityWindowDays: 30, perPage: 100 });

    expect(repos[0]).toMatchObject({
      name: 'devsync',
      open_issues: 3,
      open_issues_count: 3,
      total_prs: 4,
      recent_commits: 5,
      last_updated: '2026-01-01T00:00:00.000Z',
    });

    expect(githubService.handleRateLimitError({ status: 403, data: { message: 'rate limit exceeded', documentation_url: 'https://docs.github.com' } })).toMatchObject({
      title: 'GitHub API Rate Limit Exceeded',
      documentationUrl: 'https://docs.github.com',
    });
    expect(githubService.handleRateLimitError({ status: 429, retryAfter: 90 })).toMatchObject({
      retryAfter: 90,
    });
  });

  test('reportService saves, fetches, and deletes reports', async () => {
    global.fetch.mockResolvedValue(makeResponse({ body: { report: { id: 'r1' }, reports: [{ id: 'r1' }] } }));

    await expect(reportService.saveReport('tasks', 'week', { total: 1 }, [])).resolves.toHaveProperty('report.id', 'r1');
    await expect(reportService.getSavedReports({ type: 'tasks' })).resolves.toHaveProperty('reports');
    await expect(reportService.deleteReport('r1')).resolves.toHaveProperty('report.id', 'r1');
  });

  test('dashboard report data caches GitHub responses and can be refreshed', async () => {
    jest.spyOn(githubService, 'getUserRepos').mockResolvedValue([
      { name: 'repo', open_issues: 1, total_prs: 2, recent_commits: 3 },
    ]);
    global.fetch.mockResolvedValue(makeResponse({ body: { connected: true } }));

    const first = await dashboardService.getReportData('github', 'week');
    const second = await dashboardService.getReportData('github', 'week');
    const refreshed = await dashboardService.refreshReportData('github', 'week');

    expect(first.meta.cache_hit).toBe(false);
    expect(second.meta.cache_hit).toBe(true);
    expect(refreshed.meta.live).toBe(true);
    expect(githubService.getUserRepos).toHaveBeenCalledWith(expect.objectContaining({
      perPage: 100,
      fetchAll: true,
      activityWindowDays: 7,
    }));
  });

  test('dashboard report data builds task and developer summaries', async () => {
    jest.spyOn(taskService, 'getAllTasks').mockResolvedValue([
      { id: 1, title: 'A', status: 'done', assigned_to: 1, created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
      { id: 2, title: 'B', status: 'in_progress', assigned_to: 2, created_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(), deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
      { id: 3, title: 'C', status: 'completed', assigned_to: 2, created_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString() },
    ]);
    global.fetch.mockResolvedValue(makeResponse({ body: { users: [
      { id: 1, name: 'Admin', role: 'admin' },
      { id: 2, name: 'Dev', role: 'developer' },
    ] } }));

    const taskReport = await dashboardService.getReportData('tasks', 'week');
    const developerReport = await dashboardService.getReportData('developers', 'week');

    expect(taskReport.summary.total).toBe(3);
    expect(taskReport.summary.completed).toBe(2);
    expect(taskReport.summary.in_progress).toBe(1);
    expect(developerReport.summary.developers).toBe(2);
    expect(developerReport.details).toHaveLength(2);
  });

  test('reportService uses distinct fetch responses for save, list, and delete', async () => {
    global.fetch
      .mockResolvedValueOnce(makeResponse({ body: { report: { id: 'r1', type: 'tasks' } } }))
      .mockResolvedValueOnce(makeResponse({ body: { reports: [{ id: 'r1' }] } }))
      .mockResolvedValueOnce(makeResponse({ body: { success: true } }));

    await expect(reportService.saveReport('tasks', 'week', { total: 1 }, [])).resolves.toEqual({ report: { id: 'r1', type: 'tasks' } });
    await expect(reportService.getSavedReports({ type: 'tasks' })).resolves.toEqual({ reports: [{ id: 'r1' }] });
    await expect(reportService.deleteReport('r1')).resolves.toEqual({ success: true });
  });
});
