import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import TaskColumns from '../../components/TaskColumns';

const renderColumns = (tasks) => {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <TaskColumns tasks={tasks} />
    </MemoryRouter>
  );
};

describe('TaskColumns component', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('groups tasks into todo, in-progress, and completed columns', () => {
    renderColumns([
      {
        id: 1,
        title: 'Backlog planning',
        status: 'backlog',
        priority: 'high',
        deadline: '2099-01-10T00:00:00.000Z',
      },
      {
        id: 2,
        title: 'Build API adapter',
        status: 'in_progress',
        progress: 45,
        deadline: '2099-01-12T00:00:00.000Z',
      },
      {
        id: 3,
        title: 'Write regression tests',
        status: 'completed',
        deadline: '2099-01-09T00:00:00.000Z',
      },
      {
        id: 4,
        title: 'Draft release notes',
        status: 'todo',
        priority: 'low',
        deadline: '2099-01-15T00:00:00.000Z',
      },
    ]);

    expect(screen.getByText('To Do (2)')).toBeInTheDocument();
    expect(screen.getByText('In Progress (1)')).toBeInTheDocument();
    expect(screen.getByText('Completed (1)')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /Backlog planning/i })).toHaveAttribute('href', '/TaskDetailUser/1');
    expect(screen.getByText('45%')).toBeInTheDocument();
    expect(screen.getByText(/✓ Done/i)).toBeInTheDocument();
  });

  test('handles non-array tasks input and empty-column states', () => {
    renderColumns({ unexpected: true });

    expect(screen.getByText('To Do (0)')).toBeInTheDocument();
    expect(screen.getByText('In Progress (0)')).toBeInTheDocument();
    expect(screen.getByText('Completed (0)')).toBeInTheDocument();

    expect(screen.getByText('No tasks')).toBeInTheDocument();
    expect(screen.getByText('No tasks in progress')).toBeInTheDocument();
    expect(screen.getByText('No completed tasks')).toBeInTheDocument();
  });

  test('uses fallback task values when fields are missing', () => {
    renderColumns([
      {
        status: 'todo',
      },
    ]);

    expect(screen.getByText('Untitled Task')).toBeInTheDocument();
    expect(screen.getByText(/Due: No date set/i)).toBeInTheDocument();
    expect(screen.getByText(/Medium/i)).toBeInTheDocument();
  });

  test('flags overdue tasks that are not completed', () => {
    renderColumns([
      {
        id: 99,
        title: 'Overdue task',
        status: 'todo',
        priority: 'high',
        deadline: '2000-01-01T00:00:00.000Z',
      },
    ]);

    expect(screen.getByText(/Due:/i)).toBeInTheDocument();
    expect(screen.getByText(/High/i)).toBeInTheDocument();
  });
});
