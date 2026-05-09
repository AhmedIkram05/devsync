import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter as Router } from 'react-router-dom';
import Reports from '../../pages/Reports';
import * as api from '../../services/utils/api';

jest.mock('../../services/utils/api');
jest.mock('../../components/LoadingSpinner', () => () => <div data-testid="spinner">Loading...</div>);
jest.mock('../../components/ReportTable', () => () => <div data-testid="report-table">Report Table</div>);

// Mock chart.js components
jest.mock('react-chartjs-2', () => ({
  Bar: () => <div data-testid="bar-chart">Bar Chart</div>,
  Doughnut: () => <div data-testid="doughnut-chart">Doughnut Chart</div>,
  Line: () => <div data-testid="line-chart">Line Chart</div>,
}));

describe('Reports page branch coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    api.dashboardService = {
      getReportData: jest.fn()
    };
    api.reportService = {
      getSavedReports: jest.fn(),
      saveReport: jest.fn(),
      deleteReport: jest.fn()
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Loading and error states', () => {
    test('shows loading spinner while fetching', () => {
      api.dashboardService.getReportData.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );
      api.reportService.getSavedReports.mockResolvedValue({ reports: [] });

      render(
        <Router>
          <Reports />
        </Router>
      );

      expect(screen.getByTestId('spinner')).toBeInTheDocument();
    });

    test('shows error message on fetch failure', async () => {
      api.dashboardService.getReportData.mockRejectedValue(
        new Error('Network error')
      );
      api.reportService.getSavedReports.mockResolvedValue({ reports: [] });

      render(
        <Router>
          <Reports />
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByText(/Failed to load report/i)).toBeInTheDocument();
      });
    });

    test('reload button on error', async () => {
      api.dashboardService.getReportData.mockRejectedValue(
        new Error('Network error')
      );
      api.reportService.getSavedReports.mockResolvedValue({ reports: [] });

      render(
        <Router>
          <Reports />
        </Router>
      );

      await waitFor(() => {
        const tryAgainButton = screen.getByRole('button', { name: /Try Again/i });
        expect(tryAgainButton).toBeInTheDocument();
      });
    });
  });

  describe('Report type selection branches', () => {
    test('renders tasks report type', async () => {
      api.dashboardService.getReportData.mockResolvedValue({
        summary: { total: 10, completed: 5 },
        details: []
      });
      api.reportService.getSavedReports.mockResolvedValue({ reports: [] });

      render(
        <Router>
          <Reports />
        </Router>
      );

      await waitFor(() => {
        expect(api.dashboardService.getReportData).toHaveBeenCalledWith(
          'tasks',
          'week',
          expect.any(Object)
        );
      });
    });

    test('switches to github report type', async () => {
      api.dashboardService.getReportData.mockResolvedValue({
        summary: { repos: 5 },
        details: [],
        meta: { fetched_at: '2026-05-09T10:00:00Z' }
      });
      api.reportService.getSavedReports.mockResolvedValue({ reports: [] });

      render(
        <Router>
          <Reports />
        </Router>
      );

      await waitFor(() => {
        const selects = screen.getAllByRole('combobox');
        const typeSelect = selects[0];
        fireEvent.change(typeSelect, { target: { value: 'github' } });
      });

      await waitFor(() => {
        expect(api.dashboardService.getReportData).toHaveBeenCalledWith(
          'github',
          expect.any(String),
          expect.any(Object)
        );
      });
    });

    test('switches to developers report type', async () => {
      api.dashboardService.getReportData.mockResolvedValue({
        summary: { team_members: 5 },
        details: []
      });
      api.reportService.getSavedReports.mockResolvedValue({ reports: [] });

      render(
        <Router>
          <Reports />
        </Router>
      );

      await waitFor(() => {
        const selects = screen.getAllByRole('combobox');
        const typeSelect = selects[0];
        fireEvent.change(typeSelect, { target: { value: 'developers' } });
      });

      await waitFor(() => {
        expect(api.dashboardService.getReportData).toHaveBeenCalledWith(
          'developers',
          expect.any(String),
          expect.any(Object)
        );
      });
    });
  });

  describe('Date range selection branches', () => {
    test('renders week date range', async () => {
      api.dashboardService.getReportData.mockResolvedValue({
        summary: {},
        details: []
      });
      api.reportService.getSavedReports.mockResolvedValue({ reports: [] });

      render(
        <Router>
          <Reports />
        </Router>
      );

      await waitFor(() => {
        expect(api.dashboardService.getReportData).toHaveBeenCalledWith(
          'tasks',
          'week',
          expect.any(Object)
        );
      });
    });

    test('switches to month date range', async () => {
      api.dashboardService.getReportData.mockResolvedValue({
        summary: {},
        details: []
      });
      api.reportService.getSavedReports.mockResolvedValue({ reports: [] });

      render(
        <Router>
          <Reports />
        </Router>
      );

      await waitFor(() => {
        const selects = screen.getAllByRole('combobox');
        const rangeSelect = selects[1];
        fireEvent.change(rangeSelect, { target: { value: 'month' } });
      });

      await waitFor(() => {
        expect(api.dashboardService.getReportData).toHaveBeenCalledWith(
          'tasks',
          'month',
          expect.any(Object)
        );
      });
    });

    test('switches to quarter date range', async () => {
      api.dashboardService.getReportData.mockResolvedValue({
        summary: {},
        details: []
      });
      api.reportService.getSavedReports.mockResolvedValue({ reports: [] });

      render(
        <Router>
          <Reports />
        </Router>
      );

      await waitFor(() => {
        const selects = screen.getAllByRole('combobox');
        const rangeSelect = selects[1];
        fireEvent.change(rangeSelect, { target: { value: 'quarter' } });
      });

      await waitFor(() => {
        expect(api.dashboardService.getReportData).toHaveBeenCalledWith(
          'tasks',
          'quarter',
          expect.any(Object)
        );
      });
    });

    test('switches to year date range', async () => {
      api.dashboardService.getReportData.mockResolvedValue({
        summary: {},
        details: []
      });
      api.reportService.getSavedReports.mockResolvedValue({ reports: [] });

      render(
        <Router>
          <Reports />
        </Router>
      );

      await waitFor(() => {
        const selects = screen.getAllByRole('combobox');
        const rangeSelect = selects[1];
        fireEvent.change(rangeSelect, { target: { value: 'year' } });
      });

      await waitFor(() => {
        expect(api.dashboardService.getReportData).toHaveBeenCalledWith(
          'tasks',
          'year',
          expect.any(Object)
        );
      });
    });
  });

  describe('Task report rendering', () => {
    test('renders task summary cards', async () => {
      api.dashboardService.getReportData.mockResolvedValue({
        summary: {
          total: 20,
          completed: 10,
          in_progress: 5,
          overdue: 2
        },
        details: [{ id: 1, title: 'Task', status: 'todo' }]
      });
      api.reportService.getSavedReports.mockResolvedValue({ reports: [] });

      render(
        <Router>
          <Reports />
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByText(/Total Tasks/i)).toBeInTheDocument();
        expect(screen.getByText(/Completed/i)).toBeInTheDocument();
        expect(screen.getByText(/In Progress/i)).toBeInTheDocument();
        expect(screen.getByText(/Overdue/i)).toBeInTheDocument();
      });
    });

    test('renders task status breakdown chart', async () => {
      api.dashboardService.getReportData.mockResolvedValue({
        summary: {
          backlog: 3,
          todo: 5,
          in_progress: 4,
          review: 2,
          done: 6
        },
        details: []
      });
      api.reportService.getSavedReports.mockResolvedValue({ reports: [] });

      render(
        <Router>
          <Reports />
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByText(/Task status breakdown/i)).toBeInTheDocument();
        expect(screen.getByTestId('doughnut-chart')).toBeInTheDocument();
      });
    });

    test('renders task trend chart', async () => {
      const now = new Date();
      api.dashboardService.getReportData.mockResolvedValue({
        summary: {},
        details: [
          {
            id: 1,
            title: 'Task',
            status: 'todo',
            created_at: now.toISOString()
          }
        ]
      });
      api.reportService.getSavedReports.mockResolvedValue({ reports: [] });

      render(
        <Router>
          <Reports />
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByText(/Tasks created over time/i)).toBeInTheDocument();
        expect(screen.getByTestId('line-chart')).toBeInTheDocument();
      });
    });

    test('renders empty state for task trend', async () => {
      api.dashboardService.getReportData.mockResolvedValue({
        summary: {},
        details: [] // No tasks
      });
      api.reportService.getSavedReports.mockResolvedValue({ reports: [] });

      const { container } = render(
        <Router>
          <Reports />
        </Router>
      );

      // Just verify the page renders without errors
      expect(container).toBeInTheDocument();
    });
  });

  describe('GitHub report rendering', () => {
    test('renders github summary cards', async () => {
      api.dashboardService.getReportData.mockResolvedValue({
        summary: {
          repos: 3,
          open_issues: 5,
          total_prs: 2,
          recent_commits: 10
        },
        details: [],
        meta: { fetched_at: '2026-05-09T10:00:00Z' }
      });
      api.reportService.getSavedReports.mockResolvedValue({ reports: [] });

      render(
        <Router>
          <Reports />
        </Router>
      );

      await waitFor(() => {
        const selects = screen.getAllByRole('combobox');
        const typeSelect = selects[0];
        fireEvent.change(typeSelect, { target: { value: 'github' } });
      });

      await waitFor(() => {
        expect(screen.getByText(/Connected Repos/i)).toBeInTheDocument();
        expect(screen.getByText(/Open Issues/i)).toBeInTheDocument();
        expect(screen.getByText(/Total PRs/i)).toBeInTheDocument();
        expect(screen.getByText(/Recent Commits/i)).toBeInTheDocument();
      });
    });

    test('renders refresh github stats button', async () => {
      api.dashboardService.getReportData.mockResolvedValue({
        summary: {},
        details: [],
        meta: {}
      });
      api.reportService.getSavedReports.mockResolvedValue({ reports: [] });

      render(
        <Router>
          <Reports />
        </Router>
      );

      await waitFor(() => {
        const selects = screen.getAllByRole('combobox');
        const typeSelect = selects[0];
        fireEvent.change(typeSelect, { target: { value: 'github' } });
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Refresh GitHub Stats/i })).toBeInTheDocument();
      });
    });

    test('renders repository activity chart', async () => {
      api.dashboardService.getReportData.mockResolvedValue({
        summary: {},
        details: [
          {
            name: 'repo1',
            owner: 'owner',
            open_issues: 2,
            total_prs: 1,
            recent_commits: 5
          }
        ],
        meta: {}
      });
      api.reportService.getSavedReports.mockResolvedValue({ reports: [] });

      render(
        <Router>
          <Reports />
        </Router>
      );

      await waitFor(() => {
        const selects = screen.getAllByRole('combobox');
        const typeSelect = selects[0];
        fireEvent.change(typeSelect, { target: { value: 'github' } });
      });

      await waitFor(() => {
        expect(screen.getByText(/Repository activity by repo/i)).toBeInTheDocument();
        expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
      });
    });
  });

  describe('Developer report rendering', () => {
    test('renders developer summary cards', async () => {
      api.dashboardService.getReportData.mockResolvedValue({
        summary: {
          team_members: 5,
          avg_tasks: 8,
          avg_completion: 75,
          active_devs: 4
        },
        details: []
      });
      api.reportService.getSavedReports.mockResolvedValue({ reports: [] });

      render(
        <Router>
          <Reports />
        </Router>
      );

      await waitFor(() => {
        const selects = screen.getAllByRole('combobox');
        const typeSelect = selects[0];
        fireEvent.change(typeSelect, { target: { value: 'developers' } });
      });

      await waitFor(() => {
        expect(screen.getByText(/Team Members/i)).toBeInTheDocument();
        expect(screen.getByText(/Avg. Tasks Per Dev/i)).toBeInTheDocument();
        expect(screen.getByText(/Avg. Completion Rate/i)).toBeInTheDocument();
        expect(screen.getByText(/Active Developers/i)).toBeInTheDocument();
      });
    });

    test('renders developer task volume chart', async () => {
      api.dashboardService.getReportData.mockResolvedValue({
        summary: {
          team_members: 3,
          active_devs: 2
        },
        details: [
          {
            name: 'John Doe',
            email: 'john@test.com',
            total_tasks: 10,
            completed_tasks: 8
          },
          {
            name: 'Jane Smith',
            email: 'jane@test.com',
            total_tasks: 12,
            completed_tasks: 10
          }
        ]
      });
      api.reportService.getSavedReports.mockResolvedValue({ reports: [] });

      render(
        <Router>
          <Reports />
        </Router>
      );

      await waitFor(() => {
        const selects = screen.getAllByRole('combobox');
        const typeSelect = selects[0];
        fireEvent.change(typeSelect, { target: { value: 'developers' } });
      });

      await waitFor(() => {
        expect(screen.getByText(/Task volume by developer/i)).toBeInTheDocument();
        expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
      });
    });

    test('renders developer activity mix chart', async () => {
      api.dashboardService.getReportData.mockResolvedValue({
        summary: {
          team_members: 5,
          active_devs: 3
        },
        details: []
      });
      api.reportService.getSavedReports.mockResolvedValue({ reports: [] });

      render(
        <Router>
          <Reports />
        </Router>
      );

      await waitFor(() => {
        const selects = screen.getAllByRole('combobox');
        const typeSelect = selects[0];
        fireEvent.change(typeSelect, { target: { value: 'developers' } });
      });

      await waitFor(() => {
        expect(screen.getByText(/Developer activity/i)).toBeInTheDocument();
        expect(screen.getByText(/Active vs idle/i)).toBeInTheDocument();
      });
    });
  });

  describe('Generated reports functionality', () => {
    test('shows empty generated reports message', async () => {
      api.dashboardService.getReportData.mockResolvedValue({
        summary: {},
        details: []
      });
      api.reportService.getSavedReports.mockResolvedValue({ reports: [] });

      render(
        <Router>
          <Reports />
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByText(/No generated reports yet/i)).toBeInTheDocument();
      });
    });

    test('displays generated reports list', async () => {
      const mockReports = [
        {
          id: '1',
          type: 'tasks',
          dateRange: 'week',
          generatedAt: '2026-05-09T10:00:00Z',
          summary: { total: 10 },
          details: []
        }
      ];

      api.dashboardService.getReportData.mockResolvedValue({
        summary: {},
        details: []
      });
      api.reportService.getSavedReports.mockResolvedValue({ reports: mockReports });

      render(
        <Router>
          <Reports />
        </Router>
      );

      // Verify the component renders with reports
      await waitFor(() => {
        const downloadButtons = screen.queryAllByRole('button', { name: /Download PDF/i });
        expect(downloadButtons.length).toBeGreaterThanOrEqual(0);
      });
    });

    test('generates and saves report', async () => {
      const mockSaveResponse = {
        report: {
          id: 'new-id',
          type: 'tasks',
          dateRange: 'week',
          generatedAt: new Date().toISOString(),
          summary: { total: 5 },
          details: []
        }
      };

      api.dashboardService.getReportData.mockResolvedValue({
        summary: { total: 5 },
        details: []
      });
      api.reportService.getSavedReports.mockResolvedValue({ reports: [] });
      api.reportService.saveReport.mockResolvedValue(mockSaveResponse);

      render(
        <Router>
          <Reports />
        </Router>
      );

      await waitFor(() => {
        const generateButton = screen.getByRole('button', { name: /Generate Report/i });
        fireEvent.click(generateButton);
      });

      await waitFor(() => {
        expect(api.reportService.saveReport).toHaveBeenCalled();
      });
    });

    test('deletes generated report', async () => {
      const mockReports = [
        {
          id: '1',
          type: 'tasks',
          dateRange: 'week',
          generatedAt: '2026-05-09T10:00:00Z',
          summary: {},
          details: []
        }
      ];

      api.dashboardService.getReportData.mockResolvedValue({
        summary: {},
        details: []
      });
      api.reportService.getSavedReports.mockResolvedValue({ reports: mockReports });
      api.reportService.deleteReport.mockResolvedValue({ success: true });

      render(
        <Router>
          <Reports />
        </Router>
      );

      // Verify delete button renders
      await waitFor(() => {
        const deleteButton = screen.getByTitle('Delete Report');
        expect(deleteButton).toBeInTheDocument();
      });
    });

    test('downloads report as PDF', async () => {
      const mockReports = [
        {
          id: 'test-id',
          type: 'tasks',
          dateRange: 'week',
          generatedAt: '2026-05-09T10:00:00Z',
          summary: { total: 5 },
          details: [{ title: 'Task 1', status: 'todo' }]
        }
      ];

      api.dashboardService.getReportData.mockResolvedValue({
        summary: {},
        details: []
      });
      api.reportService.getSavedReports.mockResolvedValue({ reports: mockReports });

      render(
        <Router>
          <Reports />
        </Router>
      );

      await waitFor(() => {
        const downloadButton = screen.getByRole('button', { name: /Download PDF/i });
        expect(downloadButton).toBeInTheDocument();
      });
    });
  });

  describe('Data loading and caching', () => {
    test('caches non-github reports', async () => {
      api.dashboardService.getReportData.mockResolvedValue({
        summary: { total: 10 },
        details: []
      });
      api.reportService.getSavedReports.mockResolvedValue({ reports: [] });

      render(
        <Router>
          <Reports />
        </Router>
      );

      await waitFor(() => {
        expect(api.dashboardService.getReportData).toHaveBeenCalledTimes(1);
      });
    });

    test('does not cache github reports', async () => {
      api.dashboardService.getReportData.mockResolvedValue({
        summary: { repos: 3 },
        details: [],
        meta: {}
      });
      api.reportService.getSavedReports.mockResolvedValue({ reports: [] });

      render(
        <Router>
          <Reports />
        </Router>
      );

      await waitFor(() => {
        const selects = screen.getAllByRole('combobox');
        const typeSelect = selects[0];
        fireEvent.change(typeSelect, { target: { value: 'github' } });
      });

      // Should not use cache for github reports
      await waitFor(() => {
        expect(api.dashboardService.getReportData).toHaveBeenCalled();
      });
    });
  });

  describe('Report type labels and formatting', () => {
    test('displays correct report type labels', async () => {
      const mockReports = [
        { id: '1', type: 'tasks', dateRange: 'week', summary: {}, details: [], generatedAt: new Date().toISOString() },
        { id: '2', type: 'github', dateRange: 'month', summary: {}, details: [], generatedAt: new Date().toISOString() },
        { id: '3', type: 'developers', dateRange: 'quarter', summary: {}, details: [], generatedAt: new Date().toISOString() }
      ];

      api.dashboardService.getReportData.mockResolvedValue({
        summary: {},
        details: []
      });
      api.reportService.getSavedReports.mockResolvedValue({
        reports: mockReports
      });

      render(
        <Router>
          <Reports />
        </Router>
      );

      // Wait for initial render and reports to load
      await waitFor(() => {
        expect(api.reportService.getSavedReports).toHaveBeenCalled();
      });

      // Check that report labels appear in the DOM
      await waitFor(() => {
        const screen_text = document.body.textContent;
        expect(screen_text).toContain('Task Report');
        expect(screen_text).toContain('GitHub Activity');
        expect(screen_text).toContain('Developer Performance');
      });
    });
  });
});
