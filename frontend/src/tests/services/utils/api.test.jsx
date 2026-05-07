import { normalizeTaskReportDetails } from '../../../services/utils/api';

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
});
