import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import AdminProjects from '../../pages/AdminProjects';
import { projectService } from '../../services/utils/api';

jest.mock('../../services/utils/api', () => ({
  projectService: {
    getAllProjects: jest.fn(),
  },
}));

jest.mock('../../components/LoadingSpinner', () => () => <div>Loading spinner</div>);

const renderAdminProjects = () => {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AdminProjects />
    </MemoryRouter>
  );
};

describe('AdminProjects page', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    projectService.getAllProjects.mockReset();
    projectService.getAllProjects.mockResolvedValue([
      {
        id: 1,
        name: 'Core Platform',
        description: 'Main roadmap work',
        status: 'active',
        created_at: '2099-01-01T00:00:00.000Z',
        updated_at: '2099-01-05T00:00:00.000Z',
        github_repo: 'https://github.com/org/core',
      },
      {
        id: 2,
        name: 'Mobile Sprint',
        description: 'Mobile dashboard updates',
        status: 'planning',
        created_at: '2099-01-02T00:00:00.000Z',
        updated_at: '2099-01-06T00:00:00.000Z',
        github_repo: '',
      },
    ]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders projects table and supports search filtering', async () => {
    renderAdminProjects();

    expect(await screen.findByText('Projects')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Create Project/i })).toHaveAttribute('href', '/admin/projects/new');
    expect(screen.getByText('Core Platform')).toBeInTheDocument();
    expect(screen.getByText('Mobile Sprint')).toBeInTheDocument();
    const editLinks = screen.getAllByRole('link', { name: 'Edit' });
    expect(editLinks[0]).toHaveAttribute('href', '/admin/projects/1/edit');

    fireEvent.change(screen.getByPlaceholderText(/Search by name, status, or description/i), {
      target: { value: 'core' },
    });

    expect(screen.getByText('Core Platform')).toBeInTheDocument();
    expect(screen.queryByText('Mobile Sprint')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Search by name, status, or description/i), {
      target: { value: 'unknown-value' },
    });

    expect(screen.getByText(/No projects found/i)).toBeInTheDocument();
  });

  test('refresh button re-fetches project list', async () => {
    renderAdminProjects();

    expect(await screen.findByText('Core Platform')).toBeInTheDocument();

    const initialCalls = projectService.getAllProjects.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

    await waitFor(() => {
      expect(projectService.getAllProjects.mock.calls.length).toBeGreaterThan(initialCalls);
    });
  });

  test('shows load error and recovers on successful refresh', async () => {
    projectService.getAllProjects
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValueOnce([
        {
          id: 10,
          name: 'Recovered Project',
          description: 'Recovered list after retry',
          status: 'active',
          created_at: '2099-02-01T00:00:00.000Z',
          updated_at: '2099-02-01T00:00:00.000Z',
          github_repo: '',
        },
      ]);

    renderAdminProjects();

    expect(await screen.findByText(/Failed to load projects. Please try again./i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

    expect(await screen.findByText('Recovered Project')).toBeInTheDocument();
  });
});
