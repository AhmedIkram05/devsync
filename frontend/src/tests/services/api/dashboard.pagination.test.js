import { dashboardService, taskService, projectService, githubService } from '../../../services/utils/api';

const jsonResponse = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {
    get: (name) => (String(name || '').toLowerCase() === 'content-type' ? 'application/json' : null),
  },
  json: jest.fn().mockResolvedValue(payload),
});

// Aggregates (report totals, developer stats) must page through every list
// endpoint, not just the first 100 rows.
describe('dashboardService paginated aggregates', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    global.fetch = jest.fn();
    dashboardService.clearReportDataCache();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('getReportData walks every task page for the totals', async () => {
    jest.spyOn(taskService, 'getTasksPaginated')
      .mockResolvedValueOnce({
        items: [{ id: 1, status: 'done', created_at: new Date().toISOString() }],
        pagination: { page: 1, pages: 2, total: 2 },
      })
      .mockResolvedValueOnce({
        items: [{ id: 2, status: 'todo', created_at: new Date().toISOString() }],
        pagination: { page: 2, pages: 2, total: 2 },
      });
    global.fetch.mockResolvedValue(jsonResponse({ users: [{ id: 1, name: 'A', role: 'developer' }] }));

    const report = await dashboardService.getReportData('tasks', 'week');

    expect(taskService.getTasksPaginated).toHaveBeenCalledTimes(2);
    expect(report.summary.total).toBe(2);
  });

  test('getReportData walks every user page', async () => {
    jest.spyOn(taskService, 'getTasksPaginated').mockResolvedValue({
      items: [],
      pagination: { page: 1, pages: 1, total: 0 },
    });
    global.fetch
      .mockResolvedValueOnce(jsonResponse({
        users: [{ id: 1, name: 'A', role: 'developer' }],
        pagination: { page: 1, pages: 2, total: 2 },
      }))
      .mockResolvedValueOnce(jsonResponse({
        users: [{ id: 2, name: 'B', role: 'developer' }],
        pagination: { page: 2, pages: 2, total: 2 },
      }));

    const report = await dashboardService.getReportData('developers', 'week');

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(report.details.length).toBeGreaterThanOrEqual(1);
  });

  test('getDeveloperProgressStats pages tasks and users', async () => {
    jest.spyOn(taskService, 'getTasksPaginated').mockResolvedValue({
      items: [{ id: 5, assigned_to: 1, status: 'done', updated_at: new Date().toISOString() }],
      pagination: { page: 1, pages: 1, total: 1 },
    });
    jest.spyOn(projectService, 'getAllProjects').mockResolvedValue([]);
    global.fetch.mockResolvedValue(jsonResponse({ users: [{ id: 1, name: 'Dev', role: 'developer' }] }));

    const progress = await dashboardService.getDeveloperProgressStats({
      currentUser: { id: 1, role: 'developer' },
    });

    expect(progress[0].total_tasks).toBe(1);
    expect(progress[0].completed_tasks).toBe(1);
  });

  test('getReportData builds the github report from connected repositories', async () => {
    jest.spyOn(githubService, 'getUserRepos').mockResolvedValue([
      { id: 1, full_name: 'ahmed/devsync', open_issues: 3, total_prs: 5, recent_commits: 7 },
    ]);
    global.fetch.mockResolvedValue(jsonResponse({ connected: true }));

    const report = await dashboardService.getReportData('github', 'week', { forceRefresh: true });

    expect(report.summary.repos).toBe(1);
    expect(report.summary.open_issues).toBe(3);
    expect(report.summary.total_prs).toBe(5);
    expect(report.summary.recent_commits).toBe(7);
    expect(report.details).toHaveLength(1);
  });

  test('getReportData returns an empty github report when not connected', async () => {
    const reposSpy = jest.spyOn(githubService, 'getUserRepos');
    global.fetch.mockResolvedValue(jsonResponse({ connected: false }));

    const report = await dashboardService.getReportData('github', 'week', { forceRefresh: true });

    expect(reposSpy).not.toHaveBeenCalled();
    expect(report.summary.repos).toBe(0);
    expect(report.details).toEqual([]);
  });

  test('getDeveloperProgressStats scopes a team lead to their projects', async () => {
    jest.spyOn(taskService, 'getTasksPaginated').mockResolvedValue({
      items: [
        { id: 10, project_id: 100, assigned_to: 2, status: 'done', updated_at: new Date().toISOString() },
        { id: 11, project_id: 999, assigned_to: 3, status: 'todo', updated_at: new Date().toISOString() },
      ],
      pagination: { page: 1, pages: 1, total: 2 },
    });
    jest.spyOn(projectService, 'getAllProjects').mockResolvedValue([
      { id: 100, created_by: 9, team_members: [{ id: 2, role: 'developer' }, { id: 9, role: 'team_lead' }] },
    ]);
    global.fetch.mockResolvedValue(jsonResponse({
      users: [
        { id: 2, name: 'Dev', role: 'developer' },
        { id: 3, name: 'Outsider', role: 'developer' },
        { id: 9, name: 'Lead', role: 'team_lead' },
      ],
    }));

    const progress = await dashboardService.getDeveloperProgressStats({
      currentUser: { id: 9, role: 'team_lead' },
    });

    const names = progress.map((entry) => entry.name);
    expect(names).toContain('Dev');
    expect(names).toContain('Lead');
    expect(names).not.toContain('Outsider');
    expect(progress.find((entry) => entry.name === 'Dev').total_tasks).toBe(1);
  });

  test('getDeveloperProgressStats returns nothing for a team lead without projects', async () => {
    jest.spyOn(taskService, 'getTasksPaginated').mockResolvedValue({
      items: [],
      pagination: { page: 1, pages: 1, total: 0 },
    });
    jest.spyOn(projectService, 'getAllProjects').mockResolvedValue([
      { id: 100, created_by: 77, team_members: [] },
    ]);
    global.fetch.mockResolvedValue(jsonResponse({ users: [{ id: 2, name: 'Dev', role: 'developer' }] }));

    const progress = await dashboardService.getDeveloperProgressStats({
      currentUser: { id: 9, role: 'team_lead' },
    });

    expect(progress).toEqual([]);
  });
});
