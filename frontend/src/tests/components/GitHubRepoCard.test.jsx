import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import GitHubRepoCard from '../../components/GitHubRepoCard';

const renderRepoCard = (repo) => {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <GitHubRepoCard repo={repo} />
    </MemoryRouter>
  );
};

describe('GitHubRepoCard component', () => {
  test('renders repository details with navigation links', () => {
    renderRepoCard({
      id: 123,
      name: 'devsync-frontend',
      private: false,
      description: 'Frontend application for team collaboration',
      language: 'JavaScript',
      updated_at: '2099-01-03T00:00:00.000Z',
      html_url: 'https://github.com/org/devsync-frontend',
    });

    expect(screen.getByText('devsync-frontend')).toBeInTheDocument();
    expect(screen.getByText('Public')).toBeInTheDocument();
    expect(screen.getByText('Frontend application for team collaboration')).toBeInTheDocument();
    expect(screen.getByText('JavaScript')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /view on github/i })).toHaveAttribute(
      'href',
      'https://github.com/org/devsync-frontend'
    );
    expect(screen.getByRole('link', { name: /view details/i })).toHaveAttribute(
      'href',
      '/githubintegrationdetail/123'
    );
  });

  test('renders fallback values for missing description, language, and update date', () => {
    renderRepoCard({
      id: 124,
      name: 'repo-with-missing-data',
      private: true,
      description: '',
      language: '',
      updated_at: '',
      html_url: 'https://github.com/org/repo-with-missing-data',
    });

    expect(screen.getByText('Private')).toBeInTheDocument();
    expect(screen.getByText('No description provided')).toBeInTheDocument();
    expect(screen.getByText(/Updated: Unknown/i)).toBeInTheDocument();
    expect(screen.queryByText('JavaScript')).not.toBeInTheDocument();
  });
});
