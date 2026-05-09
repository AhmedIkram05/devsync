import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import Reports from '../../pages/Reports';
import { dashboardService } from '../../services/utils/api';

jest.mock('../../services/utils/api', () => ({
  dashboardService: {
    getReportData: jest.fn(),
  },
  reportService: {
    getSavedReports: jest.fn(),
    saveReport: jest.fn(),
    deleteReport: jest.fn(),
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
    jest.spyOn(console, 'warn').mockImplementation(() => {});

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

    require('../../services/utils/api').reportService.getSavedReports.mockReset();
    require('../../services/utils/api').reportService.getSavedReports.mockResolvedValue({ reports: [] });
    require('../../services/utils/api').reportService.saveReport.mockReset();
    require('../../services/utils/api').reportService.deleteReport.mockReset();
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

    expect(await screen.findByText('Connected Repos')).toBeInTheDocument();

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

  test('loads saved reports, saves generated reports, and deletes them', async () => {
    const api = require('../../services/utils/api');
    api.reportService.getSavedReports.mockResolvedValueOnce({
      reports: [
        { id: 'saved-1', type: 'tasks', dateRange: 'week', generatedAt: '2099-01-01T00:00:00.000Z', summary: { total: 1 }, details: [] },
      ],
    });
    api.reportService.saveReport.mockResolvedValueOnce({
      report: { id: 'saved-2', type: 'github', dateRange: 'week', generatedAt: '2099-01-02T00:00:00.000Z', summary: { repos: 1 }, details: [] },
    });
    api.reportService.deleteReport.mockResolvedValueOnce({ success: true });

    render(<Reports />);

    expect(await screen.findByText('Reports & Analytics')).toBeInTheDocument();
    expect(await screen.findByText('Task Report')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Generate Report/i }));

    await waitFor(() => {
      expect(api.reportService.saveReport).toHaveBeenCalledWith('tasks', 'week', expect.any(Object), expect.any(Array));
    });

    expect(await screen.findByText('GitHub Activity')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Delete Report'));

    await waitFor(() => {
      expect(api.reportService.deleteReport).toHaveBeenCalledWith('saved-1');
    });

    expect(screen.getAllByText('Task Report').length).toBe(1);
  });

  test('generates report with different date ranges', async () => {
    const api = require('../../services/utils/api');
    api.dashboardService.getReportData.mockResolvedValue(tasksReport);
    api.reportService.getSavedReports.mockResolvedValue({ reports: [] });
    api.reportService.saveReport.mockResolvedValue({
      report: { id: 'saved-3', type: 'tasks', dateRange: 'month', generatedAt: '2099-01-01T00:00:00.000Z', summary: tasksReport.summary, details: tasksReport.details },
    });

    render(<Reports />);
    expect(await screen.findByText('Reports & Analytics')).toBeInTheDocument();

    // Select different date range
    const dateRangeSelect = screen.getAllByRole('combobox')[1];
    fireEvent.change(dateRangeSelect, { target: { value: 'month' } });

    await waitFor(() => {
      expect(dashboardService.getReportData).toHaveBeenCalledWith('tasks', 'month', { forceRefresh: false });
    });

    expect(await screen.findByText('Total Tasks')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Generate Report/i }));

    await waitFor(() => {
      expect(api.reportService.saveReport).toHaveBeenCalledWith('tasks', 'month', expect.any(Object), expect.any(Array));
    });
  });

  test('generates github report', async () => {
    const api = require('../../services/utils/api');
    api.dashboardService.getReportData.mockResolvedValue(githubReport);
    api.reportService.getSavedReports.mockResolvedValue({ reports: [] });
    api.reportService.saveReport.mockResolvedValue({
      report: { id: 'saved-gh', type: 'github', dateRange: 'week', generatedAt: '2099-01-01T00:00:00.000Z', summary: githubReport.summary, details: githubReport.details },
    });

    render(<Reports />);
    expect(await screen.findByText('Reports & Analytics')).toBeInTheDocument();

    // Select github report type
    const reportTypeSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(reportTypeSelect, { target: { value: 'github' } });

    await waitFor(() => {
      expect(dashboardService.getReportData).toHaveBeenCalledWith('github', 'week', { forceRefresh: false });
    });

    expect(await screen.findByText('Connected Repos')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Generate Report/i }));

    await waitFor(() => {
      expect(api.reportService.saveReport).toHaveBeenCalledWith('github', 'week', expect.any(Object), expect.any(Array));
    });
  });

  test('refreshes github stats and shows the refresh state', async () => {
    const api = require('../../services/utils/api');
    api.dashboardService.getReportData.mockResolvedValue(githubReport);
    api.reportService.getSavedReports.mockResolvedValue({ reports: [] });

    render(<Reports />);

    expect(await screen.findByText('Reports & Analytics')).toBeInTheDocument();

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'github' } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Refresh GitHub Stats/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Refresh GitHub Stats/i }));

    await waitFor(() => {
      expect(dashboardService.getReportData).toHaveBeenCalledWith('github', 'week', { forceRefresh: true });
    });
  });

  test('renders developer report summary and charts', async () => {
    const api = require('../../services/utils/api');
    api.dashboardService.getReportData.mockResolvedValue(developersReport);
    api.reportService.getSavedReports.mockResolvedValue({ reports: [] });

    render(<Reports />);

    expect(await screen.findByText('Reports & Analytics')).toBeInTheDocument();
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'developers' } });

    await waitFor(() => {
      expect(dashboardService.getReportData).toHaveBeenCalledWith('developers', 'week', { forceRefresh: false });
    });

    expect(await screen.findByText('Team Members')).toBeInTheDocument();
    expect(screen.getByText('Avg. Tasks Per Dev')).toBeInTheDocument();
    expect(screen.getByText('Avg. Completion Rate')).toBeInTheDocument();
    expect(screen.getByText('Active Developers')).toBeInTheDocument();
    expect(screen.getByText(/Report table: developers \(1\)/i)).toBeInTheDocument();
  });

  test('falls back when saved reports response contains an error', async () => {
    const api = require('../../services/utils/api');
    api.reportService.getSavedReports.mockResolvedValue({ error: 'cache unavailable' });
    api.reportService.saveReport.mockResolvedValue({
      error: 'persist failed',
    });

    render(<Reports />);

    expect(await screen.findByText('Reports & Analytics')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Generate Report/i }));

    await waitFor(() => {
      expect(console.warn).toHaveBeenCalledWith('Failed to load saved reports:', 'cache unavailable');
    });

    await waitFor(() => {
      expect(console.warn).toHaveBeenCalledWith('Failed to save report to backend:', 'persist failed');
    });

    expect(screen.getByText('Task Report')).toBeInTheDocument();
  });

  test('falls back when saved reports request throws', async () => {
    const api = require('../../services/utils/api');
    api.reportService.getSavedReports.mockRejectedValue(new Error('saved reports unavailable'));

    render(<Reports />);

    expect(await screen.findByText('Reports & Analytics')).toBeInTheDocument();

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith('Error loading saved reports:', expect.any(Error));
    });
  });

  test('handles report generation failure', async () => {
    const api = require('../../services/utils/api');
    api.dashboardService.getReportData.mockRejectedValue(new Error('Report generation failed'));
    api.reportService.getSavedReports.mockResolvedValue({ reports: [] });

    render(<Reports />);
    expect(await screen.findByText(/Failed to load report data\. Please try again\./i)).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith('Failed to fetch report data:', expect.any(Error));
    });
  });

  test('handles delete report failure', async () => {
    const api = require('../../services/utils/api');
    api.reportService.getSavedReports.mockResolvedValue({
      reports: [
        { id: 'saved-1', type: 'tasks', dateRange: 'week', generatedAt: '2099-01-01T00:00:00.000Z', summary: { total: 1 }, details: [] },
      ],
    });
    api.reportService.deleteReport.mockRejectedValue(new Error('Delete failed'));

    render(<Reports />);
    expect(await screen.findByText('Reports & Analytics')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Delete Report'));

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith('Error deleting report:', expect.any(Error));
    });
  });

  test('displays empty state when no reports exist', async () => {
    const api = require('../../services/utils/api');
    api.reportService.getSavedReports.mockResolvedValue({ reports: [] });
    api.dashboardService.getReportData.mockResolvedValue(tasksReport);

    render(<Reports />);
    expect(await screen.findByText('Reports & Analytics')).toBeInTheDocument();
    
    expect(screen.getByText(/No generated reports yet/i)).toBeInTheDocument();
  });

  test('renders multiple saved reports', async () => {
    const api = require('../../services/utils/api');
    api.reportService.getSavedReports.mockResolvedValue({
      reports: [
        { id: 'saved-1', type: 'tasks', dateRange: 'week', generatedAt: '2099-01-01T00:00:00.000Z', summary: { total: 1 }, details: [{ id: 1 }] },
        { id: 'saved-2', type: 'github', dateRange: 'month', generatedAt: '2099-01-02T00:00:00.000Z', summary: { repos: 2 }, details: [{ id: 2 }] },
      ],
    });

    render(<Reports />);
    expect(await screen.findByText('Reports & Analytics')).toBeInTheDocument();
    
    // Both report types should be shown
    expect(screen.getAllByText('Task Report').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('GitHub Activity').length).toBeGreaterThanOrEqual(1);
  });

  test('handles getSavedReports with missing reports property', async () => {
    const api = require('../../services/utils/api');
    api.reportService.getSavedReports.mockResolvedValue({});
    api.dashboardService.getReportData.mockResolvedValue(tasksReport);

    render(<Reports />);
    expect(await screen.findByText('Reports & Analytics')).toBeInTheDocument();
  });

  test('renders report generation controls', async () => {
    const api = require('../../services/utils/api');
    api.reportService.getSavedReports.mockResolvedValue({ reports: [] });
    api.dashboardService.getReportData.mockResolvedValue(tasksReport);

    render(<Reports />);
    expect(await screen.findByText('Reports & Analytics')).toBeInTheDocument();

    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Generate Report/i })).toBeInTheDocument();
  });

  test('displays task report summary data', async () => {
    const api = require('../../services/utils/api');
    api.dashboardService.getReportData.mockResolvedValue(tasksReport);
    api.reportService.getSavedReports.mockResolvedValue({ reports: [] });

    render(<Reports />);
    expect(await screen.findByText('Reports & Analytics')).toBeInTheDocument();
    
    fireEvent.click(screen.getByRole('button', { name: /Generate Report/i }));

    await waitFor(() => {
      expect(screen.getAllByText('Task Report').length).toBeGreaterThanOrEqual(1);
    });
  });

  test('displays github report summary data', async () => {
    const api = require('../../services/utils/api');
    api.dashboardService.getReportData.mockResolvedValue(githubReport);
    api.reportService.getSavedReports.mockResolvedValue({ reports: [] });

    render(<Reports />);
    expect(await screen.findByText('Reports & Analytics')).toBeInTheDocument();

    const reportTypeSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(reportTypeSelect, { target: { value: 'github' } });

    await waitFor(() => {
      expect(dashboardService.getReportData).toHaveBeenCalledWith('github', 'week', { forceRefresh: false });
    });

    expect(await screen.findByText('Connected Repos')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Generate Report/i }));

    await waitFor(() => {
      expect(screen.getAllByText('GitHub Activity').length).toBeGreaterThanOrEqual(1);
    });
  });
});
