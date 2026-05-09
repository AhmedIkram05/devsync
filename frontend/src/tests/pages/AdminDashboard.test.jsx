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
  projectService: {
    getAllProjects: jest.fn(),
  },
  userService: {
    getAllUsers: jest.fn(),
  },
  auditLogService: {
    getLogs: jest.fn(),
  },
  reportService: {
    getSavedReports: jest.fn(),
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
    require('../../services/utils/api').projectService.getAllProjects.mockReset();
    require('../../services/utils/api').projectService.getAllProjects.mockResolvedValue([]);
    require('../../services/utils/api').userService.getAllUsers.mockReset();
    require('../../services/utils/api').userService.getAllUsers.mockResolvedValue([]);
    require('../../services/utils/api').auditLogService.getLogs.mockReset();
    require('../../services/utils/api').auditLogService.getLogs.mockResolvedValue({ logs: [] });
    require('../../services/utils/api').reportService.getSavedReports.mockReset();
    require('../../services/utils/api').reportService.getSavedReports.mockResolvedValue({ reports: [] });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders admin stats and recent projects', async () => {
    renderAdminDashboard();

    expect(await screen.findByText('Admin Dashboard')).toBeInTheDocument();
    // New KPI cards: Team Members, Incomplete Projects, Overdue Tasks, Tasks In Review
    expect(await screen.findByText('Team Members')).toBeInTheDocument();
    expect(screen.getByText('Active Projects')).toBeInTheDocument();
    expect(screen.getByText('Overdue Tasks')).toBeInTheDocument();
    expect(screen.getByText('Tasks In Review')).toBeInTheDocument();

    expect(screen.getByText('DevSync Core')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /DevSync Core/i })).toHaveAttribute('href', '/projects/1');
  });

  test('renders review tasks in the task breakdown', async () => {
    dashboardService.getAdminDashboardStats.mockResolvedValueOnce({
      projects: { total: 5 },
      tasks: {
        total: 10,
        backlog: 2,
        todo: 2,
        in_progress: 3,
        review: 1,
        done: 2,
      },
      users: { total: 8 },
      recentProjects: [
        {
          id: 99,
          name: 'Recent Project',
          status: 'active',
          created_at: '2099-01-01T00:00:00.000Z',
          task_count: 4,
        },
      ],
    });

    renderAdminDashboard();

    expect(await screen.findByText('In Review')).toBeInTheDocument();
    expect(screen.getByText('Backlog')).toBeInTheDocument();
    expect(screen.getAllByText('1', { selector: '.text-slate-400' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('2', { selector: '.text-slate-400' }).length).toBeGreaterThan(0);
  });

  test('shows create task action and refreshes when clicked', async () => {
    renderAdminDashboard();

    await waitFor(() => {
      expect(dashboardService.getAdminDashboardStats).toHaveBeenCalledWith('week');
    });

    expect(screen.getByRole('link', { name: /create task/i })).toHaveAttribute('href', '/admin/create-task');

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

    expect(await screen.findByText('Team Members')).toBeInTheDocument();
  });

  test('renders team lead dashboard sections and report data from the team lead branch', async () => {
    useAuth.mockReturnValue({
      currentUser: {
        id: 9,
        token: 'token-9',
        role: 'team_lead',
      },
    });

    dashboardService.getAdminDashboardStats.mockResolvedValueOnce({
      projects: { total: 3 },
      tasks: {
        active: 4,
        review: 2,
        overdue: 1,
        completed: 5,
      },
      users: { total: 6 },
      my_assigned_tasks: [
        {
          id: 44,
          title: 'Lead Task',
          status: 'in_progress',
          description: 'Team lead task',
          project_name: 'Team Lead Project',
          deadline: '2099-03-01T00:00:00.000Z',
          progress: 40,
        },
      ],
      recentProjects: [],
      recentReports: [],
      team_lead_kpis: {
        in_review_tasks: 2,
        due_soon_tasks: 3,
        overdue_not_complete_tasks: 1,
        current_projects: 4,
      },
    });
    require('../../services/utils/api').reportService.getSavedReports.mockResolvedValue({
      reports: [
        { id: 1, report_type: 'tasks', generatedAt: '2099-01-01T00:00:00.000Z' },
      ],
    });

    renderAdminDashboard();

    expect(await screen.findByText('Management Dashboard')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Loading spinner')).not.toBeInTheDocument();
    });
    expect(screen.getByText('In Review Tasks')).toBeInTheDocument();
    expect(screen.getByText('Due Soon')).toBeInTheDocument();
    expect(screen.getByText('Overdue & Active')).toBeInTheDocument();
    expect(screen.getByText('Active Projects')).toBeInTheDocument();
    expect(screen.getByText('Lead Task')).toBeInTheDocument();
    expect(screen.getByText('No recent audit logs found.')).toBeInTheDocument();
    expect(screen.getByText('Task Report')).toBeInTheDocument();
  });

  test('handles multiple saved reports', async () => {
    require('../../services/utils/api').reportService.getSavedReports.mockResolvedValue({
      reports: [
        { id: 1, report_type: 'tasks', generatedAt: '2099-01-01T00:00:00.000Z' },
        { id: 2, report_type: 'performance', generatedAt: '2099-01-02T00:00:00.000Z' },
      ],
    });

    dashboardService.getAdminDashboardStats.mockResolvedValueOnce(adminStatsPayload);

    renderAdminDashboard();

    expect(await screen.findByText('Recent Created Reports')).toBeInTheDocument();
  });

  test('renders projects section when projects data is available', async () => {
    dashboardService.getAdminDashboardStats.mockResolvedValueOnce({
      ...adminStatsPayload,
      recentProjects: [
        {
          id: 2,
          name: 'Another Project',
          status: 'on_hold',
          created_at: '2099-02-01T00:00:00.000Z',
          task_count: 5,
        },
      ],
    });

    renderAdminDashboard();

    expect(await screen.findByText('Another Project')).toBeInTheDocument();
  });

  test('shows "My Tasks" section with assigned tasks', async () => {
    dashboardService.getAdminDashboardStats.mockResolvedValueOnce({
      ...adminStatsPayload,
      my_assigned_tasks: [
        {
          id: 100,
          title: 'My Assigned Task',
          status: 'in_progress',
          description: 'Task for admin',
          project_name: 'Project',
        },
      ],
    });

    renderAdminDashboard();

    expect(await screen.findByText('My Assigned Task')).toBeInTheDocument();
  });

  test('shows "Recent Audit Logs" section title', async () => {
    dashboardService.getAdminDashboardStats.mockResolvedValueOnce(adminStatsPayload);

    renderAdminDashboard();

    expect(await screen.findByText('Recent Audit Logs')).toBeInTheDocument();
  });
});
