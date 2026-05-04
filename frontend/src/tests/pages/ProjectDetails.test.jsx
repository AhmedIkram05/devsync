import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import ProjectDetails from '../../pages/ProjectDetails';
import { useAuth } from '../../context/AuthContext';
import { projectService } from '../../services/utils/api';

const mockNavigate = jest.fn();
const mockUseParams = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useParams: () => mockUseParams(),
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../services/utils/api', () => ({
  projectService: {
    getProjectById: jest.fn(),
    getProjectTasks: jest.fn(),
  },
}));

const renderProjectDetails = () => {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProjectDetails />
    </MemoryRouter>
  );
};

describe('ProjectDetails page', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    mockNavigate.mockReset();
    mockUseParams.mockReturnValue({ id: '17' });

    useAuth.mockReturnValue({
      currentUser: {
        id: 1,
        role: 'admin',
      },
    });

    projectService.getProjectById.mockReset();
    projectService.getProjectTasks.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders project details, task table, and team members on success', async () => {
    projectService.getProjectById.mockResolvedValue({
      id: 17,
      name: 'Project Phoenix',
      description: '',
      status: 'active',
      created_at: '2099-01-01T00:00:00.000Z',
      updated_at: '2099-01-02T00:00:00.000Z',
      creator_name: 'Program Manager',
      github_repo: 'https://github.com/org/phoenix',
      team_members: [
        { id: 10, name: 'Alice', role: 'developer' },
        { id: 11, name: 'Bob', role: 'qa' },
      ],
    });

    projectService.getProjectTasks.mockResolvedValue([
      {
        id: 100,
        title: 'Create onboarding flow',
        description: 'Initial onboarding setup',
        status: 'todo',
        progress: 0,
        deadline: '2099-02-01T00:00:00.000Z',
      },
      {
        id: 101,
        title: 'Build API adapters',
        description: 'Integrate services',
        status: 'in_progress',
        progress: 70,
        deadline: '2099-02-02T00:00:00.000Z',
      },
      {
        id: 102,
        title: 'Finalize launch plan',
        description: 'Deployment checklist',
        status: 'done',
        progress: 100,
        deadline: '2099-02-03T00:00:00.000Z',
      },
    ]);

    renderProjectDetails();

    expect(screen.getByText(/Loading project details/i)).toBeInTheDocument();
    expect(await screen.findByText('Project Phoenix')).toBeInTheDocument();

    expect(screen.getByText('No description provided.')).toBeInTheDocument();
    expect(screen.getByText('To Do')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();

    expect(screen.getByText('Total Tasks: 3')).toBeInTheDocument();
    expect(screen.getByText('Completed: 1')).toBeInTheDocument();
    expect(screen.getByText('Created By: Program Manager')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /Open Repository/i })).toHaveAttribute(
      'href',
      'https://github.com/org/phoenix'
    );

    expect(screen.getByRole('link', { name: /Edit Project/i })).toHaveAttribute('href', '/admin/projects/17/edit');
    expect(screen.getAllByRole('link', { name: /View Task/i })[0]).toHaveAttribute('href', '/tasks/100');
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  test('shows empty-state sections when tasks are invalid and team list is empty', async () => {
    projectService.getProjectById.mockResolvedValue({
      id: 17,
      name: 'Project Atlas',
      status: 'active',
      created_at: null,
      updated_at: 'invalid-date',
      team_members: [],
    });
    projectService.getProjectTasks.mockResolvedValue({ not: 'an array' });

    renderProjectDetails();

    expect(await screen.findByText('Project Atlas')).toBeInTheDocument();
    expect(screen.getByText(/No tasks are currently associated with this project/i)).toBeInTheDocument();
    expect(screen.getByText(/No team members assigned to this project/i)).toBeInTheDocument();
  });

  test('shows not-found state and navigates admin fallback route', async () => {
    projectService.getProjectById.mockResolvedValue(null);
    projectService.getProjectTasks.mockResolvedValue([]);

    renderProjectDetails();

    expect(await screen.findByText(/Project not found or you do not have access/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /go back/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/admin/projects');
  });

  test('shows error state on fetch failure and navigates member fallback route', async () => {
    useAuth.mockReturnValue({
      currentUser: {
        id: 2,
        role: 'developer',
      },
    });

    projectService.getProjectById.mockRejectedValue(new Error('network failed'));
    projectService.getProjectTasks.mockResolvedValue([]);

    renderProjectDetails();

    expect(await screen.findByText(/Failed to load project details. Please try again./i)).toBeInTheDocument();
    expect(console.error).toHaveBeenCalledWith('Failed to load project details:', expect.any(Error));

    fireEvent.click(screen.getByRole('button', { name: /go back/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/clientdashboard');
  });

  test('hides edit link for non-admin users', async () => {
    useAuth.mockReturnValue({
      currentUser: {
        id: 2,
        role: 'developer',
      },
    });

    projectService.getProjectById.mockResolvedValue({
      id: 17,
      name: 'Project Atlas',
      description: 'Client view',
      status: 'active',
      team_members: [],
    });

    projectService.getProjectTasks.mockResolvedValue([]);

    renderProjectDetails();

    expect(await screen.findByText('Project Atlas')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Edit Project/i })).not.toBeInTheDocument();
  });
});
