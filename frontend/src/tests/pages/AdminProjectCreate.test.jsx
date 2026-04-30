import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import AdminProjectCreate from '../../pages/AdminProjectCreate';
import { projectService, taskService } from '../../services/utils/api';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../../services/utils/api', () => ({
  projectService: {
    createProject: jest.fn(),
  },
  taskService: {
    getUsers: jest.fn(),
  },
}));

jest.mock('../../components/LoadingSpinner', () => () => <div>Loading spinner</div>);

jest.mock('../../components/ProjectForm', () => ({ onSubmit, onCancel, users, submitting }) => (
  <div>
    <div>Users loaded: {users.length}</div>
    <button
      onClick={() =>
        onSubmit({
          name: 'Launch Plan',
          description: 'Product launch work',
          status: 'active',
          github_repo: '',
          team_members: [],
        })
      }
      disabled={submitting}
    >
      Submit mock project
    </button>
    <button onClick={onCancel}>Cancel</button>
  </div>
));

describe('AdminProjectCreate page', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    mockNavigate.mockReset();
    projectService.createProject.mockReset();
    taskService.getUsers.mockReset();

    taskService.getUsers.mockResolvedValue([
      { id: 1, name: 'Alex' },
    ]);

    projectService.createProject.mockResolvedValue({
      project: { id: 12 },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('loads users and submits a project payload', async () => {
    render(<AdminProjectCreate />);

    expect(await screen.findByText('Users loaded: 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /submit mock project/i }));

    await waitFor(() => {
      expect(projectService.createProject).toHaveBeenCalledWith({
        name: 'Launch Plan',
        description: 'Product launch work',
        status: 'active',
      });
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/projects/12');
    });
  });

  test('navigates back to list when API returns no project id', async () => {
    projectService.createProject.mockResolvedValueOnce({});

    render(<AdminProjectCreate />);

    expect(await screen.findByText('Users loaded: 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /submit mock project/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/admin/projects');
    });
  });

  test('shows error message when project creation fails', async () => {
    projectService.createProject.mockRejectedValueOnce(new Error('create failed'));

    render(<AdminProjectCreate />);

    expect(await screen.findByText('Users loaded: 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /submit mock project/i }));

    expect(await screen.findByText(/create failed/i)).toBeInTheDocument();
  });

  test('shows user load error but keeps form usable', async () => {
    taskService.getUsers.mockRejectedValueOnce(new Error('users failed'));

    render(<AdminProjectCreate />);

    expect(
      await screen.findByText(/Failed to load users. You can still create a project without assigning team members./i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit mock project/i })).toBeInTheDocument();
  });
});
