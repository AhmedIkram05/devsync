import {
  buildUserMap,
  buildProjectMap,
  fetchTaskList,
  fetchTaskListLookups,
} from '../../services/taskListService';

jest.mock('../../services/utils/api', () => ({
  taskService: { getAllTasks: jest.fn() },
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

  test('fetchTaskList defaults params and coerces non-array payloads', async () => {
    taskService.getAllTasks.mockResolvedValueOnce([{ id: 1 }]);
    await expect(fetchTaskList()).resolves.toEqual([{ id: 1 }]);
    expect(taskService.getAllTasks).toHaveBeenCalledWith(null);

    taskService.getAllTasks.mockResolvedValueOnce({ tasks: [{ id: 2 }] });
    await expect(fetchTaskList({ status: 'todo' })).resolves.toEqual([]);
  });

  test('fetchTaskListLookups degrades to empty maps when lookups fail', async () => {
    userService.getAllUsers.mockRejectedValue(new Error('users down'));
    projectService.getAllProjects.mockRejectedValue(new Error('projects down'));

    await expect(fetchTaskListLookups()).resolves.toEqual({ userMap: {}, projectMap: {} });
  });
});
