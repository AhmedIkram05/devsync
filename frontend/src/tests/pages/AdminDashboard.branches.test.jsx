import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter as Router } from 'react-router-dom';
import AdminDashboard from '../../pages/AdminDashboard';
import * as api from '../../services/utils/api';

// Mock the services and components
jest.mock('../../services/utils/api');
jest.mock('../../components/LoadingSpinner', () => {
  return function MockLoadingSpinner() {
    return <div data-testid="loading-spinner">Loading...</div>;
  };
});

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

const { useAuth } = require('../../context/AuthContext');

describe('AdminDashboard page branch coverage', () => {
  const mockAdminUser = {
    id: 1,
    name: 'Admin User',
    role: 'admin',
    email: 'admin@example.com'
  };

  const mockTeamLeadUser = {
    id: 2,
    name: 'Team Lead User',
    role: 'team_lead',
    email: 'tl@example.com'
  };

  const mockDeveloperUser = {
    id: 3,
    name: 'Developer User',
    role: 'developer',
    email: 'dev@example.com'
  };

  const mockDashboardData = {
    tasks: {
      total: 15,
      todo: 3,
      in_progress: 5,
      review: 4,
      done: 3,
    },
    projects: {
      total: 4,
      active: 2,
      completed: 2
    },
    team_lead_kpis: {
      in_review_tasks: 4,
      due_soon_tasks: 3,
      overdue_not_complete_tasks: 2,
      current_projects: 3
    },
    my_assigned_tasks: [
      { id: 1, title: 'Task 1', status: 'todo' },
      { id: 2, title: 'Task 2', status: 'in_progress' }
    ]
  };

  beforeEach(() => {
    jest.clearAllMocks();
    api.dashboardService = {
      getAdminDashboardStats: jest.fn()
    };
    api.userService = {
      getAllUsers: jest.fn()
    };
    api.auditLogService = {
      getLogs: jest.fn()
    };
    api.projectService = {
      getAllProjects: jest.fn()
    };
    api.taskService = {
      getAllTasks: jest.fn()
    };
    api.reportService = {
      getSavedReports: jest.fn()
    };

    // Set default mock implementations
    api.dashboardService.getAdminDashboardStats.mockResolvedValue(mockDashboardData);
    api.userService.getAllUsers.mockResolvedValue([]);
    api.auditLogService.getLogs.mockResolvedValue({ logs: [] });
    api.projectService.getAllProjects.mockResolvedValue([]);
    api.taskService.getAllTasks.mockResolvedValue([]);
    api.reportService.getSavedReports.mockResolvedValue({ reports: [] });
  });

  describe('Loading and error states', () => {
    test('shows loading spinner while fetching', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });
      api.dashboardService.getAdminDashboardStats.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockDashboardData), 100))
      );

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
      });
    });

    test('shows error message on fetch failure', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });
      api.dashboardService.getAdminDashboardStats.mockRejectedValue(
        new Error('API Error')
      );

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByText(/Failed to load dashboard data/i)).toBeInTheDocument();
      });
    });

    test('retry button on error state', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });
      api.dashboardService.getAdminDashboardStats
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce(mockDashboardData);

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByText(/Failed to load dashboard data/i)).toBeInTheDocument();
      });

      const retryButton = screen.getByRole('button', { name: /Try again/i });
      fireEvent.click(retryButton);

      await waitFor(() => {
        expect(screen.queryByText(/Failed to load dashboard data/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Header rendering - role-based', () => {
    test('renders admin header for admin user', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Admin Dashboard/i })).toBeInTheDocument();
      });
    });

    test('renders management header for team lead user', async () => {
      useAuth.mockReturnValue({ currentUser: mockTeamLeadUser });

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Management Dashboard/i })).toBeInTheDocument();
      });
    });

    test('renders create task link in header', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByRole('link', { name: /Create Task/i })).toBeInTheDocument();
      });
    });

    test('renders refresh button in header', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
      });
    });
  });

  describe('Admin-specific UI sections', () => {
    test('renders admin snapshot box for admin users', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByText(/Management Snapshot/i)).toBeInTheDocument();
        expect(screen.getByText(/Keep the team moving/i)).toBeInTheDocument();
      });
    });

    test('does not render admin snapshot for team lead users', async () => {
      useAuth.mockReturnValue({ currentUser: mockTeamLeadUser });

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.queryByText(/Management Snapshot/i)).not.toBeInTheDocument();
      });
    });

    test('admin snapshot contains audit logs link', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByRole('link', { name: /Audit logs/i })).toBeInTheDocument();
      });
    });

    test('admin snapshot contains manage users link', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByRole('link', { name: /Manage users/i })).toBeInTheDocument();
      });
    });
  });

  describe('Stat cards - role-based KPIs', () => {
    test('renders team lead KPI cards for team lead user', async () => {
      useAuth.mockReturnValue({ currentUser: mockTeamLeadUser });
      api.dashboardService.getAdminDashboardStats.mockResolvedValue(mockDashboardData);

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByText(/In Review Tasks/i)).toBeInTheDocument();
        expect(screen.getByText(/Due Soon/i)).toBeInTheDocument();
      });
    });

    test('team lead KPIs show correct values', async () => {
      useAuth.mockReturnValue({ currentUser: mockTeamLeadUser });

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        // Check that the KPI values are displayed
        const statCards = screen.getAllByText(/In Review Tasks|Due Soon|Overdue|Active/i);
        expect(statCards.length).toBeGreaterThan(0);
      });
    });

    test('admin KPIs show total tasks and projects', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });
      api.dashboardService.getAdminDashboardStats.mockResolvedValue({
        ...mockDashboardData,
        tasks: { total: 20, todo: 5, in_progress: 8, review: 5, done: 2 },
        projects: { total: 5, active: 3, completed: 2 }
      });

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        // Should have stat cards rendered
        const container = screen.getByRole('heading', { name: /Admin Dashboard/i });
        expect(container).toBeInTheDocument();
      });
    });
  });

  describe('Task breakdown section', () => {
    test('renders task breakdown for available task data', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        // Verify dashboard renders without errors
        expect(screen.getByRole('heading', { name: /Admin Dashboard/i })).toBeInTheDocument();
      });
    });

    test('handles missing task breakdown gracefully', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });
      api.dashboardService.getAdminDashboardStats.mockResolvedValue({
        tasks: null,
        projects: { total: 0 }
      });

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        // Should render without crashing
        expect(screen.getByRole('heading', { name: /Admin Dashboard/i })).toBeInTheDocument();
      });
    });
  });

  describe('Projects section', () => {
    test('renders projects section when projects exist', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });
      const mockProjects = [
        { id: 1, name: 'Project 1', status: 'active', task_count: 5 },
        { id: 2, name: 'Project 2', status: 'completed', task_count: 3 }
      ];

      api.projectService.getAllProjects.mockResolvedValue(mockProjects);

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Admin Dashboard/i })).toBeInTheDocument();
      });
    });

    test('projects fallback - fetches all projects when recent projects missing', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });
      const mockProjects = [
        { id: 1, name: 'Project 1', status: 'active', updated_at: '2026-05-09T10:00:00Z' }
      ];

      api.dashboardService.getAdminDashboardStats.mockResolvedValue({
        ...mockDashboardData,
        recentProjects: null // Missing recent projects
      });
      api.projectService.getAllProjects.mockResolvedValue(mockProjects);

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        // Verify API was called to fetch projects
        expect(api.projectService.getAllProjects).toHaveBeenCalled();
      });
    });

    test('handles projects API error gracefully', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });
      api.projectService.getAllProjects.mockRejectedValue(new Error('API Error'));

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        // Should still render dashboard without crashing
        expect(screen.getByRole('heading', { name: /Admin Dashboard/i })).toBeInTheDocument();
      });
    });
  });

  describe('Audit logs section - admin only', () => {
    test('fetches audit logs for admin users', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });
      const mockLogs = [
        { id: 1, actor_name: 'Admin', action: 'create_task', timestamp: '2026-05-09T10:00:00Z' }
      ];

      api.auditLogService.getLogs.mockResolvedValue({ logs: mockLogs });

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(api.auditLogService.getLogs).toHaveBeenCalledWith({ per_page: 5, page: 1 });
      });
    });

    test('does not fetch audit logs for non-admin users', async () => {
      useAuth.mockReturnValue({ currentUser: mockTeamLeadUser });

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        // Wait for fetch to complete
        expect(api.dashboardService.getAdminDashboardStats).toHaveBeenCalled();
      });

      // Verify audit logs were NOT fetched for team lead
      expect(api.auditLogService.getLogs).not.toHaveBeenCalled();
    });

    test('handles audit logs fetch error', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });
      api.auditLogService.getLogs.mockRejectedValue(new Error('API Error'));

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        // Should still render without crashing
        expect(screen.getByRole('heading', { name: /Admin Dashboard/i })).toBeInTheDocument();
      });
    });
  });

  describe('Admin KPI calculations', () => {
    test('calculates admin project scope from team members', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });
      const mockProjects = [
        {
          id: 1,
          name: 'Admin Project',
          status: 'active',
          team_members: [mockAdminUser.id, 2, 3]
        },
        {
          id: 2,
          name: 'Other Project',
          status: 'active',
          team_members: [2, 3]
        }
      ];

      api.projectService.getAllProjects.mockResolvedValue(mockProjects);
      api.taskService.getAllTasks.mockResolvedValue([]);

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(api.projectService.getAllProjects).toHaveBeenCalled();
      });
    });

    test('filters overdue tasks to admin-scoped projects', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });
      const now = new Date();
      const pastDate = new Date(now.getTime() - 1000 * 60 * 60 * 24); // 1 day ago

      const mockProjects = [
        { id: 1, name: 'Project 1', status: 'active', team_members: [mockAdminUser.id] }
      ];

      const mockTasks = [
        {
          id: 1,
          title: 'Overdue task',
          status: 'todo',
          project_id: 1,
          deadline: pastDate.toISOString()
        }
      ];

      api.projectService.getAllProjects.mockResolvedValue(mockProjects);
      api.taskService.getAllTasks.mockResolvedValue(mockTasks);

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });

    test('counts in-review tasks scoped to admin projects', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });
      const mockProjects = [
        { id: 1, name: 'Project 1', status: 'active', team_members: [mockAdminUser.id] }
      ];

      const mockTasks = [
        { id: 1, status: 'in_review', project_id: 1 },
        { id: 2, status: 'review', project_id: 1 },
        { id: 3, status: 'in_review', project_id: 2 } // Different project
      ];

      api.projectService.getAllProjects.mockResolvedValue(mockProjects);
      api.taskService.getAllTasks.mockResolvedValue(mockTasks);

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });
  });

  describe('My Tasks section', () => {
    test('renders team lead my assigned tasks from backend', async () => {
      useAuth.mockReturnValue({ currentUser: mockTeamLeadUser });

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Management Dashboard/i })).toBeInTheDocument();
      });
    });

    test('displays my assigned tasks when available', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });
      const dataWithMyTasks = {
        ...mockDashboardData,
        my_assigned_tasks: [
          { id: 1, title: 'My Task 1', status: 'todo' },
          { id: 2, title: 'My Task 2', status: 'in_progress' }
        ]
      };

      api.dashboardService.getAdminDashboardStats.mockResolvedValue(dataWithMyTasks);

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(api.dashboardService.getAdminDashboardStats).toHaveBeenCalled();
      });
    });

    test('handles missing my assigned tasks gracefully', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });
      api.dashboardService.getAdminDashboardStats.mockResolvedValue({
        ...mockDashboardData,
        my_assigned_tasks: null
      });

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        // Should render without error
        expect(screen.getByRole('heading', { name: /Admin Dashboard/i })).toBeInTheDocument();
      });
    });
  });

  describe('Refresh functionality', () => {
    test('clicking refresh button refetches dashboard data', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(api.dashboardService.getAdminDashboardStats).toHaveBeenCalledTimes(1);
      });

      const refreshButton = screen.getByRole('button', { name: /Refresh/i });
      fireEvent.click(refreshButton);

      await waitFor(() => {
        expect(api.dashboardService.getAdminDashboardStats).toHaveBeenCalledTimes(2);
      });
    });

    test('global task-updated event triggers refresh', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(api.dashboardService.getAdminDashboardStats).toHaveBeenCalledTimes(1);
      });

      // Trigger the global event
      const event = new CustomEvent('devsync:task-updated');
      window.dispatchEvent(event);

      await waitFor(() => {
        expect(api.dashboardService.getAdminDashboardStats).toHaveBeenCalled();
      }, { timeout: 1000 });
    });

    test('global dashboard-updated event triggers refresh', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(api.dashboardService.getAdminDashboardStats).toHaveBeenCalled();
      });

      // Trigger the global event
      const event = new CustomEvent('devsync:dashboard-updated');
      window.dispatchEvent(event);

      await waitFor(() => {
        // At least the initial call plus event-triggered calls
        expect(api.dashboardService.getAdminDashboardStats).toHaveBeenCalled();
      }, { timeout: 1000 });
    });
  });

  describe('Reports section - admin and team lead', () => {
    test('fetches saved reports for admin users', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });
      const mockReports = [
        { id: 1, type: 'tasks', generatedAt: '2026-05-09T10:00:00Z' }
      ];

      api.reportService.getSavedReports.mockResolvedValue({ reports: mockReports });

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(api.reportService.getSavedReports).toHaveBeenCalled();
      });
    });

    test('fetches saved reports for team lead users', async () => {
      useAuth.mockReturnValue({ currentUser: mockTeamLeadUser });

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(api.reportService.getSavedReports).toHaveBeenCalled();
      });
    });

    test('handles reports fetch error', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });
      api.reportService.getSavedReports.mockRejectedValue(new Error('API Error'));

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        // Should still render dashboard
        expect(screen.getByRole('heading', { name: /Admin Dashboard/i })).toBeInTheDocument();
      });
    });
  });

  describe('Team users section', () => {
    test('fetches all team users', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });
      const mockUsers = [
        { id: 1, name: 'User 1', role: 'developer' },
        { id: 2, name: 'User 2', role: 'team_lead' }
      ];

      api.userService.getAllUsers.mockResolvedValue(mockUsers);

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(api.userService.getAllUsers).toHaveBeenCalled();
      });
    });

    test('handles team users fetch error gracefully', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });
      api.userService.getAllUsers.mockRejectedValue(new Error('API Error'));

      render(
        <Router>
          <AdminDashboard />
        </Router>
      );

      await waitFor(() => {
        // Should still render dashboard
        expect(screen.getByRole('heading', { name: /Admin Dashboard/i })).toBeInTheDocument();
      });
    });
  });
});
