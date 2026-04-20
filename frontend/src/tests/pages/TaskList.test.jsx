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
    useAuth.mockReturnValue({ currentUser: { id: 5, role: 'client' } });
    taskService.getAllTasks.mockRejectedValue(new Error('network failure'));

    render(<TaskList />);

    expect(await screen.findByText(/Failed to load tasks/i)).toBeInTheDocument();
  });
});
