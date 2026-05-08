import {
  normalizeTaskReportDetails,
} from '../../../services/utils/api';

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
