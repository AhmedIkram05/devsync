import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import Reports from '../../pages/Reports';
import { dashboardService } from '../../services/utils/api';

jest.mock('../../services/utils/api', () => ({
  dashboardService: {
    getReportData: jest.fn(),
  },
}));

jest.mock('react-chartjs-2', () => ({
  Bar: () => <div data-testid="bar-chart" />,
  Doughnut: () => <div data-testid="doughnut-chart" />,
  Line: () => <div data-testid="line-chart" />,
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
      total_prs: 3,
      recent_commits: 18,
    },
    details: [
      {
        id: 11,
        name: 'devsync',
        owner: 'ahmedikram',
        open_issues_count: 12,
        total_prs: 3,
        recent_commits: 18,
      },
    ],
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
      expect(dashboardService.getReportData).toHaveBeenCalledWith('tasks', 'week', { forceRefresh: false });
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
      expect(dashboardService.getReportData).toHaveBeenCalledWith('github', 'week', { forceRefresh: false });
    });

    expect(await screen.findByText('Connected Repos')).toBeInTheDocument();
    expect(screen.queryByText('No chart data for this range.')).not.toBeInTheDocument();
    expect(screen.getByText(/Report table: github \(1\)/i)).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('Last Week'), {
      target: { value: 'month' },
    });

    await waitFor(() => {
      expect(dashboardService.getReportData).toHaveBeenCalledWith('github', 'month', { forceRefresh: false });
    });

    fireEvent.change(await screen.findByDisplayValue('GitHub Activity'), {
      target: { value: 'developers' },
    });

    await waitFor(() => {
      expect(dashboardService.getReportData).toHaveBeenCalledWith('developers', 'month', { forceRefresh: false });
    });

    expect(await screen.findByText('Team Members')).toBeInTheDocument();
    expect(screen.getByText(/Report table: developers \(1\)/i)).toBeInTheDocument();
  });

  test('shows error state when report fetch fails', async () => {
    dashboardService.getReportData.mockRejectedValueOnce(new Error('reports unavailable'));

    render(<Reports />);

    expect(await screen.findByText(/Failed to load report data. Please try again./i)).toBeInTheDocument();
  });

  test('generates a report entry and downloads it as PDF', async () => {
    const createObjectURL = jest.fn(() => 'blob:report-pdf');
    const revokeObjectURL = jest.fn();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalCreateElement = document.createElement.bind(document);
    const realLink = originalCreateElement('a');
    const clickSpy = jest.spyOn(realLink, 'click').mockImplementation(() => {});
    const createElementSpy = jest.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'a') {
        return realLink;
      }
      return originalCreateElement(tagName);
    });

    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    jest.useFakeTimers();

    render(<Reports />);

    expect(await screen.findByText('Reports & Analytics')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Generate Report/i }));
    expect(await screen.findByText('Task Report')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Download PDF/i }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(realLink.download).toContain('devsync-tasks-week-');
    expect(realLink.download).toContain('.pdf');

    jest.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:report-pdf');

    jest.useRealTimers();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    createElementSpy.mockRestore();
    clickSpy.mockRestore();
  });

  test('github report displays total_prs summary card', async () => {
    render(<Reports />);

    expect(await screen.findByText('Reports & Analytics')).toBeInTheDocument();

    // Switch to GitHub report using the report type select
    const reportSelects = screen.getAllByRole('combobox');
    fireEvent.change(reportSelects[0], { target: { value: 'github' } });

    // Verify GitHub report is displayed with correct summary cards
    await waitFor(() => {
      expect(dashboardService.getReportData).toHaveBeenCalledWith('github', 'week', { forceRefresh: false });
    });

    // Verify all GitHub summary cards are rendered including Total PRs
    expect(await screen.findByText('Total PRs')).toBeInTheDocument();
    expect(screen.getByText('Connected Repos')).toBeInTheDocument();
    expect(screen.getByText('Open Issues')).toBeInTheDocument();
    expect(screen.getByText('Recent Commits')).toBeInTheDocument();
  });
});
