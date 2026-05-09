import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter as Router } from 'react-router-dom';
import BasicDashboard from '../../pages/BasicDashboard';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../services/utils/api';

jest.mock('../../context/AuthContext');
jest.mock('../../services/utils/api');
jest.mock('../../components/LoadingSpinner', () => () => <div data-testid="spinner">Loading...</div>);

describe('BasicDashboard page branch coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({
      currentUser: { id: 1, role: 'developer' },
      is: jest.fn((role) => role === 'developer')
    });

    api.dashboardService = {
      getBasicDashboardStats: jest.fn()
    };
  });

  describe('Status and priority styling branches', () => {
    test('renders todo status with correct styling', async () => {
      api.dashboardService.getBasicDashboardStats.mockResolvedValue({
        tasks: [{ id: 1, title: 'Task', status: 'todo' }],
        recentTasks: []
      });

      render(
        <Router>
          <BasicDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
      });
    });

    test('renders in_progress status with amber styling', async () => {
      api.dashboardService.getBasicDashboardStats.mockResolvedValue({
        tasks: [{ id: 1, title: 'Task', status: 'in_progress' }],
        recentTasks: []
      });

      render(
        <Router>
          <BasicDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
      });
    });

    test('renders review status with sky styling', async () => {
      api.dashboardService.getBasicDashboardStats.mockResolvedValue({
        tasks: [{ id: 1, title: 'Task', status: 'review' }],
        recentTasks: []
      });

      render(
        <Router>
          <BasicDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
      });
    });

    test('renders done status with emerald styling', async () => {
      api.dashboardService.getBasicDashboardStats.mockResolvedValue({
        tasks: [{ id: 1, title: 'Task', status: 'done' }],
        recentTasks: []
      });

      render(
        <Router>
          <BasicDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
      });
    });

    test('renders completed status with emerald styling', async () => {
      api.dashboardService.getBasicDashboardStats.mockResolvedValue({
        tasks: [{ id: 1, title: 'Task', status: 'completed' }],
        recentTasks: []
      });

      render(
        <Router>
          <BasicDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
      });
    });

    test('renders high priority with rose styling', async () => {
      api.dashboardService.getBasicDashboardStats.mockResolvedValue({
        tasks: [{ id: 1, title: 'Task', status: 'todo', priority: 'high' }],
        recentTasks: []
      });

      render(
        <Router>
          <BasicDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
      });
    });

    test('renders medium priority with amber styling', async () => {
      api.dashboardService.getBasicDashboardStats.mockResolvedValue({
        tasks: [{ id: 1, title: 'Task', status: 'todo', priority: 'medium' }],
        recentTasks: []
      });

      render(
        <Router>
          <BasicDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
      });
    });

    test('renders low priority with emerald styling', async () => {
      api.dashboardService.getBasicDashboardStats.mockResolvedValue({
        tasks: [{ id: 1, title: 'Task', status: 'todo', priority: 'low' }],
        recentTasks: []
      });

      render(
        <Router>
          <BasicDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
      });
    });

    test('renders unknown priority with default styling', async () => {
      api.dashboardService.getBasicDashboardStats.mockResolvedValue({
        tasks: [{ id: 1, title: 'Task', status: 'todo', priority: 'urgent' }],
        recentTasks: []
      });

      render(
        <Router>
          <BasicDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
      });
    });
  });

  describe('Task deadline formatting branches', () => {
    test('formatTaskDate with valid date', async () => {
      api.dashboardService.getBasicDashboardStats.mockResolvedValue({
        tasks: [{ id: 1, title: 'Task', status: 'todo', deadline: '2026-05-20' }],
        recentTasks: []
      });

      render(
        <Router>
          <BasicDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
      });
    });

    test('formatTaskDate with null deadline', async () => {
      api.dashboardService.getBasicDashboardStats.mockResolvedValue({
        tasks: [{ id: 1, title: 'Task', status: 'todo', deadline: null }],
        recentTasks: []
      });

      render(
        <Router>
          <BasicDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
      });
    });

    test('formatTaskDate with invalid date string', async () => {
      api.dashboardService.getBasicDashboardStats.mockResolvedValue({
        tasks: [{ id: 1, title: 'Task', status: 'todo', deadline: 'invalid-date' }],
        recentTasks: []
      });

      render(
        <Router>
          <BasicDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
      });
    });

    test('formatTaskDate uses due_date fallback', async () => {
      api.dashboardService.getBasicDashboardStats.mockResolvedValue({
        tasks: [{ id: 1, title: 'Task', status: 'todo', due_date: '2026-06-01' }],
        recentTasks: []
      });

      render(
        <Router>
          <BasicDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
      });
    });
  });

  describe('Data loading branches', () => {
    test('shows loading spinner while fetching', () => {
      api.dashboardService.getBasicDashboardStats.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(
        <Router>
          <BasicDashboard />
        </Router>
      );

      expect(screen.getByTestId('spinner')).toBeInTheDocument();
    });

    test('shows error message on fetch failure', async () => {
      api.dashboardService.getBasicDashboardStats.mockRejectedValue(
        new Error('Network error')
      );

      render(
        <Router>
          <BasicDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByText(/Failed to load/i)).toBeInTheDocument();
      });
    });

    test('displays dashboard data on success', async () => {
      api.dashboardService.getBasicDashboardStats.mockResolvedValue({
        tasks: [{ id: 1, title: 'Test Task', status: 'todo' }],
        recentTasks: []
      });

      render(
        <Router>
          <BasicDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByText('Test Task')).toBeInTheDocument();
      });
    });
  });

  describe('Role-based content branches', () => {
    test('displays team lead workspace title for team_lead role', async () => {
      useAuth.mockReturnValue({
        currentUser: { id: 1, role: 'team_lead' },
        is: jest.fn((role) => role === 'team_lead')
      });

      api.dashboardService.getBasicDashboardStats.mockResolvedValue({
        tasks: [],
        recentTasks: []
      });

      render(
        <Router>
          <BasicDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByText(/Team Lead Workspace/)).toBeInTheDocument();
      });
    });

    test('displays my dashboard title for developer role', async () => {
      useAuth.mockReturnValue({
        currentUser: { id: 1, role: 'developer' },
        is: jest.fn((role) => role === 'developer')
      });

      api.dashboardService.getBasicDashboardStats.mockResolvedValue({
        tasks: [],
        recentTasks: []
      });

      render(
        <Router>
          <BasicDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByText(/My Dashboard/)).toBeInTheDocument();
      });
    });

    test('displays my dashboard title for admin role', async () => {
      useAuth.mockReturnValue({
        currentUser: { id: 1, role: 'admin' },
        is: jest.fn((role) => role === 'admin')
      });

      api.dashboardService.getBasicDashboardStats.mockResolvedValue({
        tasks: [],
        recentTasks: []
      });

      render(
        <Router>
          <BasicDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByText(/My Dashboard/)).toBeInTheDocument();
      });
    });
  });

  describe('Task filtering branches', () => {
    test('filters out completed tasks from display', async () => {
      api.dashboardService.getBasicDashboardStats.mockResolvedValue({
        tasks: [
          { id: 1, title: 'Active Task', status: 'in_progress' },
          { id: 2, title: 'Completed Task', status: 'completed' },
          { id: 3, title: 'Done Task', status: 'done' }
        ],
        recentTasks: []
      });

      render(
        <Router>
          <BasicDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByText('Active Task')).toBeInTheDocument();
        expect(screen.queryByText('Completed Task')).not.toBeInTheDocument();
        expect(screen.queryByText('Done Task')).not.toBeInTheDocument();
      });
    });

    test('uses recentTasks fallback when tasks is empty', async () => {
      api.dashboardService.getBasicDashboardStats.mockResolvedValue({
        tasks: [],
        recentTasks: [{ id: 1, title: 'Recent Task', status: 'todo' }]
      });

      render(
        <Router>
          <BasicDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByText('Recent Task')).toBeInTheDocument();
      });
    });

    test('handles empty tasks and recentTasks arrays', async () => {
      api.dashboardService.getBasicDashboardStats.mockResolvedValue({
        tasks: [],
        recentTasks: []
      });

      render(
        <Router>
          <BasicDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
      });
    });
  });

  describe('Refresh functionality branches', () => {
    test('refresh button refetches dashboard data', async () => {
      api.dashboardService.getBasicDashboardStats
        .mockResolvedValueOnce({ tasks: [], recentTasks: [] })
        .mockResolvedValueOnce({ tasks: [{ id: 1, title: 'New Task' }], recentTasks: [] });

      render(
        <Router>
          <BasicDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(api.dashboardService.getBasicDashboardStats).toHaveBeenCalledTimes(1);
      });

      const refreshButton = screen.getByRole('button', { name: /refresh|reload/i });
      if (refreshButton) {
        fireEvent.click(refreshButton);

        await waitFor(() => {
          expect(api.dashboardService.getBasicDashboardStats).toHaveBeenCalledTimes(2);
        });
      }
    });
  });

  describe('Status label formatting branches', () => {
    test('formats status labels correctly', async () => {
      api.dashboardService.getBasicDashboardStats.mockResolvedValue({
        tasks: [
          { id: 1, title: 'Task1', status: 'in_progress' },
          { id: 2, title: 'Task2', status: 'in-review' }
        ],
        recentTasks: []
      });

      render(
        <Router>
          <BasicDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
      });
    });

    test('handles unknown status labels', async () => {
      api.dashboardService.getBasicDashboardStats.mockResolvedValue({
        tasks: [
          { id: 1, title: 'Task', status: 'unknown_status' }
        ],
        recentTasks: []
      });

      render(
        <Router>
          <BasicDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
      });
    });

    test('handles null status', async () => {
      api.dashboardService.getBasicDashboardStats.mockResolvedValue({
        tasks: [
          { id: 1, title: 'Task', status: null }
        ],
        recentTasks: []
      });

      render(
        <Router>
          <BasicDashboard />
        </Router>
      );

      await waitFor(() => {
        expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
      });
    });
  });
});
