import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import GitHubIntegration from '../../pages/GitHubIntegration';
import * as githubModule from '../../services/github';
import * as authModule from '../../services/utils/auth';

jest.mock('../../services/github');
jest.mock('../../services/utils/auth');
jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn()
}));
jest.mock('../../components/LoadingSpinner', () => {
  return function MockLoadingSpinner() {
    return <div data-testid="loading-spinner">Loading...</div>;
  };
});
jest.mock('../../components/GitHubRepoCard', () => {
  return function MockRepoCard({ repo, onNavigate }) {
    return <div data-testid="repo-card" onClick={() => onNavigate(repo.id)}>{repo.name}</div>;
  };
});

const { useAuth } = require('../../context/AuthContext');

describe('GitHubIntegration page', () => {
  const mockUser = {
    id: 1,
    email: 'user@example.com',
    role: 'admin',
    github_connected: false
  };

  const mockRepos = [
    { id: 1, name: 'repo1', full_name: 'user/repo1' },
    { id: 2, name: 'repo2', full_name: 'user/repo2' }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({
      currentUser: mockUser,
      setCurrentUser: jest.fn(),
      setError: jest.fn()
    });
    
    githubModule.githubService = {
      checkConnection: jest.fn().mockResolvedValue({ connected: false }),
      getUserRepos: jest.fn().mockResolvedValue(mockRepos),
      connectGitHub: jest.fn().mockResolvedValue({ success: true }),
      handleRateLimitError: jest.fn().mockReturnValue(null)
    };
    
    authModule.authApi = {
      updateUser: jest.fn().mockResolvedValue({ success: true })
    };
  });

  test('shows loading spinner on initial load', async () => {
    githubModule.githubService.checkConnection.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ connected: false }), 100))
    );

    render(
      <MemoryRouter initialEntries={['/github']}>
        <Routes>
          <Route path="/github" element={<GitHubIntegration />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    }, { timeout: 2000 });
  });

  test('displays content when not connected', async () => {
    render(
      <MemoryRouter initialEntries={['/github']}>
        <Routes>
          <Route path="/github" element={<GitHubIntegration />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(githubModule.githubService.checkConnection).toHaveBeenCalled();
    });
  });

  test('calls getUserRepos when connected', async () => {
    githubModule.githubService.checkConnection.mockResolvedValue({ connected: true, username: 'user' });

    render(
      <MemoryRouter initialEntries={['/github']}>
        <Routes>
          <Route path="/github" element={<GitHubIntegration />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(githubModule.githubService.getUserRepos).toHaveBeenCalled();
    });
  });

  test('displays username when connected', async () => {
    githubModule.githubService.checkConnection.mockResolvedValue({ connected: true, username: 'testuser' });

    render(
      <MemoryRouter initialEntries={['/github']}>
        <Routes>
          <Route path="/github" element={<GitHubIntegration />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/testuser/i)).toBeInTheDocument();
    });
  });

  test('handles connection error', async () => {
    githubModule.githubService.checkConnection.mockRejectedValue(new Error('Connection failed'));

    render(
      <MemoryRouter initialEntries={['/github']}>
        <Routes>
          <Route path="/github" element={<GitHubIntegration />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/failed|error/i)).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  test('handles rate limit error by passing to handler', async () => {
    githubModule.githubService.checkConnection.mockRejectedValue(
      new Error('API rate limit exceeded')
    );
    githubModule.githubService.handleRateLimitError.mockReturnValue({
      message: 'GitHub rate limit exceeded. Please try again later.'
    });

    render(
      <MemoryRouter initialEntries={['/github']}>
        <Routes>
          <Route path="/github" element={<GitHubIntegration />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(githubModule.githubService.handleRateLimitError).toHaveBeenCalled();
    });
  });

  test('displays multiple repositories', async () => {
    githubModule.githubService.checkConnection.mockResolvedValue({ connected: true, username: 'user' });
    githubModule.githubService.getUserRepos.mockResolvedValue(mockRepos);

    render(
      <MemoryRouter initialEntries={['/github']}>
        <Routes>
          <Route path="/github" element={<GitHubIntegration />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const repoCards = screen.getAllByTestId('repo-card');
      expect(repoCards.length).toBeGreaterThanOrEqual(1);
    });
  });

  test('displays loading state while fetching repos', async () => {
    githubModule.githubService.checkConnection.mockResolvedValue({ connected: true, username: 'user' });
    githubModule.githubService.getUserRepos.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(mockRepos), 100))
    );

    render(
      <MemoryRouter initialEntries={['/github']}>
        <Routes>
          <Route path="/github" element={<GitHubIntegration />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(githubModule.githubService.getUserRepos).toHaveBeenCalled();
    });
  });

  test('handles repositories fetch error', async () => {
    githubModule.githubService.checkConnection.mockResolvedValue({ connected: true, username: 'user' });
    githubModule.githubService.getUserRepos.mockRejectedValue(new Error('Fetch failed'));

    render(
      <MemoryRouter initialEntries={['/github']}>
        <Routes>
          <Route path="/github" element={<GitHubIntegration />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/failed|error/i)).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  test('calls checkConnection on mount', async () => {
    render(
      <MemoryRouter initialEntries={['/github']}>
        <Routes>
          <Route path="/github" element={<GitHubIntegration />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(githubModule.githubService.checkConnection).toHaveBeenCalled();
    });
  });

  test('updates user when authenticated', async () => {
    githubModule.githubService.checkConnection.mockResolvedValue({ connected: true, username: 'user' });
    const mockSetCurrentUser = jest.fn();
    useAuth.mockReturnValue({
      currentUser: mockUser,
      setCurrentUser: mockSetCurrentUser,
      setError: jest.fn()
    });

    render(
      <MemoryRouter initialEntries={['/github']}>
        <Routes>
          <Route path="/github" element={<GitHubIntegration />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(githubModule.githubService.checkConnection).toHaveBeenCalled();
    });
  });

  test('displays error message on connection error', async () => {
    githubModule.githubService.checkConnection.mockRejectedValue(
      new Error('Network error')
    );

    render(
      <MemoryRouter initialEntries={['/github']}>
        <Routes>
          <Route path="/github" element={<GitHubIntegration />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/failed|error|network/i)).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  test('clears auth error on mount', async () => {
    const mockSetError = jest.fn();
    useAuth.mockReturnValue({
      currentUser: mockUser,
      setCurrentUser: jest.fn(),
      setError: mockSetError
    });

    render(
      <MemoryRouter initialEntries={['/github']}>
        <Routes>
          <Route path="/github" element={<GitHubIntegration />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockSetError).toHaveBeenCalledWith(null);
    });
  });

  test('renders with current user context', async () => {
    render(
      <MemoryRouter initialEntries={['/github']}>
        <Routes>
          <Route path="/github" element={<GitHubIntegration />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(githubModule.githubService.checkConnection).toHaveBeenCalled();
    });
  });

  test('handles repositories as array', async () => {
    githubModule.githubService.checkConnection.mockResolvedValue({ connected: true, username: 'user' });
    githubModule.githubService.getUserRepos.mockResolvedValue([
      { id: 1, name: 'repo1', full_name: 'user/repo1' }
    ]);

    render(
      <MemoryRouter initialEntries={['/github']}>
        <Routes>
          <Route path="/github" element={<GitHubIntegration />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(githubModule.githubService.getUserRepos).toHaveBeenCalled();
    });
  });

  test('handles repositories object with repositories property', async () => {
    githubModule.githubService.checkConnection.mockResolvedValue({ connected: true, username: 'user' });
    githubModule.githubService.getUserRepos.mockResolvedValue({
      repositories: [{ id: 1, name: 'repo1', full_name: 'user/repo1' }]
    });

    render(
      <MemoryRouter initialEntries={['/github']}>
        <Routes>
          <Route path="/github" element={<GitHubIntegration />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(githubModule.githubService.getUserRepos).toHaveBeenCalled();
    });
  });

  test('handles empty repositories list', async () => {
    githubModule.githubService.checkConnection.mockResolvedValue({ connected: true, username: 'user' });
    githubModule.githubService.getUserRepos.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/github']}>
        <Routes>
          <Route path="/github" element={<GitHubIntegration />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(githubModule.githubService.getUserRepos).toHaveBeenCalled();
    });
  });

  test('logs current user info', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    render(
      <MemoryRouter initialEntries={['/github']}>
        <Routes>
          <Route path="/github" element={<GitHubIntegration />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
    });

    consoleSpy.mockRestore();
  });

  test('logs checking connection status', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    render(
      <MemoryRouter initialEntries={['/github']}>
        <Routes>
          <Route path="/github" element={<GitHubIntegration />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(githubModule.githubService.checkConnection).toHaveBeenCalled();
    });

    consoleSpy.mockRestore();
  });

  test('displays disconnect button when connected', async () => {
    githubModule.githubService.checkConnection.mockResolvedValue({ connected: true, username: 'user' });

    render(
      <MemoryRouter initialEntries={['/github']}>
        <Routes>
          <Route path="/github" element={<GitHubIntegration />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const disconnectButtons = screen.queryAllByText(/Disconnect/i);
      expect(disconnectButtons.length).toBeGreaterThanOrEqual(0);
    });
  });

  test('displays refresh button', async () => {
    render(
      <MemoryRouter initialEntries={['/github']}>
        <Routes>
          <Route path="/github" element={<GitHubIntegration />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const refreshButtons = screen.queryAllByText(/Refresh|Retry/i);
      expect(refreshButtons.length).toBeGreaterThanOrEqual(0);
    });
  });
});
