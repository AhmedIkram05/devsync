import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import AdminProjectEdit from '../../pages/AdminProjectEdit';
import { projectService, taskService } from '../../services/utils/api';

const mockNavigate = jest.fn();
const mockUseParams = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useParams: () => mockUseParams(),
}));

jest.mock('../../services/utils/api', () => ({
  projectService: {
    getProjectById: jest.fn(),
    updateProject: jest.fn(),
    deleteProject: jest.fn(),
  },
  taskService: {
    getUsers: jest.fn(),
  },
}));

jest.mock('../../components/LoadingSpinner', () => () => <div>Loading spinner</div>);

jest.mock('../../components/ProjectForm', () => ({ onSubmit, onCancel, users, initialData, submitting }) => (
  <div>
    <div>Project form for: {initialData?.name}</div>
    <div>Users loaded: {users.length}</div>
    <button
      onClick={() =>
        onSubmit({
          name: 'Updated Project',
          description: 'Updated description',
          status: 'completed',
          github_repo: 'https://github.com/org/updated',
          team_members: [4],
        })
      }
      disabled={submitting}
    >
      Submit mock update
    </button>
    <button onClick={onCancel}>Cancel mock form</button>
  </div>
));

describe('AdminProjectEdit page', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    mockNavigate.mockReset();
    mockUseParams.mockReturnValue({ id: '42' });

    projectService.getProjectById.mockReset();
    projectService.updateProject.mockReset();
    projectService.deleteProject.mockReset();
    taskService.getUsers.mockReset();

    projectService.getProjectById.mockResolvedValue({
      id: 42,
      name: 'Core Revamp',
      description: 'Initial desc',
      status: 'active',
      team_members: [],
    });

    taskService.getUsers.mockResolvedValue([
      { id: 4, name: 'Avery' },
    ]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('loads project and users before rendering the form', async () => {
    render(<AdminProjectEdit />);

    expect(await screen.findByText(/Project form for: Core Revamp/i)).toBeInTheDocument();
    expect(screen.getByText('Users loaded: 1')).toBeInTheDocument();
  });

  test('submits updates and navigates back to project details', async () => {
    render(<AdminProjectEdit />);

    expect(await screen.findByText(/Submit mock update/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /submit mock update/i }));

    await waitFor(() => {
      expect(projectService.updateProject).toHaveBeenCalledWith('42', {
        name: 'Updated Project',
        description: 'Updated description',
        status: 'completed',
        github_repo: 'https://github.com/org/updated',
        team_members: [4],
      });
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/projects/42');
    });
  });

  test('deletes project after confirmation', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);

    render(<AdminProjectEdit />);

    expect(await screen.findByText(/Delete Project/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /delete project/i }));

    await waitFor(() => {
      expect(projectService.deleteProject).toHaveBeenCalledWith('42');
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/admin/projects');
    });
  });

  test('does not delete project when confirmation is cancelled', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(false);

    render(<AdminProjectEdit />);

    expect(await screen.findByText(/Delete Project/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /delete project/i }));

    expect(projectService.deleteProject).not.toHaveBeenCalled();
  });
});
