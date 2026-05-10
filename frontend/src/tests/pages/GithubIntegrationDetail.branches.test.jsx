import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import GithubIntegrationDetail from '../../pages/GithubIntegrationDetail';
import * as api from '../../services/utils/api';

jest.mock('../../services/utils/api');
jest.mock('../../components/LoadingSpinner', () => {
  return function MockLoadingSpinner() {
    return <div data-testid="loading-spinner">Loading...</div>;
  };
});

describe('GithubIntegrationDetail', () => {
  const mockRepository = {
    id: 123,
    name: 'test-repo',
    full_name: 'user/test-repo',
    private: false,
    description: 'Test repository',
    language: 'JavaScript',
    updated_at: '2026-05-09T10:00:00Z',
    stargazers_count: 42,
    forks_count: 10,
    html_url: 'https://github.com/user/test-repo'
  };

  const mockIssues = [
    {
      id: 1,
      number: 101,
      title: 'Fix bug',
      body: 'Bug description',
      state: 'open',
      created_at: '2026-05-08T10:00:00Z',
      html_url: 'https://github.com/user/test-repo/issues/101',
      user: { login: 'dev1' },
      labels: [{ id: 1, name: 'bug' }]
    }
  ];

  const mockPullRequests = [
    {
      id: 201,
      number: 1,
      title: 'Fix feature',
      body: 'PR desc',
      state: 'open',
      draft: false,
      merged: false,
      created_at: '2026-05-06T10:00:00Z',
      html_url: 'https://github.com/user/test-repo/pull/1',
      user: { login: 'dev1' },
      labels: []
    },
    {
      id: 202,
      number: 2,
      title: 'WIP',
      state: 'open',
      draft: true,
      merged: false,
      created_at: '2026-05-05T10:00:00Z',
      html_url: 'https://github.com/user/test-repo/pull/2',
      user: { login: 'dev2' },
      labels: []
    },
    {
      id: 203,
      number: 3,
      title: 'Merged',
      state: 'closed',
      draft: false,
      merged: true,
      created_at: '2026-05-04T10:00:00Z',
      html_url: 'https://github.com/user/test-repo/pull/3',
      user: { login: 'dev3' },
      labels: []
    },
    {
      id: 204,
      number: 4,
      title: 'Closed',
      state: 'closed',
      draft: false,
      merged: false,
      created_at: '2026-05-03T10:00:00Z',
      html_url: 'https://github.com/user/test-repo/pull/4',
      user: { login: 'dev4' },
      labels: []
    }
  ];

  const mockTasks = [
    { id: 1, title: 'Task 1', status: 'todo' },
    { id: 2, title: 'Task 2', status: 'in_progress' },
    { id: 3, title: 'Task 3', status: 'completed' }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    api.githubService = {
      getUserRepos: jest.fn().mockResolvedValue([mockRepository]),
      getIssues: jest.fn().mockResolvedValue({ issues: mockIssues }),
      getPullRequests: jest.fn().mockResolvedValue({ pull_requests: mockPullRequests }),
      linkTaskToGithub: jest.fn().mockResolvedValue({ success: true })
    };
    api.taskService = {
      getAllTasks: jest.fn().mockResolvedValue(mockTasks)
    };
    global.alert = jest.fn();
  });

  test('shows loading spinner', async () => {
    api.githubService.getUserRepos.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve([mockRepository]), 100))
    );

    render(
      <MemoryRouter initialEntries={['/github/123']}>
        <Routes>
          <Route path="/github/:repoId" element={<GithubIntegrationDetail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    }, { timeout: 2000 });
  });

  test('displays repository info', async () => {
    render(
      <MemoryRouter initialEntries={['/github/123']}>
        <Routes>
          <Route path="/github/:repoId" element={<GithubIntegrationDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('test-repo')).toBeInTheDocument();
      expect(screen.getByText('Public')).toBeInTheDocument();
      expect(screen.getByText('Test repository')).toBeInTheDocument();
    });
  });

  test('displays private repository badge', async () => {
    const privateRepo = { ...mockRepository, private: true };
    api.githubService.getUserRepos.mockResolvedValue([privateRepo]);

    render(
      <MemoryRouter initialEntries={['/github/123']}>
        <Routes>
          <Route path="/github/:repoId" element={<GithubIntegrationDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Private')).toBeInTheDocument();
    });
  });

  test('displays pull request statuses', async () => {
    render(
      <MemoryRouter initialEntries={['/github/123']}>
        <Routes>
          <Route path="/github/:repoId" element={<GithubIntegrationDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Draft')).toBeInTheDocument();
      expect(screen.getByText('Merged')).toBeInTheDocument();
      const closedBadges = screen.getAllByText('Closed');
      expect(closedBadges.length).toBeGreaterThan(0);
    });
  });

  test('links task to issue', async () => {
    render(
      <MemoryRouter initialEntries={['/github/123']}>
        <Routes>
          <Route path="/github/:repoId" element={<GithubIntegrationDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const select = screen.getByDisplayValue('Choose a task...');
      fireEvent.change(select, { target: { value: '1' } });
    });

    const linkButtons = screen.getAllByText('Link to Task');
    if (linkButtons.length > 1) fireEvent.click(linkButtons[1]);

    await waitFor(() => {
      expect(api.githubService.linkTaskToGithub).toHaveBeenCalled();
    });
  });

  test('shows error when repository not found', async () => {
    api.githubService.getUserRepos.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/github/999']}>
        <Routes>
          <Route path="/github/:repoId" element={<GithubIntegrationDetail />} />
          <Route path="/github" element={<div>GitHub</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Repository not found|Failed to fetch/i)).toBeInTheDocument();
    });
  });

  test('shows back link on error', async () => {
    api.githubService.getUserRepos.mockRejectedValue(new Error('API Error'));

    render(
      <MemoryRouter initialEntries={['/github/123']}>
        <Routes>
          <Route path="/github/:repoId" element={<GithubIntegrationDetail />} />
          <Route path="/github" element={<div>GitHub</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const backLink = screen.getByRole('link', { name: /Back to GitHub/i });
      expect(backLink).toBeInTheDocument();
    });
  });

  test('displays no tasks message', async () => {
    api.taskService.getAllTasks.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/github/123']}>
        <Routes>
          <Route path="/github/:repoId" element={<GithubIntegrationDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/No available tasks found/i)).toBeInTheDocument();
    });
  });

  test('displays empty issues message', async () => {
    api.githubService.getIssues.mockResolvedValue({ issues: [] });

    render(
      <MemoryRouter initialEntries={['/github/123']}>
        <Routes>
          <Route path="/github/:repoId" element={<GithubIntegrationDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/No issues found/i)).toBeInTheDocument();
    });
  });

  test('displays empty PRs message', async () => {
    api.githubService.getPullRequests.mockResolvedValue({ pull_requests: [] });

    render(
      <MemoryRouter initialEntries={['/github/123']}>
        <Routes>
          <Route path="/github/:repoId" element={<GithubIntegrationDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/No pull requests found/i)).toBeInTheDocument();
    });
  });

  test('shows success message after linking', async () => {
    render(
      <MemoryRouter initialEntries={['/github/123']}>
        <Routes>
          <Route path="/github/:repoId" element={<GithubIntegrationDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const select = screen.getByDisplayValue('Choose a task...');
      fireEvent.change(select, { target: { value: '1' } });
    });

    const linkButtons = screen.getAllByText('Link to Task');
    if (linkButtons.length > 1) fireEvent.click(linkButtons[1]);

    await waitFor(() => {
      expect(screen.getByText(/Successfully linked/i)).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  test('handles link error', async () => {
    api.githubService.linkTaskToGithub.mockRejectedValue(new Error('Failed'));

    render(
      <MemoryRouter initialEntries={['/github/123']}>
        <Routes>
          <Route path="/github/:repoId" element={<GithubIntegrationDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const select = screen.getByDisplayValue('Choose a task...');
      fireEvent.change(select, { target: { value: '1' } });
    });

    const linkButtons = screen.getAllByText('Link to Task');
    if (linkButtons.length > 1) fireEvent.click(linkButtons[1]);

    await waitFor(() => {
      expect(screen.getByText(/Failed to link/i)).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  test('disables button when no task selected', async () => {
    render(
      <MemoryRouter initialEntries={['/github/123']}>
        <Routes>
          <Route path="/github/:repoId" element={<GithubIntegrationDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const linkButtons = screen.getAllByText('Link to Task');
      expect(linkButtons[0]).toHaveAttribute('disabled');
    });
  });

  test('enables button when task selected', async () => {
    render(
      <MemoryRouter initialEntries={['/github/123']}>
        <Routes>
          <Route path="/github/:repoId" element={<GithubIntegrationDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const select = screen.getByDisplayValue('Choose a task...');
      fireEvent.change(select, { target: { value: '1' } });
    });

    await waitFor(() => {
      const linkButtons = screen.getAllByText('Link to Task');
      expect(linkButtons[0]).not.toHaveAttribute('disabled');
    });
  });

  test('displays issue labels', async () => {
    render(
      <MemoryRouter initialEntries={['/github/123']}>
        <Routes>
          <Route path="/github/:repoId" element={<GithubIntegrationDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('bug')).toBeInTheDocument();
    });
  });

  test('displays metadata', async () => {
    render(
      <MemoryRouter initialEntries={['/github/123']}>
        <Routes>
          <Route path="/github/:repoId" element={<GithubIntegrationDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Stars: 42/)).toBeInTheDocument();
      expect(screen.getByText(/Forks: 10/)).toBeInTheDocument();
    });
  });

  test('displays language', async () => {
    render(
      <MemoryRouter initialEntries={['/github/123']}>
        <Routes>
          <Route path="/github/:repoId" element={<GithubIntegrationDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('JavaScript')).toBeInTheDocument();
    });
  });

  test('shows GitHub link', async () => {
    render(
      <MemoryRouter initialEntries={['/github/123']}>
        <Routes>
          <Route path="/github/:repoId" element={<GithubIntegrationDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /View on GitHub/i });
      expect(link).toHaveAttribute('target', '_blank');
    });
  });

  test('links PR to task', async () => {
    render(
      <MemoryRouter initialEntries={['/github/123']}>
        <Routes>
          <Route path="/github/:repoId" element={<GithubIntegrationDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const select = screen.getByDisplayValue('Choose a task...');
      fireEvent.change(select, { target: { value: '2' } });
    });

    const linkButtons = screen.getAllByText('Link to Task');
    if (linkButtons.length > 0) fireEvent.click(linkButtons[0]);

    await waitFor(() => {
      expect(api.githubService.linkTaskToGithub).toHaveBeenCalled();
    });
  });

  test('shows default description', async () => {
    const repo = { ...mockRepository, description: null };
    api.githubService.getUserRepos.mockResolvedValue([repo]);

    render(
      <MemoryRouter initialEntries={['/github/123']}>
        <Routes>
          <Route path="/github/:repoId" element={<GithubIntegrationDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('No description provided')).toBeInTheDocument();
    });
  });

  test('fetches on load', async () => {
    render(
      <MemoryRouter initialEntries={['/github/123']}>
        <Routes>
          <Route path="/github/:repoId" element={<GithubIntegrationDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(api.githubService.getIssues).toHaveBeenCalled();
      expect(api.githubService.getPullRequests).toHaveBeenCalled();
      expect(api.taskService.getAllTasks).toHaveBeenCalled();
    });
  });

  test('displays PR body', async () => {
    render(
      <MemoryRouter initialEntries={['/github/123']}>
        <Routes>
          <Route path="/github/:repoId" element={<GithubIntegrationDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/PR desc/)).toBeInTheDocument();
    });
  });

  test('displays issue body', async () => {
    render(
      <MemoryRouter initialEntries={['/github/123']}>
        <Routes>
          <Route path="/github/:repoId" element={<GithubIntegrationDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Bug description/)).toBeInTheDocument();
    });
  });

  test('PR without description doesnt error', async () => {
    const prs = [{ ...mockPullRequests[0], body: null }];
    api.githubService.getPullRequests.mockResolvedValue({ pull_requests: prs });

    render(
      <MemoryRouter initialEntries={['/github/123']}>
        <Routes>
          <Route path="/github/:repoId" element={<GithubIntegrationDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(api.githubService.getPullRequests).toHaveBeenCalled();
    });
  });

  test('issue without description doesnt error', async () => {
    const issues = [{ ...mockIssues[0], body: null }];
    api.githubService.getIssues.mockResolvedValue({ issues });

    render(
      <MemoryRouter initialEntries={['/github/123']}>
        <Routes>
          <Route path="/github/:repoId" element={<GithubIntegrationDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(api.githubService.getIssues).toHaveBeenCalled();
    });
  });
});
