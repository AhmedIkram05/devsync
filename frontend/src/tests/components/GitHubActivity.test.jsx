import React from 'react';
import { render, screen } from '@testing-library/react';

import GitHubActivity from '../../components/GitHubActivity';

describe('GitHubActivity component', () => {
  test('shows empty activity fallback', () => {
    render(<GitHubActivity activity={[]} />);

    expect(screen.getByText(/No recent GitHub activity/i)).toBeInTheDocument();
  });

  test('renders pull request and issue activity items with status and repository', () => {
    render(
      <GitHubActivity
        activity={[
          {
            id: 1,
            type: 'pull_request',
            number: 11,
            title: 'Improve deployment docs',
            state: 'open',
            updated_at: '2099-01-01T00:00:00.000Z',
            repository: { name: 'org/docs' },
          },
          {
            id: 2,
            type: 'issue',
            number: 7,
            title: 'Fix task filter edge case',
            state: 'closed',
            updated_at: '2099-01-02T00:00:00.000Z',
            repository: { name: 'org/frontend' },
          },
        ]}
      />
    );

    expect(screen.getByText('PR #11:')).toBeInTheDocument();
    expect(screen.getByText('Issue #7:')).toBeInTheDocument();
    expect(screen.getByText('Improve deployment docs')).toBeInTheDocument();
    expect(screen.getByText('Fix task filter edge case')).toBeInTheDocument();
    expect(screen.getByText('open')).toBeInTheDocument();
    expect(screen.getByText('closed')).toBeInTheDocument();
    expect(screen.getByText('org/docs')).toBeInTheDocument();
    expect(screen.getByText('org/frontend')).toBeInTheDocument();
  });

  test('defaults to empty activity when no props are provided', () => {
    render(<GitHubActivity />);

    expect(screen.getByText(/No recent GitHub activity/i)).toBeInTheDocument();
  });

  test('tolerates a null activity prop', () => {
    render(<GitHubActivity activity={null} />);

    expect(screen.getByText(/No recent GitHub activity/i)).toBeInTheDocument();
  });

  test('falls back for missing PR/issue numbers and repository name', () => {
    render(
      <GitHubActivity
        activity={[
          { type: 'pull_request' },
          { type: 'issue' },
          { id: 'x', type: 'other', title: 'Trimmed', state: 'open', repository: {} },
        ]}
      />
    );

    expect(screen.getByText('PR #?:')).toBeInTheDocument();
    expect(screen.getByText('Issue #?:')).toBeInTheDocument();
    expect(screen.getByText('Unknown repository')).toBeInTheDocument();
  });

  test('uses fallback labels for unknown activity fields', () => {
    render(
      <GitHubActivity
        activity={[
          {
            type: 'other',
            title: '',
            state: '',
            updated_at: null,
          },
        ]}
      />
    );

    expect(screen.getByText('Untitled')).toBeInTheDocument();
    expect(screen.getByText('unknown')).toBeInTheDocument();
    expect(screen.getByText('Unknown date')).toBeInTheDocument();
  });
});
