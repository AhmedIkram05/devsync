import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import Reports from '../../pages/Reports';
import { dashboardService } from '../../services/utils/api';

jest.mock('../../services/utils/api', () => ({
  dashboardService: {
    getReportData: jest.fn(),
  },
}));

jest.mock('../../components/LoadingSpinner', () => () => <div>Loading spinner</div>);

jest.mock('../../components/ReportTable', () => ({ data, type }) => (
  <div>
    Report table: {type} ({data.length})
  </div>
));

describe('Reports page', () => {
  const tasksReport = {
    summary: {
      total: 20,
      completed: 8,
      in_progress: 7,
      overdue: 2,
    },
    details: [{ id: 1 }, { id: 2 }],
  };

  const githubReport = {
    summary: {
      repos: 4,
      open_issues: 12,
      open_prs: 3,
      recent_commits: 18,
    },
    details: [{ id: 11 }],
  };

  const developersReport = {
    summary: {
      team_members: 6,
      avg_tasks: 5,
      avg_completion: 74,
      active_devs: 4,
    },
    details: [{ id: 99 }],
  };

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    dashboardService.getReportData.mockReset();
    dashboardService.getReportData.mockImplementation((reportType, dateRange) => {
      if (reportType === 'github') {
        return Promise.resolve(githubReport);
      }

      if (reportType === 'developers') {
        return Promise.resolve(developersReport);
      }

      if (reportType === 'tasks' && dateRange === 'month') {
        return Promise.resolve({
          summary: {
            total: 10,
            completed: 5,
            in_progress: 3,
            overdue: 1,
          },
          details: [{ id: 77 }],
        });
      }

      return Promise.resolve(tasksReport);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders task report summary and report table by default', async () => {
    render(<Reports />);

    await waitFor(() => {
      expect(dashboardService.getReportData).toHaveBeenCalledWith('tasks', 'week');
    });

    expect(await screen.findByText('Reports & Analytics')).toBeInTheDocument();
    expect(screen.getByText('Total Tasks')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText(/Report table: tasks \(2\)/i)).toBeInTheDocument();
  });

  test('switches report type and date range and fetches matching report payloads', async () => {
    render(<Reports />);

    expect(await screen.findByText('Reports & Analytics')).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('Task Reports'), {
      target: { value: 'github' },
    });

    await waitFor(() => {
      expect(dashboardService.getReportData).toHaveBeenCalledWith('github', 'week');
    });

    expect(await screen.findByText('Connected Repos')).toBeInTheDocument();
    expect(screen.getByText(/Report table: github \(1\)/i)).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('Last Week'), {
      target: { value: 'month' },
    });

    await waitFor(() => {
      expect(dashboardService.getReportData).toHaveBeenCalledWith('github', 'month');
    });

    fireEvent.change(await screen.findByDisplayValue('GitHub Activity'), {
      target: { value: 'developers' },
    });

    await waitFor(() => {
      expect(dashboardService.getReportData).toHaveBeenCalledWith('developers', 'month');
    });

    expect(await screen.findByText('Team Members')).toBeInTheDocument();
    expect(screen.getByText(/Report table: developers \(1\)/i)).toBeInTheDocument();
  });

  test('shows error state when report fetch fails', async () => {
    dashboardService.getReportData.mockRejectedValueOnce(new Error('reports unavailable'));

    render(<Reports />);

    expect(await screen.findByText(/Failed to load report data. Please try again./i)).toBeInTheDocument();
  });
});
