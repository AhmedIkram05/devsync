import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import TaskCreation from '../../pages/TaskCreation';
import { taskService } from '../../services/utils/api';
import { useAuth } from '../../context/AuthContext';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../../services/utils/api', () => ({
  taskService: {
    getUsers: jest.fn(),
    getProjects: jest.fn(),
    createTask: jest.fn(),
  },
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../components/LoadingSpinner', () => () => <div>Loading spinner</div>);

jest.mock('../../components/TaskForm', () => ({ onSubmit, users, projects, assigneeLocked }) => (
  <div>
    <div>users loaded: {users.length}</div>
    <div>projects loaded: {projects.length}</div>
    <div>assignee locked: {String(assigneeLocked)}</div>
    <button
      onClick={() =>
        onSubmit({
          title: 'New Task',
          description: 'Task details',
          status: 'in_progress',
          priority: 'high',
          assignee: '4',
          project: '7',
          deadline: '2099-03-10',
        })
      }
    >
      Submit mock task
    </button>
  </div>
));

describe('TaskCreation page', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    mockNavigate.mockReset();
    useAuth.mockReturnValue({
      currentUser: { id: 11, name: 'Developer One', role: 'developer' },
    });
    taskService.getUsers.mockReset();
    taskService.getProjects.mockReset();
    taskService.createTask.mockReset();

    taskService.getProjects.mockResolvedValue([
      { id: 7, name: 'Core Platform' },
    ]);
    taskService.createTask.mockResolvedValue({
      task: { id: 99 },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('loads users/projects and renders task form', async () => {
    render(<TaskCreation />);

    expect(await screen.findByText('Create New Task')).toBeInTheDocument();
    expect(await screen.findByText('users loaded: 1')).toBeInTheDocument();
    expect(await screen.findByText('projects loaded: 1')).toBeInTheDocument();
    expect(screen.getByText('assignee locked: true')).toBeInTheDocument();
  });

  test('submits formatted task payload and navigates to task details on success', async () => {
    render(<TaskCreation />);

    expect(await screen.findByText('Submit mock task')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /submit mock task/i }));

    await waitFor(() => {
      expect(taskService.createTask).toHaveBeenCalledWith({
        title: 'New Task',
        description: 'Task details',
        status: 'in_progress',
        priority: 'high',
        assigned_to: 11,
        project_id: '7',
        deadline: '2099-03-10T00:00:00.000Z',
      });
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/tasks/99', {
        state: { message: 'Task created successfully!' },
      });
    });
  });

  test('shows preload error when users/projects fetch fails', async () => {
    taskService.getProjects.mockRejectedValueOnce(new Error('projects failed'));

    render(<TaskCreation />);

    expect(
      await screen.findByText(/Failed to load users or projects. Some options may not be available./i)
    ).toBeInTheDocument();
  });

  test('shows task creation error when create request fails', async () => {
    taskService.createTask.mockRejectedValueOnce(new Error('create failed'));

    render(<TaskCreation />);

    expect(await screen.findByText('Submit mock task')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /submit mock task/i }));

    expect(await screen.findByText(/Failed to create task. Please try again./i)).toBeInTheDocument();
  });
});
