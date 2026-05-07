import {
  dashboardService,
  fetchWithAuth,
  githubService,
  notificationService,
  projectService,
  taskService,
  userService,
} from '../../services/utils/api';

const buildResponse = (payload, status = 200, contentType = 'application/json', extraHeaders = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {
    get: (name) => {
      const key = String(name || '').toLowerCase();
      if (key === 'content-type') return contentType;
      if (key === 'retry-after') return extraHeaders['Retry-After'] || extraHeaders['retry-after'] || null;
      return null;
    },
  },
  json: jest.fn().mockResolvedValue(payload),
});

describe('api utilities', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    localStorage.clear();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  test('fetchWithAuth includes localStorage bearer token by default', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 1, token: 'token-123' }));
    global.fetch.mockResolvedValue(buildResponse({ success: true }));

    const response = await fetchWithAuth('tasks');

    expect(response).toEqual({ success: true });
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/v1/tasks');
    expect(options.headers.Authorization).toBe('Bearer token-123');
  });

  test('fetchWithAuth keeps explicit Authorization header from options', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 1, token: 'token-local' }));
    global.fetch.mockResolvedValue(buildResponse({ ok: true }));

    await fetchWithAuth('/github/status', {
      headers: { Authorization: 'Bearer explicit-token' },
    });

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/v1/github/status');
    expect(options.headers.Authorization).toBe('Bearer explicit-token');
  });

  test('fetchWithAuth clears corrupted localStorage user data', async () => {
    localStorage.setItem('user', '{bad-json');
    global.fetch.mockResolvedValue(buildResponse({ success: true }));

    await fetchWithAuth('tasks');

    expect(localStorage.getItem('user')).toBeNull();
  });

  test('fetchWithAuth returns empty object for 204 responses', async () => {
    global.fetch.mockResolvedValue(buildResponse({}, 204, null));

    const response = await fetchWithAuth('tasks/1');

    expect(response).toEqual({});
  });

  test('fetchWithAuth handles 401 gracefully for non-critical endpoints', async () => {
    global.fetch.mockResolvedValue(buildResponse({ message: 'token expired' }, 401));

    const response = await fetchWithAuth('notifications');

    expect(response.isAuthError).toBe(true);
    expect(response.error).toContain('Authentication failed');
  });

  test('fetchWithAuth throws for 401 on critical endpoints', async () => {
    global.fetch.mockResolvedValue(buildResponse({ message: 'token expired' }, 401));

    await expect(fetchWithAuth('tasks')).rejects.toMatchObject({
      status: 401,
      isAuthError: true,
    });
  });

  test('fetchWithAuth throws structured error for GitHub 400 endpoints', async () => {
    global.fetch.mockResolvedValue(buildResponse({ message: 'Invalid state parameter' }, 400));

    await expect(fetchWithAuth('github/connect')).rejects.toMatchObject({
      status: 400,
      isGitHubError: true,
      message: 'Invalid state parameter',
    });
  });

  test('fetchWithAuth throws rate-limit error for 429 responses', async () => {
    global.fetch.mockResolvedValue(buildResponse({}, 429, 'application/json', { 'Retry-After': '15' }));

    await expect(fetchWithAuth('tasks')).rejects.toMatchObject({
      status: 429,
      retryAfter: 15,
    });
  });

  test('fetchWithAuth returns non-critical endpoint error object on server failures', async () => {
    global.fetch.mockResolvedValue(buildResponse({ message: 'Server exploded' }, 500));

    const response = await fetchWithAuth('github/status');

    expect(response.error).toContain('Server exploded');
  });

  test('fetchWithAuth returns empty object for non-json success responses', async () => {
    global.fetch.mockResolvedValue(buildResponse({}, 200, 'text/plain'));

    const response = await fetchWithAuth('projects');

    expect(response).toEqual({});
  });

  test('fetchWithAuth maps connection failures to a safe error response', async () => {
    global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    const response = await fetchWithAuth('tasks');

    expect(response.isConnectionError).toBe(true);
    expect(response.error).toContain('Server connection failed');
  });

  test('taskService and projectService normalize malformed payloads', async () => {
    global.fetch.mockResolvedValueOnce(buildResponse({ tasks: { id: 1 } }));
    global.fetch.mockResolvedValueOnce(buildResponse({ task: { id: 9, title: 'Task' } }));
    global.fetch.mockResolvedValueOnce(buildResponse({ projects: { id: 3 } }));
    global.fetch.mockResolvedValueOnce(buildResponse({ project: { id: 2 } }));

    const allTasks = await taskService.getAllTasks();
    const taskById = await taskService.getTaskById(9);
    const allProjects = await projectService.getAllProjects();
    const projectById = await projectService.getProjectById(2);

    expect(allTasks).toEqual([]);
    expect(taskById).toEqual({ id: 9, title: 'Task' });
    expect(allProjects).toEqual([]);
    expect(projectById).toEqual({ id: 2 });
  });

  test('taskService comment helpers normalize data and handle errors', async () => {
    global.fetch.mockResolvedValueOnce(buildResponse({ comments: [{ id: 1, content: 'hello' }] }));
    global.fetch.mockResolvedValueOnce(buildResponse({ comment: { id: 2, content: 'new' } }));
    global.fetch.mockRejectedValueOnce(new Error('comments failed'));

    const comments = await taskService.getTaskComments(5);
    const created = await taskService.addTaskComment(5, { content: 'new' });
    const failedComments = await taskService.getTaskComments(5);

    expect(comments).toEqual([{ id: 1, content: 'hello' }]);
    expect(created).toEqual({ id: 2, content: 'new' });
    expect(failedComments).toEqual([]);
  });

  test('githubService.checkConnection and getUserRepos degrade gracefully on errors', async () => {
    global.fetch.mockResolvedValueOnce(buildResponse({ error: 'auth', isAuthError: true }));
    global.fetch.mockResolvedValueOnce(buildResponse({ error: 'upstream' }));

    const status = await githubService.checkConnection();
    const repos = await githubService.getUserRepos();

    expect(status).toEqual({ connected: false, username: '' });
    expect(repos).toEqual([]);
  });

  test('githubService initiation and callbacks enforce expected contracts', async () => {
    global.fetch.mockResolvedValueOnce(buildResponse({}));
    global.fetch.mockResolvedValueOnce(buildResponse({ authorization_url: 'https://github.com/oauth' }));
    global.fetch.mockResolvedValueOnce(buildResponse({ success: true, linked: true }));

    await expect(githubService.initiateOAuthFlow()).rejects.toThrow('Could not get GitHub authorization URL');

    const authUrl = await githubService.initiateOAuthFlow();
    const callbackResult = await githubService.completeOAuthFlow('code-123');

    expect(authUrl).toBe('https://github.com/oauth');
    expect(callbackResult).toEqual({ success: true, linked: true });
  });

  test('githubService utility methods map expected shapes', () => {
    const rate403 = githubService.handleRateLimitError({
      status: 403,
      data: { message: 'rate limit reached', documentation_url: 'https://docs.github.com' },
    });

    const rate429 = githubService.handleRateLimitError({ status: 429, retryAfter: 20 });
    const noRateLimit = githubService.handleRateLimitError({ status: 500 });

    expect(rate403.title).toBe('GitHub API Rate Limit Exceeded');
    expect(rate403.documentationUrl).toContain('docs.github.com');
    expect(rate429.retryAfter).toBe(20);
    expect(noRateLimit).toBeNull();
  });

  test('dashboardService.getDeveloperProgressStats computes role-scoped aggregates', async () => {
    global.fetch.mockResolvedValueOnce(
      buildResponse({
        users: [
          { id: 1, name: 'Client One', role: 'developer' },
          { id: 2, name: 'Admin One', role: 'admin' },
          { id: 3, name: 'Developer One', role: 'developer' },
        ],
      })
    );
    global.fetch.mockResolvedValueOnce(
      buildResponse({
        tasks: [
          { id: 10, assigned_to: 1, status: 'completed', updated_at: '2099-01-02T00:00:00.000Z' },
          { id: 11, assigned_to: 1, status: 'todo', updated_at: '2099-01-03T00:00:00.000Z' },
          { id: 12, assigned_to: 3, status: 'done', updated_at: '2099-01-04T00:00:00.000Z' },
        ],
      })
    );

    const progress = await dashboardService.getDeveloperProgressStats();

    expect(progress).toHaveLength(2);
    expect(progress.find((item) => item.id === 1).completed_tasks).toBe(1);
    expect(progress.find((item) => item.id === 3).completed_tasks).toBe(1);
  });

  test('dashboardService.getReportData returns structured summaries by report type', async () => {
    global.fetch.mockResolvedValueOnce(
      buildResponse({
        tasks: [
          {
            id: 1,
            assigned_to: 5,
            status: 'in_progress',
            created_at: '2099-01-01T00:00:00.000Z',
            deadline: '2099-01-30T00:00:00.000Z',
          },
          {
            id: 2,
            assigned_to: 5,
            status: 'completed',
            created_at: '2099-01-01T00:00:00.000Z',
            deadline: '2099-01-15T00:00:00.000Z',
          },
        ],
      })
    );
    global.fetch.mockResolvedValueOnce(
      buildResponse({ users: [{ id: 5, name: 'Dev', role: 'developer' }] })
    );

    const developersReport = await dashboardService.getReportData('developers', 'year');

    expect(developersReport.summary.developers).toBe(1);
    expect(developersReport.details).toHaveLength(1);

    global.fetch.mockResolvedValueOnce(buildResponse({ tasks: [] }));
    global.fetch.mockResolvedValueOnce(buildResponse({ users: [] }));
    global.fetch.mockResolvedValueOnce(buildResponse({ connected: false }));

    const githubReport = await dashboardService.getReportData('github', 'month');

    expect(githubReport.summary.repos).toBe(0);
    expect(githubReport.details).toEqual([]);
  });

  test('user and notification services handle error and auth fallback paths', async () => {
    global.fetch.mockRejectedValueOnce(new Error('users down'));
    global.fetch.mockResolvedValueOnce(buildResponse({ error: 'auth failed' }));
    global.fetch.mockResolvedValueOnce(buildResponse({ notifications: [{ id: 1 }] }));

    const users = await userService.getAllDevelopers();
    const notificationsWhenErrored = await notificationService.getNotifications();
    const notificationsNormal = await notificationService.getNotifications();

    expect(users).toEqual([]);
    expect(notificationsWhenErrored).toEqual([]);
    expect(notificationsNormal).toEqual([{ id: 1 }]);
  });

  test('getDateRangeStart covers month, quarter, year, and default week arms', async () => {
    // Exercise via getReportData which calls getDateRangeStart internally
    const makeTasksResp = (tasks) => buildResponse({ tasks });
    const makeUsersResp = () => buildResponse({ users: [] });
    const singleTask = [{ id: 1, assigned_to: null, status: 'todo', created_at: new Date().toISOString() }];

    for (const dateRange of ['month', 'quarter', 'year', 'week']) {
      global.fetch.mockResolvedValueOnce(makeTasksResp(singleTask));
      global.fetch.mockResolvedValueOnce(makeUsersResp());
      const result = await dashboardService.getReportData('tasks', dateRange);
      expect(result).toHaveProperty('summary');
    }
  });

  test('isWithinDateRange returns true for null and invalid dates', async () => {
    // tasks with null/bad created_at should not be filtered out
    global.fetch.mockResolvedValueOnce(
      buildResponse({ tasks: [
        { id: 1, assigned_to: null, status: 'todo', created_at: null },
        { id: 2, assigned_to: null, status: 'todo', created_at: 'not-a-date' },
      ] })
    );
    global.fetch.mockResolvedValueOnce(buildResponse({ users: [] }));

    const result = await dashboardService.getReportData('tasks', 'month');
    expect(result.summary.total).toBe(2);
  });

  test('getReportData counts overdue tasks (past deadline and not done)', async () => {
    const pastDeadline = '2000-01-01T00:00:00.000Z';
    const futureDeadline = '2099-01-01T00:00:00.000Z';
    global.fetch.mockResolvedValueOnce(
      buildResponse({ tasks: [
        { id: 1, assigned_to: null, status: 'in_progress', created_at: new Date().toISOString(), deadline: pastDeadline },
        { id: 2, assigned_to: null, status: 'done', created_at: new Date().toISOString(), deadline: pastDeadline },
        { id: 3, assigned_to: null, status: 'todo', created_at: new Date().toISOString(), deadline: futureDeadline },
        { id: 4, assigned_to: null, status: 'todo', created_at: new Date().toISOString(), deadline: null },
      ] })
    );
    global.fetch.mockResolvedValueOnce(buildResponse({ users: [] }));

    const result = await dashboardService.getReportData('tasks', 'year');
    expect(result.summary.overdue).toBe(1);
    expect(result.summary.completed).toBe(1);
    expect(result.summary.in_progress).toBe(1);
  });

  test('getReportData github branch when connected returns normalized repos', async () => {
    global.fetch
      .mockResolvedValueOnce(buildResponse({ tasks: [] }))
      .mockResolvedValueOnce(buildResponse({ users: [] }))
      .mockResolvedValueOnce(buildResponse({ connected: true }))
      .mockResolvedValueOnce(
        buildResponse({
          repositories: [
            {
              id: 1,
              full_name: 'org/r',
              open_issues_count: 5,
              open_prs: 2,
              recent_commits: 4,
              updated_at: '2099-01-01T00:00:00.000Z',
            },
          ],
        })
      );

    const report = await dashboardService.getReportData('github', 'month');
    expect(report.summary.repos).toBe(1);
    expect(report.summary.open_issues).toBe(5);
    expect(report.details[0].open_issues).toBe(5);
    expect(report.details[0].last_updated).toBe('2099-01-01T00:00:00.000Z');
    expect(global.fetch.mock.calls[3][0]).toContain('include_activity=true');
    expect(global.fetch.mock.calls[3][0]).toContain('all_pages=true');
    expect(global.fetch.mock.calls[3][0]).toContain('per_page=100');
  });

  test('buildDeveloperProgress: task with no assigned_to is skipped', async () => {
    global.fetch.mockResolvedValueOnce(
      buildResponse({ users: [{ id: 1, name: 'Dev', role: 'developer' }] })
    );
    global.fetch.mockResolvedValueOnce(
      buildResponse({ tasks: [
        { id: 10, assigned_to: undefined, status: 'done' },
        { id: 11, assigned_to: null, status: 'done' },
        { id: 12, assigned_to: 1, status: 'done', updated_at: '2099-01-01T00:00:00.000Z' },
      ] })
    );

    const progress = await dashboardService.getDeveloperProgressStats();
    const dev = progress.find((p) => p.id === 1);
    expect(dev.completed_tasks).toBe(1);
    expect(dev.total_tasks).toBe(1);
  });

  test('buildDeveloperProgress: admin role is excluded, team_lead included', async () => {
    global.fetch.mockResolvedValueOnce(
      buildResponse({ users: [
        { id: 1, name: 'Admin', role: 'admin' },
        { id: 2, name: 'Lead', role: 'team_lead' },
      ] })
    );
    global.fetch.mockResolvedValueOnce(buildResponse({ tasks: [] }));

    const progress = await dashboardService.getDeveloperProgressStats();
    expect(progress.find((p) => p.id === 1)).toBeUndefined();
    expect(progress.find((p) => p.id === 2)).toBeDefined();
  });

  test('projectService.getProjectTasks normalizes and handles errors', async () => {
    global.fetch.mockResolvedValueOnce(buildResponse({ tasks: [{ id: 1 }] }));
    global.fetch.mockRejectedValueOnce(new Error('network error'));

    const tasks = await projectService.getProjectTasks(5);
    const tasksOnError = await projectService.getProjectTasks(6);

    expect(tasks).toEqual([{ id: 1 }]);
    expect(tasksOnError).toEqual([]);
  });

  test('taskService.getUsers normalizes and handles errors', async () => {
    global.fetch.mockResolvedValueOnce(buildResponse({ users: [{ id: 1 }] }));
    global.fetch.mockRejectedValueOnce(new Error('users down'));

    const users = await taskService.getUsers();
    const usersOnError = await taskService.getUsers();

    expect(users).toEqual([{ id: 1 }]);
    expect(usersOnError).toEqual([]);
  });

  test('taskService.getProjects normalizes and handles errors', async () => {
    global.fetch.mockResolvedValueOnce(buildResponse({ projects: [{ id: 3 }] }));
    global.fetch.mockRejectedValueOnce(new Error('projects down'));

    const projects = await taskService.getProjects();
    const projectsOnError = await taskService.getProjects();

    expect(projects).toEqual([{ id: 3 }]);
    expect(projectsOnError).toEqual([]);
  });

  test('taskService.addTaskComment falls back to raw response when no comment key', async () => {
    global.fetch.mockResolvedValueOnce(buildResponse({ id: 99, content: 'direct' }));

    const result = await taskService.addTaskComment(7, { content: 'direct' });
    expect(result).toEqual({ id: 99, content: 'direct' });
  });

  test('fetchWithAuth throws non-connection errors from the catch block', async () => {
    const err = new Error('unexpected boom');
    global.fetch.mockRejectedValue(err);

    await expect(fetchWithAuth('dashboard/admin')).rejects.toThrow('unexpected boom');
  });

  test('fetchWithAuth parses GitHub 400 error body even when json throws', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      headers: { get: (h) => h === 'content-type' ? 'application/json' : null },
      json: jest.fn().mockRejectedValue(new Error('bad json')),
    });

    await expect(fetchWithAuth('github/callback')).rejects.toMatchObject({
      status: 400,
      isGitHubError: true,
    });
  });

  test('fetchWithAuth handles non-critical 401 for github/status endpoint', async () => {
    global.fetch.mockResolvedValue(buildResponse({ message: 'unauthorized' }, 401));

    const response = await fetchWithAuth('github/status');
    expect(response.isAuthError).toBe(true);
  });

  test('dashboardService.getAdminDashboardStats returns fallback on error', async () => {
    global.fetch.mockRejectedValue(new Error('admin down'));

    const stats = await dashboardService.getAdminDashboardStats('month');
    expect(stats.projects.total).toBe(0);
    expect(stats.tasks.active).toBe(0);
  });

  test('dashboardService.getAdminDashboardStats normalizes backend task stats', async () => {
    global.fetch.mockResolvedValue(
      buildResponse({
        projects: { total: 3 },
        tasks: {
          total: 9,
          backlog: 1,
          todo: 2,
          in_progress: 3,
          review: 1,
          done: 3,
        },
        users: { total: 4 },
        recentProjects: [],
      })
    );

    const stats = await dashboardService.getAdminDashboardStats('week');

    expect(stats.tasks.active).toBe(6);
    expect(stats.tasks.completed).toBe(3);
    expect(stats.tasks.total).toBe(9);
    expect(stats.tasks.backlog).toBe(1);
  });

  test('dashboardService.getBasicDashboardStats returns fallback on error', async () => {
    global.fetch.mockRejectedValue(new Error('client down'));

    const stats = await dashboardService.getBasicDashboardStats();
    expect(stats.taskCounts.assigned).toBe(0);
    expect(stats.recentTasks).toEqual([]);
    expect(stats.githubActivity).toEqual([]);
  });

  test('dashboardService.getDeveloperProgressStats returns empty array on error', async () => {
    global.fetch.mockRejectedValue(new Error('users down'));

    const stats = await dashboardService.getDeveloperProgressStats();
    expect(stats).toEqual([]);
  });

  test('dashboardService.getReportData returns zero-filled summary when services return empty data', async () => {
    // getAllTasks catches errors internally and returns []; users fetch .catch returns { users: [] }
    // so the outer catch is never triggered — we get a valid but empty computed summary
    global.fetch.mockRejectedValue(new Error('boom'));

    const result = await dashboardService.getReportData('tasks', 'week');
    expect(result.summary.total).toBe(0);
    expect(result.summary.completed).toBe(0);
    expect(result.summary.overdue).toBe(0);
    expect(result.details).toEqual([]);
  });

  test('githubService.getIssues normalizes response and handles errors', async () => {
    global.fetch.mockResolvedValueOnce(buildResponse({ issues: [{ id: 1 }] }));
    global.fetch.mockRejectedValueOnce(new Error('issues down'));

    const issues = await githubService.getIssues(10);
    const issuesOnError = await githubService.getIssues(11);

    expect(issues).toEqual([{ id: 1 }]);
    expect(issuesOnError).toEqual([]);
  });

  test('githubService.getPullRequests normalizes response and handles errors', async () => {
    global.fetch.mockResolvedValueOnce(buildResponse({ pulls: [{ id: 2 }] }));
    global.fetch.mockRejectedValueOnce(new Error('prs down'));

    const prs = await githubService.getPullRequests(10);
    const prsOnError = await githubService.getPullRequests(11);

    expect(prs).toEqual([{ id: 2 }]);
    expect(prsOnError).toEqual([]);
  });

  test('githubService.getUserRepos returns normalized repositories array from response', async () => {
    global.fetch.mockResolvedValueOnce(
      buildResponse({
        repositories: [
          {
            id: 5,
            open_issues_count: 4,
            pushed_at: '2099-02-01T00:00:00.000Z',
          },
        ],
      })
    );

    const repos = await githubService.getUserRepos({
      page: 2,
      perPage: 15,
      activityWindowDays: 30,
    });
    expect(repos).toEqual([
      {
        id: 5,
        open_issues_count: 4,
        open_issues: 4,
        open_prs: 0,
        recent_commits: 0,
        pushed_at: '2099-02-01T00:00:00.000Z',
        last_updated: '2099-02-01T00:00:00.000Z',
      },
    ]);
    expect(global.fetch.mock.calls[0][0]).toContain('/api/v1/github/repositories?page=2&per_page=15&activity_window_days=30');
  });

  test('userService.getDeveloperProgress returns null on error', async () => {
    global.fetch.mockRejectedValue(new Error('progress down'));

    const result = await userService.getDeveloperProgress(42);
    expect(result).toBeNull();
  });

  test('fetchWithAuth timeout causes connection-like re-throw', async () => {
    jest.useFakeTimers();
    global.fetch.mockImplementation(() => new Promise(() => {})); // never resolves

    const promise = fetchWithAuth('tasks');
    jest.advanceTimersByTime(8001);

    await expect(promise).rejects.toThrow('Request timeout');
    jest.useRealTimers();
  });
});
