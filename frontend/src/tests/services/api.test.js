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
          { id: 1, name: 'Client One', role: 'client' },
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
});
