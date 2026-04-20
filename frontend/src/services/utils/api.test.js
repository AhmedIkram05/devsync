import { fetchWithAuth, notificationService, taskService } from './api';

const buildJsonResponse = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {
    get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
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

  test('fetchWithAuth includes localStorage bearer token', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 1, token: 'token-123' }));
    global.fetch.mockResolvedValue(buildJsonResponse({ success: true }));

    const response = await fetchWithAuth('tasks');

    expect(response).toEqual({ success: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/v1/tasks');
    expect(options.headers.Authorization).toBe('Bearer token-123');
  });

  test('taskService.getAllTasks normalizes malformed tasks payload', async () => {
    global.fetch.mockResolvedValue(buildJsonResponse({ tasks: { id: 1 } }));

    const tasks = await taskService.getAllTasks();

    expect(tasks).toEqual([]);
  });

  test('notificationService.getNotifications degrades gracefully on connection failure', async () => {
    global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    const notifications = await notificationService.getNotifications();

    expect(notifications).toEqual([]);
  });
});
