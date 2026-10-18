import { taskService } from '../../../services/api/tasks';

jest.mock('../../../services/api/client', () => ({
  fetchWithAuth: jest.fn(),
}));

const { fetchWithAuth } = require('../../../services/api/client');

describe('taskService param + normalization branches', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getAllTasks builds string params with and without a leading "?"', async () => {
    fetchWithAuth.mockResolvedValue([]);

    await taskService.getAllTasks('?status=todo');
    expect(fetchWithAuth).toHaveBeenLastCalledWith('tasks?status=todo');

    await taskService.getAllTasks('status=done');
    expect(fetchWithAuth).toHaveBeenLastCalledWith('tasks?status=done');
  });

  test('getAllTasks builds object params and drops empty values', async () => {
    fetchWithAuth.mockResolvedValue({ tasks: [{ id: 1 }] });

    await taskService.getAllTasks({ status: 'todo', assignee: '', missing: null, undef: undefined });
    expect(fetchWithAuth).toHaveBeenLastCalledWith('tasks?status=todo');
  });

  test('getAllTasks skips the query string when every param is empty', async () => {
    fetchWithAuth.mockResolvedValue([]);

    await taskService.getAllTasks({ a: '', b: null });
    expect(fetchWithAuth).toHaveBeenLastCalledWith('tasks');
  });

  test('getAllTasks coerces a null response to []', async () => {
    fetchWithAuth.mockResolvedValue(null);

    await expect(taskService.getAllTasks()).resolves.toEqual([]);
  });

  test('getTasksPaginated surfaces the sibling pagination object', async () => {
    const pagination = { page: 1, per_page: 100, total: 1, pages: 1 };
    fetchWithAuth.mockResolvedValue({ tasks: [{ id: 1 }], pagination });

    await expect(taskService.getTasksPaginated({ page: 1, per_page: 100 })).resolves.toEqual({
      items: [{ id: 1 }],
      pagination,
    });
    expect(fetchWithAuth).toHaveBeenLastCalledWith('tasks?page=1&per_page=100');

    fetchWithAuth.mockResolvedValue([{ id: 2 }]);
    await expect(taskService.getTasksPaginated()).resolves.toEqual({ items: [{ id: 2 }], pagination: null });
    expect(fetchWithAuth).toHaveBeenLastCalledWith('tasks');
  });

  test('getTaskById falls back through null', async () => {
    fetchWithAuth.mockResolvedValue(null);
    await expect(taskService.getTaskById(5)).resolves.toBeNull();

    fetchWithAuth.mockResolvedValue({ task: { id: 5 } });
    await expect(taskService.getTaskById(5)).resolves.toEqual({ id: 5 });
  });

  test('getTaskComments normalizes object and null responses', async () => {
    fetchWithAuth.mockResolvedValue(null);
    await expect(taskService.getTaskComments(1)).resolves.toEqual([]);

    fetchWithAuth.mockResolvedValue({ comments: [{ id: 1 }] });
    await expect(taskService.getTaskComments(1)).resolves.toEqual([{ id: 1 }]);
  });

  test('getUsers and getProjects normalize null responses', async () => {
    fetchWithAuth.mockResolvedValue(null);

    await expect(taskService.getUsers()).resolves.toEqual([]);
    await expect(taskService.getProjects()).resolves.toEqual([]);
  });
});
