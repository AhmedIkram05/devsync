import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import ReportTable from '../../components/ReportTable';

const renderTable = (data, type) => {
  return render(
    <MemoryRouter>
      <ReportTable data={data} type={type} />
    </MemoryRouter>
  );
};

const buildTask = (id, status = 'todo', progress = 0) => ({
  id,
  title: `Task ${id}`,
  project_name: `Project ${id}`,
  status,
  assignee_name: id % 2 === 0 ? `Assignee ${id}` : null,
  progress,
  deadline: '2099-02-01T00:00:00.000Z',
});

describe('ReportTable', () => {
  test('shows empty-state message when no data is provided', () => {
    renderTable([], 'tasks');

    expect(screen.getByText(/No data available for this report/i)).toBeInTheDocument();
  });

  test('renders task report cells including all major status labels and action links', () => {
    const tasks = [
      buildTask(1, 'in_progress', 75),
      buildTask(2, 'todo', 0),
      buildTask(3, 'review', 10),
      buildTask(4, 'backlog', 55),
      buildTask(5, 'completed', 100),
    ];

    renderTable(tasks, 'tasks');

    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('To Do')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('Backlog')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getAllByText('View').length).toBe(5);
    expect(screen.getAllByText('Unassigned').length).toBeGreaterThan(0);
  });

  test('renders GitHub report rows and external action links', () => {
    const repositories = [
      {
        name: 'devsync',
        owner: 'ahmedikram',
        open_issues: 3,
        open_prs: 2,
        recent_commits: 6,
        last_updated: '2099-03-01T00:00:00.000Z',
        html_url: 'https://github.com/AhmedIkram05/devsync',
      },
    ];

    renderTable(repositories, 'github');

    expect(screen.getByText('devsync')).toBeInTheDocument();
    const externalLink = screen.getByRole('link', { name: /View on GitHub/i });
    expect(externalLink).toHaveAttribute('target', '_blank');
    expect(externalLink).toHaveAttribute('href', 'https://github.com/AhmedIkram05/devsync');
  });

  test('renders developer report rows and assignee-filter links', () => {
    const developers = [
      {
        id: 9,
        name: 'Developer One',
        email: 'dev1@example.com',
        total_tasks: 8,
        completed_tasks: 5,
        avg_progress: 62,
        due_soon: 2,
      },
    ];

    renderTable(developers, 'developers');

    expect(screen.getByText('Developer One')).toBeInTheDocument();
    const tasksLink = screen.getByRole('link', { name: /View Tasks/i });
    expect(tasksLink).toHaveAttribute('href', '/tasks?assignee=9');
  });

  test('handles pagination across pages for medium-sized datasets', () => {
    const tasks = Array.from({ length: 12 }, (_, index) => buildTask(index + 1, 'todo', 0));
    renderTable(tasks, 'tasks');

    expect(
      screen.getAllByText((_, element) =>
        element?.textContent?.includes('Showing 1 to 10 of 12 results')
      ).length
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: /Next/i })[0]);
    expect(
      screen.getAllByText((_, element) =>
        element?.textContent?.includes('Showing 11 to 12 of 12 results')
      ).length
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: /Previous/i })[0]);
    expect(
      screen.getAllByText((_, element) =>
        element?.textContent?.includes('Showing 1 to 10 of 12 results')
      ).length
    ).toBeGreaterThan(0);
  });

  test('renders ellipsis pagination mode when total pages exceed seven', () => {
    const tasks = Array.from({ length: 80 }, (_, index) => buildTask(index + 1, 'todo', 0));
    renderTable(tasks, 'tasks');

    expect(screen.getAllByText('...').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: '8' }));
    expect(
      screen.getAllByText((_, element) =>
        element?.textContent?.includes('Showing 71 to 80 of 80 results')
      ).length
    ).toBeGreaterThan(0);
  });
});
