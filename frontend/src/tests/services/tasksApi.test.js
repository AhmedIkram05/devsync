import { tasksApi } from '../../services/api/tasksApi';
import { authApi } from '../../services/utils/auth';

jest.mock('../../services/utils/auth', () => ({
  authApi: {
    getCurrentUser: jest.fn(),
  },
}));

const buildResponse = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: jest.fn().mockResolvedValue(payload),
});

describe('tasksApi service', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    authApi.getCurrentUser.mockReset();
    authApi.getCurrentUser.mockReturnValue({
      id: 14,
      token: 'token-14',
    });

    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('fetches all tasks and single task by id using bearer token', async () => {
    global.fetch
      .mockResolvedValueOnce(buildResponse([{ id: 1, title: 'Task One' }]))
      .mockResolvedValueOnce(buildResponse({ id: 2, title: 'Task Two' }));

    const allTasks = await tasksApi.getAllTasks();
    const task = await tasksApi.getTaskById(2);

    expect(allTasks).toEqual([{ id: 1, title: 'Task One' }]);
    expect(task).toEqual({ id: 2, title: 'Task Two' });

    const [allTasksUrl, allTasksOptions] = global.fetch.mock.calls[0];
    expect(allTasksUrl).toContain('/api/v1/tasks');
    expect(allTasksOptions.headers.Authorization).toBe('Bearer token-14');

    expect(global.fetch.mock.calls[1][0]).toContain('/api/v1/tasks/2');
  });

  test('creates and updates tasks with request payloads', async () => {
    global.fetch
      .mockResolvedValueOnce(buildResponse({ id: 10, title: 'Created' }))
      .mockResolvedValueOnce(buildResponse({ id: 10, title: 'Updated' }));

    const createPayload = {
      title: 'Create Task',
      status: 'todo',
    };
    const updatePayload = {
      status: 'in_progress',
    };

    const created = await tasksApi.createTask(createPayload);
    const updated = await tasksApi.updateTask(10, updatePayload);

    expect(created).toEqual({ id: 10, title: 'Created' });
    expect(updated).toEqual({ id: 10, title: 'Updated' });

    const [createUrl, createOptions] = global.fetch.mock.calls[0];
    expect(createUrl).toContain('/api/v1/tasks');
    expect(createOptions.method).toBe('POST');
    expect(JSON.parse(createOptions.body)).toEqual(createPayload);

    const [updateUrl, updateOptions] = global.fetch.mock.calls[1];
    expect(updateUrl).toContain('/api/v1/tasks/10');
    expect(updateOptions.method).toBe('PUT');
    expect(JSON.parse(updateOptions.body)).toEqual(updatePayload);
  });

  test('deletes tasks and handles no-content response', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 204,
      json: jest.fn(),
    });

    const response = await tasksApi.deleteTask(6);

    expect(response).toEqual({});

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/v1/tasks/6');
    expect(options.method).toBe('DELETE');
  });

  test('adds task comments with wrapped comment payload', async () => {
    global.fetch.mockResolvedValue(buildResponse({ id: 33, comment: 'Looks good' }));

    const response = await tasksApi.addComment(9, 'Looks good');

    expect(response).toEqual({ id: 33, comment: 'Looks good' });

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/v1/tasks/9/comments');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ comment: 'Looks good' });
  });

  test('throws structured error for non-ok responses', async () => {
    global.fetch.mockResolvedValue(buildResponse({ message: 'Task not found' }, 404));

    await expect(tasksApi.getTaskById(404)).rejects.toMatchObject({
      status: 404,
      message: 'Task not found',
    });
  });

  test('rethrows network failures from fetch', async () => {
    global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(tasksApi.getAllTasks()).rejects.toThrow('Failed to fetch');
  });
});
