import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import AdminDashboard from '../../pages/AdminDashboard';
import { dashboardService } from '../../services/utils/api';
import { useAuth } from '../../context/AuthContext';

jest.mock('../../services/utils/api', () => ({
  dashboardService: {
    getAdminDashboardStats: jest.fn(),
  },
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../components/LoadingSpinner', () => () => <div>Loading spinner</div>);

const adminStatsPayload = {
  projects: {
    total: 5,
    change: 12,
  },
  tasks: {
    active: 14,
    activeChange: 6,
    completed: 22,
    completedChange: -4,
  },
  users: {
    total: 8,
    change: 0,
  },
  recentProjects: [
    {
      id: 1,
      name: 'DevSync Core',
      status: 'active',
      created_at: '2099-01-01T00:00:00.000Z',
      task_count: 12,
    },
  ],
};

const renderAdminDashboard = () => {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AdminDashboard />
    </MemoryRouter>
  );
};

describe('AdminDashboard page', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    useAuth.mockReturnValue({
      currentUser: {
        id: 1,
        token: 'token-1',
        role: 'admin',
      },
    });

    dashboardService.getAdminDashboardStats.mockReset();
    dashboardService.getAdminDashboardStats.mockResolvedValue(adminStatsPayload);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders admin stats and recent projects', async () => {
    renderAdminDashboard();

    expect(await screen.findByText('Admin Dashboard')).toBeInTheDocument();
    expect(await screen.findByText('Total Projects')).toBeInTheDocument();
    expect(screen.getByText('Active Tasks')).toBeInTheDocument();
    expect(screen.getByText('Completed Tasks')).toBeInTheDocument();
    expect(screen.getByText('Team Members')).toBeInTheDocument();

    expect(screen.getByText('DevSync Core')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /DevSync Core/i })).toHaveAttribute('href', '/projects/1');
  });

  test('refetches dashboard data when time range changes and when refresh is clicked', async () => {
    renderAdminDashboard();

    await waitFor(() => {
      expect(dashboardService.getAdminDashboardStats).toHaveBeenCalledWith('week');
    });

    fireEvent.change(screen.getByDisplayValue('Last 7 days'), {
      target: { value: 'month' },
    });

    await waitFor(() => {
      expect(dashboardService.getAdminDashboardStats).toHaveBeenCalledWith('month');
    });

    const callsBeforeRefresh = dashboardService.getAdminDashboardStats.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

    await waitFor(() => {
      expect(dashboardService.getAdminDashboardStats.mock.calls.length).toBeGreaterThan(callsBeforeRefresh);
    });
  });

  test('shows fetch error and retries successfully', async () => {
    dashboardService.getAdminDashboardStats
      .mockRejectedValueOnce(new Error('dashboard failed'))
      .mockResolvedValueOnce(adminStatsPayload);

    renderAdminDashboard();

    expect(await screen.findByText(/Failed to load dashboard data. Please try again./i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => {
      expect(dashboardService.getAdminDashboardStats).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByText('Total Projects')).toBeInTheDocument();
  });
});
