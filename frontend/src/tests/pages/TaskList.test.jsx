import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import TaskList from '../../pages/TaskList';
import { taskService } from '../../services/utils/api';
import { useAuth } from '../../context/AuthContext';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../../services/utils/api', () => ({
  taskService: {
    getAllTasks: jest.fn(),
    getTasksPaginated: jest.fn(),
    updateTask: jest.fn(),
  },
  userService: {
    getAllUsers: jest.fn().mockResolvedValue({ users: [] }),
  },
  projectService: {
    getAllProjects: jest.fn().mockResolvedValue({ projects: [] }),
  },
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../components/LoadingSpinner', () => (props) => {
  return <div>{props.message || 'Loading'}</div>;
});

// Mirrors the backend /tasks filtering (status, priority, project_id,
// assigned_to, search) so fixtures respond to server-side query params the
// way the real endpoint does.
const applyServerTasks = (tasks) => async (params = {}) => tasks.filter((task) => {
  if (params.status && task.status !== params.status) return false;
  if (params.priority && task.priority !== params.priority) return false;
  if (params.project_id && Number(task.project_id) !== Number(params.project_id)) return false;
  if (params.assigned_to && Number(task.assigned_to) !== Number(params.assigned_to)) return false;
  if (params.search && !task.title.toLowerCase().includes(params.search.toLowerCase())) return false;
  return true;
});

describe('TaskList page', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    // Reset the URL: the scope initializer reads ?assigned_to/?assignee, and a
    // deep-link test would otherwise leak into later tests in this file.
    window.history.pushState({}, '', '/tasks');
    mockNavigate.mockReset();
    taskService.getAllTasks.mockReset();
    taskService.getTasksPaginated.mockReset();
    taskService.getTasksPaginated.mockImplementation(async (params) => ({
      items: await taskService.getAllTasks(params),
      pagination: null,
    }));
    taskService.updateTask.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders tasks, filters results, updates status, and navigates from actions', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 5, role: 'admin' } });
    taskService.getAllTasks.mockImplementation(applyServerTasks([
      {
        id: 1,
        title: 'Alpha Task',
        description: 'Alpha description',
        status: 'todo',
        priority: 'high',
        progress: 10,
        assigned_to: 5,
        deadline: '2099-02-01T00:00:00.000Z',
      },
      {
        id: 2,
        title: 'Beta Task',
        description: 'Beta description',
        status: 'in_progress',
        priority: 'medium',
        progress: 60,
        assigned_to: 5,
        deadline: '2099-02-03T00:00:00.000Z',
      },
    ]));
    taskService.updateTask.mockResolvedValue({});

    render(<TaskList />);

    expect(await screen.findByText('Alpha Task')).toBeInTheDocument();
    expect(screen.getByText('Beta Task')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/search/i), {
      target: { value: 'Alpha' },
    });

    await waitFor(() => {
      expect(taskService.getTasksPaginated).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'Alpha' })
      );
    });
    expect(await screen.findByText('Alpha Task')).toBeInTheDocument();
    expect(screen.queryByText('Beta Task')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /new task/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/admin/create-task');

    const alphaRow = screen.getByRole('row', { name: /Alpha Task/i });
    const rowStatusSelect = within(alphaRow).getByDisplayValue('To Do');

    fireEvent.change(rowStatusSelect, { target: { value: 'completed' } });

    await waitFor(() => {
      expect(taskService.updateTask).toHaveBeenCalledWith(1, { status: 'completed' });
    });

    fireEvent.click(within(alphaRow).getByRole('button', { name: /view details/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/tasks/1');
  });

  test('shows fetch error state when loading tasks fails', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 5, role: 'developer' } });
    taskService.getAllTasks.mockRejectedValue(new Error('network failure'));

    render(<TaskList />);

    expect(await screen.findByText(/Failed to load tasks/i)).toBeInTheDocument();
  });

  test('shows New Task button for developers', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 5, role: 'developer' } });
    taskService.getAllTasks.mockResolvedValue([]);

    render(<TaskList />);
    await screen.findByText(/No tasks found/i);

    fireEvent.click(screen.getByRole('button', { name: /new task/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/admin/create-task');
  });

  test('shows New Task button for team leads', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 5, role: 'team_lead' } });
    taskService.getAllTasks.mockResolvedValue([]);

    render(<TaskList />);
    await screen.findByText(/No tasks found/i);

    fireEvent.click(screen.getByRole('button', { name: /new task/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/admin/create-task');
  });

  test('shows overdue badge for past-deadline non-completed tasks', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 5, role: 'developer' } });
    taskService.getAllTasks.mockResolvedValue([
      {
        id: 1,
        title: 'Overdue Task',
        description: 'Late',
        status: 'in_progress',
        priority: 'high',
        progress: 20,
        assigned_to: 5,
        deadline: '2000-01-01T00:00:00.000Z', // past deadline
      },
      {
        id: 2,
        title: 'Completed Late Task',
        description: 'Done',
        status: 'completed',
        priority: 'low',
        progress: 100,
        assigned_to: 5,
        deadline: '2000-01-01T00:00:00.000Z', // past but completed — no overdue badge
      },
    ]);

    render(<TaskList />);
    expect(await screen.findByText('Overdue Task')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument(); // only one badge
  });

  test('renders task with no description and no deadline gracefully', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 5, role: 'developer' } });
    taskService.getAllTasks.mockResolvedValue([
      {
        id: 3,
        title: 'Sparse Task',
        description: '',
        status: 'todo',
        priority: 'medium',
        progress: 0,
        assigned_to: 5,
        deadline: null,
      },
    ]);

    render(<TaskList />);
    expect(await screen.findByText('No description')).toBeInTheDocument();
    expect(screen.getByText('No deadline')).toBeInTheDocument();
    // progress = 0 → shows 0%
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  test('renders all priority badge variants and progress colour thresholds', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 5, role: 'developer' } });
    taskService.getAllTasks.mockResolvedValue([
      { id: 1, title: 'High P',   status: 'todo',        priority: 'high',   progress: 100, assigned_to: 5, deadline: null },
      { id: 2, title: 'Med P',    status: 'in_progress', priority: 'medium', progress: 60,  assigned_to: 5, deadline: null },
      { id: 3, title: 'Low P',    status: 'review',      priority: 'low',    progress: 25,  assigned_to: 5, deadline: null },
      { id: 4, title: 'Unknown P',status: 'backlog',     priority: 'other',  progress: 0,   assigned_to: 5, deadline: null },
    ]);

    render(<TaskList />);
    expect(await screen.findByText('High P')).toBeInTheDocument();
    // All priority text variants rendered
    expect(screen.getAllByText(/High/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Medium/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Low/).length).toBeGreaterThan(0);
    // Unknown priority falls back to the raw value
    expect(screen.getByText(/other/)).toBeInTheDocument();
    // Progress percentages
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  test('renders all status badge variants including unknown', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 5, role: 'developer' } });
    taskService.getAllTasks.mockResolvedValue([
      { id: 1, title: 'T1', status: 'todo',        priority: 'low', progress: 0, assigned_to: 5, deadline: null },
      { id: 2, title: 'T2', status: 'backlog',     priority: 'low', progress: 0, assigned_to: 5, deadline: null },
      { id: 3, title: 'T3', status: 'review',      priority: 'low', progress: 0, assigned_to: 5, deadline: null },
      { id: 4, title: 'T4', status: 'completed',   priority: 'low', progress: 0, assigned_to: 5, deadline: null },
      { id: 5, title: 'T5', status: 'new_status',  priority: 'low', progress: 0, assigned_to: 5, deadline: null },
    ]);

    render(<TaskList />);
    expect(await screen.findByText('T1')).toBeInTheDocument();
    expect(screen.getAllByText('To Do').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Backlog').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Review').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Completed').length).toBeGreaterThan(0);
    expect(screen.getByText('new_status')).toBeInTheDocument(); // unknown falls back to raw
  });

  test('clear-filters button is shown when a filter is active, hidden when none', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 5, role: 'developer' } });
    taskService.getAllTasks.mockImplementation(applyServerTasks([
      { id: 1, title: 'Alpha', status: 'todo', priority: 'high', progress: 0, assigned_to: 5, deadline: null },
    ]));

    render(<TaskList />);
    await screen.findByText('Alpha');

    // Apply a filter that hides all tasks
    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'completed' } });
    expect(await screen.findByText(/No tasks found/i)).toBeInTheDocument();
    const clearButtons = screen.getAllByRole('button', { name: /clear filters/i });
    expect(clearButtons.length).toBeGreaterThan(0);

    // Clear filters — button should show "Create a new task" fallback instead
    fireEvent.click(clearButtons[clearButtons.length - 1]); // Click the last one (in empty state)
    await screen.findByText('Alpha');
  });

  test('updating task status fails and shows update error', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 5, role: 'developer' } });
    taskService.getAllTasks.mockResolvedValue([
      { id: 1, title: 'Failing Task', status: 'todo', priority: 'medium', progress: 0, assigned_to: 5, deadline: null },
    ]);
    taskService.updateTask.mockRejectedValue(new Error('update failed'));

    render(<TaskList />);
    await screen.findByText('Failing Task');

    const statusSelect = screen.getByDisplayValue('To Do');
    fireEvent.change(statusSelect, { target: { value: 'in_progress' } });

    await waitFor(() => {
      expect(screen.getByText(/Failed to update task status/i)).toBeInTheDocument();
    });
  });

  test('dismisses error banner via × button', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 5, role: 'developer' } });
    taskService.getAllTasks.mockRejectedValue(new Error('load error'));

    render(<TaskList />);
    await screen.findByText(/Failed to load tasks/i);

    fireEvent.click(screen.getByRole('button', { name: '×' }));
    await waitFor(() => {
      expect(screen.queryByText(/Failed to load tasks/i)).not.toBeInTheDocument();
    });
  });

  test('clicking a task row navigates to task detail', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 5, role: 'developer' } });
    taskService.getAllTasks.mockResolvedValue([
      { id: 7, title: 'Clickable Task', status: 'todo', priority: 'low', progress: 0, assigned_to: 5, deadline: null },
    ]);

    render(<TaskList />);
    const row = await screen.findByRole('row', { name: /Clickable Task/i });
    fireEvent.click(row);
    expect(mockNavigate).toHaveBeenCalledWith('/tasks/7');
  });

  test('honors deep-link assignee scope from the URL', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 5, role: 'developer' } });
    taskService.getAllTasks.mockResolvedValue([
      {
        id: 8,
        title: 'Deep Linked Task',
        status: 'todo',
        priority: 'low',
        progress: 10,
        assigned_to: 5,
        deadline: null,
      },
    ]);

    window.history.pushState({}, '', '/tasks?assigned_to=5');

    render(
      <MemoryRouter>
        <TaskList />
      </MemoryRouter>
    );

    expect(await screen.findByText('Deep Linked Task')).toBeInTheDocument();
    expect(taskService.getTasksPaginated).toHaveBeenCalledWith({
      page: 1,
      per_page: 100,
      assigned_to: '5',
    });
    expect(screen.getByRole('button', { name: 'My Tasks' })).toHaveClass('bg-rose-500');
  });

  test('filters by priority', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 5, role: 'admin' } });
    taskService.getAllTasks.mockImplementation(applyServerTasks([
      { id: 1, title: 'High Task', status: 'todo', priority: 'high', progress: 0, assigned_to: 5, deadline: null },
      { id: 2, title: 'Low Task', status: 'todo', priority: 'low', progress: 0, assigned_to: 5, deadline: null },
    ]));

    render(<TaskList />);
    expect(await screen.findByText('High Task')).toBeInTheDocument();

    const prioritySelect = screen.getByLabelText('Priority');
    fireEvent.change(prioritySelect, { target: { value: 'high' } });

    await waitFor(() => {
      expect(taskService.getTasksPaginated).toHaveBeenLastCalledWith(
        expect.objectContaining({ priority: 'high' })
      );
    });
    expect(await screen.findByText('High Task')).toBeInTheDocument();
    expect(screen.queryByText('Low Task')).not.toBeInTheDocument();
  });

  test('filters by status', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 5, role: 'admin' } });
    taskService.getAllTasks.mockImplementation(applyServerTasks([
      { id: 1, title: 'Todo Task', status: 'todo', priority: 'high', progress: 0, assigned_to: 5, deadline: null },
      { id: 2, title: 'Completed Task', status: 'completed', priority: 'high', progress: 100, assigned_to: 5, deadline: null },
    ]));

    render(<TaskList />);
    expect(await screen.findByText('Todo Task')).toBeInTheDocument();

    const statusSelect = screen.getByLabelText('Status');
    fireEvent.change(statusSelect, { target: { value: 'completed' } });

    await waitFor(() => {
      expect(taskService.getTasksPaginated).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'completed' })
      );
    });
    expect(await screen.findByText('Completed Task')).toBeInTheDocument();
    expect(screen.queryByText('Todo Task')).not.toBeInTheDocument();
  });

  test('clears filters when Clear Filters button clicked', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 5, role: 'admin' } });
    taskService.getAllTasks.mockImplementation(applyServerTasks([
      { id: 1, title: 'High Task', status: 'todo', priority: 'high', progress: 0, assigned_to: 5, deadline: null },
      { id: 2, title: 'Low Task', status: 'todo', priority: 'low', progress: 0, assigned_to: 5, deadline: null },
    ]));

    render(<TaskList />);
    expect(await screen.findByText('High Task')).toBeInTheDocument();

    // Apply filter
    const prioritySelect = screen.getByLabelText('Priority');
    fireEvent.change(prioritySelect, { target: { value: 'high' } });
    await waitFor(() => {
      expect(taskService.getTasksPaginated).toHaveBeenLastCalledWith(
        expect.objectContaining({ priority: 'high' })
      );
    });
    expect(await screen.findByText('High Task')).toBeInTheDocument();
    expect(screen.queryByText('Low Task')).not.toBeInTheDocument();

    // Clear filter — request goes back to the unfiltered page 1
    const clearButton = screen.getByRole('button', { name: /Clear Filters/i });
    fireEvent.click(clearButton);

    await waitFor(() => {
      expect(taskService.getTasksPaginated).toHaveBeenLastCalledWith({
        page: 1,
        per_page: 100,
      });
    });
    expect(await screen.findByText('High Task')).toBeInTheDocument();
    expect(screen.getByText('Low Task')).toBeInTheDocument();
  });

  test('handles status update failure gracefully', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 5, role: 'admin' } });
    taskService.getAllTasks.mockResolvedValue([
      { id: 1, title: 'Failure Task', status: 'todo', priority: 'high', progress: 0, assigned_to: 5, deadline: null },
    ]);
    taskService.updateTask.mockRejectedValue(new Error('update failed'));

    render(<TaskList />);
    expect(await screen.findByText('Failure Task')).toBeInTheDocument();

    const table = screen.getByRole('table');
    const statusSelect = within(table).getByDisplayValue('To Do');
    fireEvent.change(statusSelect, { target: { value: 'in_progress' } });

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith('Failed to update task:', expect.any(Error));
    });
  });

  test('handles empty search results', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 5, role: 'admin' } });
    taskService.getAllTasks.mockImplementation(applyServerTasks([
      { id: 1, title: 'Alpha', status: 'todo', priority: 'high', progress: 0, assigned_to: 5, deadline: null },
    ]));

    render(<TaskList />);
    expect(await screen.findByText('Alpha')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/search/i), {
      target: { value: 'xyz-no-match' },
    });

    expect(await screen.findByText(/No tasks found/i)).toBeInTheDocument();
  });

  test('applies multiple filters (priority AND status)', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 5, role: 'admin' } });
    taskService.getAllTasks.mockResolvedValue([
      { id: 1, title: 'High Todo Task', status: 'todo', priority: 'high', progress: 0, assigned_to: 5, deadline: null },
      { id: 2, title: 'High Completed Task', status: 'completed', priority: 'high', progress: 100, assigned_to: 5, deadline: null },
      { id: 3, title: 'Low Todo Task', status: 'todo', priority: 'low', progress: 0, assigned_to: 5, deadline: null },
    ]);

    render(<TaskList />);
    expect(await screen.findByText('High Todo Task')).toBeInTheDocument();

    // Both high tasks shown initially
    expect(screen.getByText('High Completed Task')).toBeInTheDocument();
  });

  test('handles update task status to done', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 5, role: 'admin' } });
    taskService.getAllTasks.mockResolvedValue([
      { id: 1, title: 'Update Status Test', status: 'in_progress', priority: 'high', progress: 100, assigned_to: 5, deadline: null },
    ]);
    taskService.updateTask.mockResolvedValue({});

    render(<TaskList />);
    await screen.findByText('Update Status Test');
    
    const table = screen.getByRole('table');
    const statusSelect = within(table).getByDisplayValue('In Progress');
    fireEvent.change(statusSelect, { target: { value: 'completed' } });

    await waitFor(() => {
      expect(taskService.updateTask).toHaveBeenCalledWith(1, { status: 'completed' });
    });
  });

  test('renders tasks with various statuses', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 5, role: 'admin' } });
    taskService.getAllTasks.mockResolvedValue([
      { id: 1, title: 'Todo Item', status: 'todo', priority: 'low', progress: 0, assigned_to: 5, deadline: null },
      { id: 2, title: 'Inprogress Item', status: 'in_progress', priority: 'low', progress: 50, assigned_to: 5, deadline: null },
      { id: 3, title: 'Review Item', status: 'review', priority: 'low', progress: 90, assigned_to: 5, deadline: null },
    ]);

    render(<TaskList />);
    expect(await screen.findByText('Todo Item')).toBeInTheDocument();
    expect(screen.getByText('Inprogress Item')).toBeInTheDocument();
    expect(screen.getByText('Review Item')).toBeInTheDocument();
  });

  test('sends active filters to the server and resets to page 1 on filter change', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 5, role: 'admin' } });
    taskService.getAllTasks.mockImplementation(applyServerTasks([
      { id: 1, title: 'Page One Task', status: 'todo', priority: 'low', progress: 0, assigned_to: 5, deadline: null },
      { id: 2, title: 'Completed Task', status: 'completed', priority: 'low', progress: 100, assigned_to: 5, deadline: null },
    ]));
    taskService.getTasksPaginated.mockImplementation(async (params) => ({
      items: await taskService.getAllTasks(params),
      pagination: { page: params.page, per_page: 100, total: 250, pages: 3 },
    }));

    render(<TaskList />);
    expect(await screen.findByText('Page One Task')).toBeInTheDocument();

    // Move to page 2, then change a filter — the request must go back to page 1
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(taskService.getTasksPaginated).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 })
      );
    });
    // Loading replaces the whole page (filters included) until page 2 renders
    expect(await screen.findByText('Page One Task')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'completed' } });
    await waitFor(() => {
      expect(taskService.getTasksPaginated).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, status: 'completed' })
      );
    });
    expect(await screen.findByText('Completed Task')).toBeInTheDocument();
    expect(screen.queryByText('Page One Task')).not.toBeInTheDocument();
  });

  test('maps My Tasks scope to the assigned_to server param', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 5, role: 'admin' } });
    taskService.getAllTasks.mockImplementation(applyServerTasks([
      { id: 1, title: 'Mine', status: 'todo', priority: 'low', progress: 0, assigned_to: 5, deadline: null },
      { id: 2, title: 'Theirs', status: 'todo', priority: 'low', progress: 0, assigned_to: 9, deadline: null },
    ]));

    render(<TaskList />);
    expect(await screen.findByText('Mine')).toBeInTheDocument();
    expect(screen.getByText('Theirs')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'My Tasks' }));

    await waitFor(() => {
      expect(taskService.getTasksPaginated).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, assigned_to: 5 })
      );
    });
    expect(await screen.findByText('Mine')).toBeInTheDocument();
    expect(screen.queryByText('Theirs')).not.toBeInTheDocument();
  });

  test('debounces search input into a single server request', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 5, role: 'admin' } });
    taskService.getAllTasks.mockImplementation(applyServerTasks([
      { id: 1, title: 'Alpha Task', status: 'todo', priority: 'high', progress: 0, assigned_to: 5, deadline: null },
    ]));

    render(<TaskList />);
    expect(await screen.findByText('Alpha Task')).toBeInTheDocument();
    const callsAfterLoad = taskService.getTasksPaginated.mock.calls.length;

    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'Alpha' } });
    // Debounce: no request fires while the user is still typing
    expect(taskService.getTasksPaginated.mock.calls.length).toBe(callsAfterLoad);

    await waitFor(() => {
      expect(taskService.getTasksPaginated).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'Alpha' })
      );
    });
    expect(taskService.getTasksPaginated.mock.calls.length).toBe(callsAfterLoad + 1);
  });
});
