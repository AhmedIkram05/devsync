import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import BasicDashboard from '../../pages/BasicDashboard';
import { dashboardService } from '../../services/utils/api';
import { useAuth } from '../../context/AuthContext';

jest.mock('../../services/utils/api', () => ({
  dashboardService: {
    getBasicDashboardStats: jest.fn(),
  },
  userService: {
    getAllUsers: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../components/LoadingSpinner', () => () => <div>Loading spinner</div>);

const renderDashboard = () => {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <BasicDashboard />
    </MemoryRouter>
  );
};

describe('BasicDashboard page', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    useAuth.mockReturnValue({
      currentUser: {
        id: 11,
        token: 'token-11',
        github_connected: true,
        github_username: 'octocat',
      },
      is: jest.fn().mockReturnValue(false),
      can: jest.fn().mockReturnValue(false),
    });

    dashboardService.getBasicDashboardStats.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders dashboard data, task cards, github activity, projects, and deadlines', async () => {
    dashboardService.getBasicDashboardStats.mockResolvedValue({
      taskCounts: {
        assigned: 7,
        inProgress: 3,
        completed: 4,
        dueSoon: 2,
      },
      recentTasks: [
        { id: 1, title: 'Implement webhook retry' },
        { id: 2, title: 'Refine dashboard metrics' },
      ],
      githubActivity: [
        {
          type: 'issue',
          title: 'Fix callback race condition',
          url: 'https://github.com/org/devsync/issues/42',
          repo: 'org/devsync',
          date: '2099-01-04T00:00:00.000Z',
        },
      ],
      projects: [
        {
          id: 22,
          name: 'DevSync Platform',
          status: 'active',
          task_count: 18,
          completion_percentage: 65,
        },
      ],
      upcomingDeadlines: [
        {
          id: 77,
          title: 'Finalize integration report',
          due_date: '2099-01-10T00:00:00.000Z',
          priority: 'high',
        },
      ],
    });

    renderDashboard();

    expect(await screen.findByText('My Dashboard')).toBeInTheDocument();
    expect(await screen.findByText('Implement webhook retry')).toBeInTheDocument();
    expect(screen.getByText('Refine dashboard metrics')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Create Task/i })).toBeInTheDocument();

    expect(screen.getByText('Assigned Tasks')).toBeInTheDocument();
    expect(screen.getAllByText('In Progress').length).toBeGreaterThan(0);
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Tasks Due Soon')).toBeInTheDocument();

    expect(screen.getByText('DevSync Platform')).toBeInTheDocument();
    expect(screen.getByText('Finalize integration report')).toBeInTheDocument();
  });

  test('renders disconnected and empty states when no dashboard records are available', async () => {
    useAuth.mockReturnValue({
      currentUser: {
        id: 12,
        token: 'token-12',
        github_connected: false,
        github_username: '',
      },
      is: jest.fn().mockReturnValue(false),
      can: jest.fn().mockReturnValue(false),
    });

    dashboardService.getBasicDashboardStats.mockResolvedValue({
      taskCounts: {
        assigned: 0,
        inProgress: 0,
        completed: 0,
        dueSoon: 0,
      },
      recentTasks: [],
      githubActivity: [],
      projects: [],
      upcomingDeadlines: [],
    });

    renderDashboard();

    expect(await screen.findByText(/No tasks found/i)).toBeInTheDocument();
    expect(screen.getByText(/You are not assigned to any projects yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No upcoming deadlines/i)).toBeInTheDocument();
  });

  test('shows error state and supports retry after failed dashboard load', async () => {
    dashboardService.getBasicDashboardStats
      .mockRejectedValueOnce(new Error('dashboard unavailable'))
      .mockResolvedValueOnce({
        taskCounts: {
          assigned: 1,
          inProgress: 1,
          completed: 0,
          dueSoon: 0,
        },
        recentTasks: [{ id: 9, title: 'Retry fetched task' }],
        githubActivity: [],
        projects: [],
        upcomingDeadlines: [],
      });

    renderDashboard();

    expect(await screen.findByText(/Failed to load dashboard data. Please try again./i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => {
      expect(dashboardService.getBasicDashboardStats).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByText('Retry fetched task')).toBeInTheDocument();
  });

  test('refresh button triggers a re-fetch when dashboard is already loaded', async () => {
    dashboardService.getBasicDashboardStats.mockResolvedValue({
      taskCounts: {
        assigned: 2,
        inProgress: 1,
        completed: 1,
        dueSoon: 1,
      },
      recentTasks: [],
      githubActivity: [],
      projects: [],
      upcomingDeadlines: [],
    });

    renderDashboard();

    expect(await screen.findByText('My Dashboard')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

    await waitFor(() => {
      expect(dashboardService.getBasicDashboardStats).toHaveBeenCalledTimes(2);
    });
  });

  test('renders Team Overview for users with team_lead role', async () => {
    const { userService } = require('../../services/utils/api');
    userService.getAllUsers.mockResolvedValue([
      { id: 1, name: 'Alice Developer', role: 'developer' },
      { id: 2, name: 'Bob Developer', role: 'developer' },
    ]);

    useAuth.mockReturnValue({
      currentUser: { id: 10, name: 'Lead User', role: 'team_lead' },
      is: (role) => role === 'team_lead',
      can: jest.fn(),
    });

    dashboardService.getBasicDashboardStats.mockResolvedValue({
      taskCounts: { assigned: 0, inProgress: 0, completed: 0, dueSoon: 0 },
      recentTasks: [],
      githubActivity: [],
      projects: [],
      upcomingDeadlines: [],
    });

    renderDashboard();

    expect(await screen.findByText('Team Overview')).toBeInTheDocument();
    expect(await screen.findByText('Alice Developer')).toBeInTheDocument();
    expect(screen.getByText('Bob Developer')).toBeInTheDocument();
    expect(screen.getByText('View Progress')).toBeInTheDocument();
  });
});
