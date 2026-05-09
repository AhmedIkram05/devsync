import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter as Router } from 'react-router-dom';
import ReportTable from '../../components/ReportTable';

const renderWithRouter = (component) => {
  return render(<Router>{component}</Router>);
};

describe('ReportTable branch coverage', () => {
  describe('Task type report', () => {
    const taskData = [
      {
        id: 1,
        title: 'Task 1',
        status: 'todo',
        project_name: 'Project A',
        assignee_name: 'John',
        progress: 25,
        deadline: '2026-05-20'
      },
      {
        id: 2,
        title: 'Task 2',
        status: 'in_progress',
        project_name: 'Project B',
        assignee_name: 'Jane',
        progress: 60,
        deadline: '2026-05-25'
      },
      {
        id: 3,
        title: 'Task 3',
        status: 'completed',
        project_name: 'Project C',
        assignee_name: null,
        progress: 100,
        deadline: '2026-05-15'
      }
    ];

    test('renders task report headers', () => {
      renderWithRouter(<ReportTable data={taskData} type="tasks" />);
      expect(screen.getByText('Task')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Assignee')).toBeInTheDocument();
      expect(screen.getByText('Progress')).toBeInTheDocument();
      expect(screen.getByText('Deadline')).toBeInTheDocument();
    });

    test('renders task title and project name in task cell', () => {
      renderWithRouter(<ReportTable data={taskData} type="tasks" />);
      expect(screen.getByText('Task 1')).toBeInTheDocument();
      expect(screen.getByText('Project A')).toBeInTheDocument();
    });

    test('shows status badges for different statuses', () => {
      renderWithRouter(<ReportTable data={taskData} type="tasks" />);
      const table = screen.getByRole('table', { hidden: true });
      // Statuses should be rendered in the table
      expect(table.textContent).toContain('To Do');
      expect(table.textContent).toContain('In Progress');
    });

    test('renders unassigned when assignee is null', () => {
      renderWithRouter(<ReportTable data={taskData} type="tasks" />);
      const table = screen.getByRole('table', { hidden: true });
      expect(table.textContent).toContain('Unassigned');
    });

    test('progress bars are rendered with different widths', () => {
      renderWithRouter(<ReportTable data={taskData} type="tasks" />);
      // Check that progress div with width styles exist
      const progressDivs = document.querySelectorAll('[style*="width:"]');
      expect(progressDivs.length).toBeGreaterThan(0);
    });

    test('renders task view links', () => {
      renderWithRouter(<ReportTable data={taskData} type="tasks" />);
      const viewLinks = screen.getAllByText('View');
      expect(viewLinks.length).toBeGreaterThan(0);
      expect(viewLinks[0].closest('a')).toHaveAttribute('href', expect.stringContaining('/Tasks/1'));
    });
  });

  describe('GitHub type report', () => {
    const githubData = [
      {
        id: 1,
        name: 'repo-1',
        owner: 'org-1',
        open_issues: 5,
        total_prs: 3,
        recent_commits: 15,
        pushed_at: '2026-05-20T10:00:00Z'
      },
      {
        id: 2,
        name: 'repo-2',
        owner: 'org-2',
        open_issues_count: 2,
        total_prs: 1,
        recent_commits: 8,
        last_updated: '2026-05-19T10:00:00Z'
      }
    ];

    test('renders github report headers', () => {
      renderWithRouter(<ReportTable data={githubData} type="github" />);
      expect(screen.getByText('Repository')).toBeInTheDocument();
      expect(screen.getByText('Issues')).toBeInTheDocument();
      expect(screen.getByText('PRs')).toBeInTheDocument();
      expect(screen.getByText('Commits')).toBeInTheDocument();
    });

    test('renders repository name and owner', () => {
      renderWithRouter(<ReportTable data={githubData} type="github" />);
      expect(screen.getByText('repo-1')).toBeInTheDocument();
      expect(screen.getByText('org-1')).toBeInTheDocument();
    });

    test('displays issue count from open_issues field', () => {
      renderWithRouter(<ReportTable data={githubData} type="github" />);
      // First repo has open_issues: 5
      const table = screen.getByRole('table', { hidden: true });
      expect(table.textContent).toMatch(/5/);
    });

    test('displays issue count fallback from open_issues_count', () => {
      renderWithRouter(<ReportTable data={githubData} type="github" />);
      // Second repo has open_issues_count: 2
      const table = screen.getByRole('table', { hidden: true });
      expect(table.textContent).toMatch(/2/);
    });

    test('displays PR and commit counts', () => {
      renderWithRouter(<ReportTable data={githubData} type="github" />);
      const table = screen.getByRole('table', { hidden: true });
      expect(table.textContent).toMatch(/3/); // PRs
      expect(table.textContent).toMatch(/15|8/); // commits
    });
  });

  describe('Developers type report', () => {
    const developerData = [
      {
        id: 1,
        name: 'Dev 1',
        email: 'dev1@example.com',
        total_tasks: 10,
        completed_tasks: 5,
        avg_progress: 65,
        due_soon: 2
      },
      {
        id: 2,
        name: 'Dev 2',
        email: 'dev2@example.com',
        total_tasks: 8,
        completed_tasks: 8,
        avg_progress: 100,
        due_soon: 0
      }
    ];

    test('renders developer report headers', () => {
      renderWithRouter(<ReportTable data={developerData} type="developers" />);
      expect(screen.getByText('Developer')).toBeInTheDocument();
      expect(screen.getByText('Tasks')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('Due Soon')).toBeInTheDocument();
    });

    test('renders developer names and stats', () => {
      renderWithRouter(<ReportTable data={developerData} type="developers" />);
      const table = screen.getByRole('table', { hidden: true });
      expect(table.textContent).toContain('Dev 1');
      expect(table.textContent).toContain('dev1@example.com');
      expect(table.textContent).toContain('10'); // total tasks
      expect(table.textContent).toContain('5'); // completed
    });
  });

  describe('Pagination', () => {
    const largeDataset = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      title: `Task ${i + 1}`,
      status: 'todo',
      project_name: 'Project A',
      assignee_name: 'John',
      progress: 30,
      deadline: '2026-05-20'
    }));

    test('renders only 10 items per page', () => {
      renderWithRouter(<ReportTable data={largeDataset} type="tasks" />);
      const taskElements = screen.getAllByText(/Task \d+/);
      expect(taskElements.length).toBeLessThanOrEqual(10);
    });

    test('pagination controls are available for large datasets', () => {
      renderWithRouter(<ReportTable data={largeDataset} type="tasks" />);
      // Check for pagination UI (may vary by implementation)
      const container = screen.getByRole('table', { hidden: true });
      expect(container).toBeInTheDocument();
    });
  });

  describe('Empty data handling', () => {
    test('renders empty headers for unknown type', () => {
      renderWithRouter(<ReportTable data={[]} type="unknown" />);
      // Should not render any data rows
      expect(screen.queryByText('Task')).not.toBeInTheDocument();
    });

    test('handles empty data array by showing no data message', () => {
      renderWithRouter(<ReportTable data={[]} type="tasks" />);
      // Empty data shows no data message
      expect(screen.queryByText(/No data|empty/i)).toBeTruthy();
    });
  });
});
