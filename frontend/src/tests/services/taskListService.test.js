import {
  buildUserMap,
  buildProjectMap,
  fetchTaskList,
  fetchTaskListPage,
  fetchTaskListLookups,
} from '../../services/taskListService';

jest.mock('../../services/utils/api', () => ({
  taskService: { getAllTasks: jest.fn(), getTasksPaginated: jest.fn() },
  userService: { getAllUsers: jest.fn() },
  projectService: { getAllProjects: jest.fn() },
}));

const { taskService, userService, projectService } = require('../../services/utils/api');

describe('taskListService branch coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('normalizes arrays, keyed payloads, and unknown shapes', () => {
    expect(buildUserMap([{ id: 1, name: 'Alice' }])).toEqual({ 1: 'Alice' });
    expect(buildUserMap({ users: [{ id: 2, name: 'Bob' }] })).toEqual({ 2: 'Bob' });
    expect(buildUserMap(null)).toEqual({});

    expect(buildProjectMap([{ id: 3, name: 'Proj' }])).toEqual({ 3: 'Proj' });
    expect(buildProjectMap({ projects: [{ id: 4, name: 'P2' }] })).toEqual({ 4: 'P2' });
    expect(buildProjectMap(undefined)).toEqual({});
  });

  test('fetchTaskListPage returns items + pagination and defaults params', async () => {
    const pagination = { page: 1, per_page: 100, total: 1, pages: 1 };
    taskService.getTasksPaginated.mockResolvedValueOnce({ items: [{ id: 1 }], pagination });
    await expect(fetchTaskListPage()).resolves.toEqual({ items: [{ id: 1 }], pagination });
    expect(taskService.getTasksPaginated).toHaveBeenCalledWith(null);

    taskService.getTasksPaginated.mockResolvedValueOnce({ items: null, pagination: null });
    await expect(fetchTaskListPage({ status: 'todo' })).resolves.toEqual({ items: [], pagination: null });
  });

  test('fetchTaskList delegates to the paginated fetch and returns items only', async () => {
    taskService.getTasksPaginated.mockResolvedValueOnce({
      items: [{ id: 3 }],
      pagination: { page: 2, per_page: 100, total: 101, pages: 2 },
    });
    await expect(fetchTaskList({ page: 2 })).resolves.toEqual([{ id: 3 }]);
    expect(taskService.getTasksPaginated).toHaveBeenCalledWith({ page: 2 });
  });

  test('fetchTaskListLookups degrades to empty maps when lookups fail', async () => {
    userService.getAllUsers.mockRejectedValue(new Error('users down'));
    projectService.getAllProjects.mockRejectedValue(new Error('projects down'));

    await expect(fetchTaskListLookups()).resolves.toEqual({ userMap: {}, projectMap: {} });
  });

  test('fetchTaskListLookups pages past the backend 100-item per_page cap', async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, name: `U${i + 1}` }));
    userService.getAllUsers
      .mockResolvedValueOnce(fullPage)
      .mockResolvedValueOnce([{ id: 101, name: 'U101' }]);
    projectService.getAllProjects.mockResolvedValueOnce([{ id: 7, name: 'P7' }]);

    const { userMap, projectMap } = await fetchTaskListLookups();

    expect(userMap[1]).toBe('U1');
    expect(userMap[101]).toBe('U101');
    expect(projectMap[7]).toBe('P7');
    expect(userService.getAllUsers).toHaveBeenNthCalledWith(1, '?page=1&per_page=100');
    expect(userService.getAllUsers).toHaveBeenNthCalledWith(2, '?page=2&per_page=100');
    expect(projectService.getAllProjects).toHaveBeenCalledWith({ page: 1, per_page: 100 });
  });
});
