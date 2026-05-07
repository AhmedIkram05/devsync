import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import DeveloperProgress from '../../pages/DeveloperProgress';
import { dashboardService } from '../../services/utils/api';
import { useAuth } from '../../context/AuthContext';

jest.mock('../../services/utils/api', () => ({
  dashboardService: {
    getDeveloperProgressStats: jest.fn(),
  },
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../components/LoadingSpinner', () => () => <div>Loading spinner</div>);

const renderDeveloperProgress = () => {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <DeveloperProgress />
    </MemoryRouter>
  );
};

describe('DeveloperProgress page', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    useAuth.mockReturnValue({
      currentUser: { id: 1, role: 'admin' },
      is: jest.fn().mockReturnValue(false),
    });

    dashboardService.getDeveloperProgressStats.mockReset();
    dashboardService.getDeveloperProgressStats.mockResolvedValue([
      {
        id: 1,
        name: 'Alice',
        role: 'developer',
        total_tasks: 4,
        completed_tasks: 0,
        active_tasks: 4,
        recent_tasks: [
          {
            id: 44,
            title: 'Implement metrics export',
            status: 'in_progress',
            progress: 50,
          },
        ],
      },
      {
        id: 2,
        name: 'Bob',
        role: 'developer',
        total_tasks: 2,
        completed_tasks: 2,
        active_tasks: 0,
        recent_tasks: [
          {
            id: 45,
            title: 'Finalize sprint summary',
            status: 'completed',
            progress: 100,
          },
        ],
      },
    ]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders developers, progress metrics, and recent task links', async () => {
    renderDeveloperProgress();

    expect(await screen.findByText('Developer Progress')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Implement metrics export')).toBeInTheDocument();
    expect(screen.getByText('Finalize sprint summary')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /Implement metrics export/i })).toHaveAttribute('href', '/tasks/44');
    expect(screen.getAllByRole('link', { name: /View All Tasks/i }).length).toBeGreaterThan(0);
  });

  test('filters developers by active and completed task states', async () => {
    renderDeveloperProgress();

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /With Active Tasks/i }));

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /With Completed Tasks/i }));

    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
  });

  test('shows empty filter result message when no developers match', async () => {
    dashboardService.getDeveloperProgressStats.mockResolvedValue([
      {
        id: 6,
        name: 'No Tasks Dev',
        role: 'developer',
        total_tasks: 0,
        completed_tasks: 0,
        active_tasks: 0,
        recent_tasks: [],
      },
    ]);

    renderDeveloperProgress();

    expect(await screen.findByText('No Tasks Dev')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /With Active Tasks/i }));

    expect(screen.getByText(/No developers match the selected filter/i)).toBeInTheDocument();
  });

  test('shows error state when progress fetch fails', async () => {
    dashboardService.getDeveloperProgressStats.mockRejectedValueOnce(new Error('progress failed'));

    renderDeveloperProgress();

    expect(await screen.findByText(/Failed to load developer progress data. Please try again./i)).toBeInTheDocument();
  });

  test('shows team lead scope message when the user is a team lead', async () => {
    useAuth.mockReturnValue({
      currentUser: { id: 2, role: 'team_lead' },
      is: (role) => role === 'team_lead',
    });

    renderDeveloperProgress();

    expect(await screen.findByText(/Showing developers on your shared project teams/i)).toBeInTheDocument();
  });
});
