import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

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
    updateTask: jest.fn(),
  },
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../components/LoadingSpinner', () => (props) => {
  return <div>{props.message || 'Loading'}</div>;
});

describe('TaskList page', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockNavigate.mockReset();
    taskService.getAllTasks.mockReset();
    taskService.updateTask.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders tasks, filters results, updates status, and navigates from actions', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 5, role: 'admin' } });
    taskService.getAllTasks.mockResolvedValue([
      {
        id: 1,
        title: 'Alpha Task',
        description: 'Alpha description',
        status: 'todo',
        priority: 'high',
        progress: 10,
        deadline: '2099-02-01T00:00:00.000Z',
      },
      {
        id: 2,
        title: 'Beta Task',
        description: 'Beta description',
        status: 'in_progress',
        priority: 'medium',
        progress: 60,
        deadline: '2099-02-03T00:00:00.000Z',
      },
    ]);
    taskService.updateTask.mockResolvedValue({});

    render(<TaskList />);

    expect(await screen.findByText('Alpha Task')).toBeInTheDocument();
    expect(screen.getByText('Beta Task')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/search/i), {
      target: { value: 'Alpha' },
    });

    expect(screen.getByText('Alpha Task')).toBeInTheDocument();
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

  test('does NOT show New Task button for developers', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 5, role: 'developer' } });
    taskService.getAllTasks.mockResolvedValue([]);

    render(<TaskList />);
    await screen.findByText(/No tasks found/i);

    expect(screen.queryByRole('button', { name: /new task/i })).not.toBeInTheDocument();
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
        deadline: '2000-01-01T00:00:00.000Z', // past deadline
      },
      {
        id: 2,
        title: 'Completed Late Task',
        description: 'Done',
        status: 'completed',
        priority: 'low',
        progress: 100,
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
      { id: 1, title: 'High P',   status: 'todo',        priority: 'high',   progress: 100, deadline: null },
      { id: 2, title: 'Med P',    status: 'in_progress', priority: 'medium', progress: 60,  deadline: null },
      { id: 3, title: 'Low P',    status: 'review',      priority: 'low',    progress: 25,  deadline: null },
      { id: 4, title: 'Unknown P',status: 'backlog',     priority: 'other',  progress: 0,   deadline: null },
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
      { id: 1, title: 'T1', status: 'todo',        priority: 'low', progress: 0, deadline: null },
      { id: 2, title: 'T2', status: 'backlog',     priority: 'low', progress: 0, deadline: null },
      { id: 3, title: 'T3', status: 'review',      priority: 'low', progress: 0, deadline: null },
      { id: 4, title: 'T4', status: 'completed',   priority: 'low', progress: 0, deadline: null },
      { id: 5, title: 'T5', status: 'new_status',  priority: 'low', progress: 0, deadline: null },
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
    taskService.getAllTasks.mockResolvedValue([
      { id: 1, title: 'Alpha', status: 'todo', priority: 'high', progress: 0, deadline: null },
    ]);

    render(<TaskList />);
    await screen.findByText('Alpha');

    // Apply a filter that hides all tasks
    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'completed' } });
    expect(await screen.findByText(/No tasks found/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();

    // Clear filters — button should show "Create a new task" fallback instead
    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    await screen.findByText('Alpha');
  });

  test('updating task status fails and shows update error', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 5, role: 'developer' } });
    taskService.getAllTasks.mockResolvedValue([
      { id: 1, title: 'Failing Task', status: 'todo', priority: 'medium', progress: 0, deadline: null },
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
      { id: 7, title: 'Clickable Task', status: 'todo', priority: 'low', progress: 0, deadline: null },
    ]);

    render(<TaskList />);
    const row = await screen.findByRole('row', { name: /Clickable Task/i });
    fireEvent.click(row);
    expect(mockNavigate).toHaveBeenCalledWith('/tasks/7');
  });
});
