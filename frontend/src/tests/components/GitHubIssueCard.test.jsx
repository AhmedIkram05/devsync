import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import GitHubIssueCard from '../../components/GitHubIssueCard';

const baseIssue = {
  id: 9001,
  number: 42,
  title: 'Fix OAuth redirect',
  state: 'open',
  html_url: 'https://github.com/org/repo/issues/42',
  body: 'Ensure callback redirect handles state mismatch.',
  user: { login: 'octocat' },
  created_at: '2099-01-01T00:00:00.000Z',
  labels: [
    { id: 1, name: 'bug' },
    { id: 2, name: 'priority:high' },
    { id: 3, name: 'backend' },
    { id: 4, name: 'frontend' },
  ],
};

describe('GitHubIssueCard component', () => {
  test('renders bug issue metadata and links issue when action is clicked', () => {
    const onLinkClick = jest.fn();

    render(<GitHubIssueCard issue={baseIssue} onLinkClick={onLinkClick} />);

    expect(screen.getByText('Bug')).toBeInTheDocument();
    expect(screen.getByText(/Opened by/i)).toBeInTheDocument();
    expect(screen.getByText('+1 more')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /link issue/i }));
    expect(onLinkClick).toHaveBeenCalledWith(9001);

    expect(screen.getByRole('link', { name: /#42 Fix OAuth redirect/i })).toHaveAttribute(
      'href',
      'https://github.com/org/repo/issues/42'
    );
  });

  test('renders closed linked-state without action button', () => {
    render(<GitHubIssueCard issue={{ ...baseIssue, state: 'closed' }} linkedTaskId={77} />);

    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.getByText('Linked to Task #77')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /link issue/i })).not.toBeInTheDocument();
  });

  test('shows disabled linking state while link request is in progress', () => {
    render(<GitHubIssueCard issue={baseIssue} onLinkClick={jest.fn()} isLinking />);

    expect(screen.getByRole('button', { name: /linking/i })).toBeDisabled();
  });
});
