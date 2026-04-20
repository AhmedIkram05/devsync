import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import GitHubIntegration from '../../pages/GitHubIntegration';
import { githubService } from '../../services/github';
import { authApi } from '../../services/utils/auth';
import { useAuth } from '../../context/AuthContext';

const mockNavigate = jest.fn();
const mockUseLocation = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useLocation: () => mockUseLocation(),
}));

jest.mock('../../services/github', () => ({
  githubService: {
    checkConnection: jest.fn(),
    getUserRepos: jest.fn(),
    initiateOAuthFlow: jest.fn(),
    completeOAuthFlow: jest.fn(),
    disconnectAccount: jest.fn(),
    handleRateLimitError: jest.fn(),
  },
}));

jest.mock('../../services/utils/auth', () => ({
  authApi: {
    updateGitHubStatus: jest.fn(),
  },
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../components/GitHubRepoCard', () => ({ repo }) => <div>Repo: {repo.name}</div>);

jest.mock('../../components/LoadingSpinner', () => (props) => {
  return <div>{props.message || 'Loading'}</div>;
});

describe('GitHubIntegration page', () => {
  let setCurrentUser;
  let setAuthError;

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});

    setCurrentUser = jest.fn();
    setAuthError = jest.fn();

    mockNavigate.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue({ search: '' });

    useAuth.mockReturnValue({
      currentUser: {
        id: 7,
        email: 'dev@example.com',
        role: 'admin',
        github_connected: false,
      },
      setCurrentUser,
      setError: setAuthError,
    });

    githubService.checkConnection.mockReset();
    githubService.getUserRepos.mockReset();
    githubService.initiateOAuthFlow.mockReset();
    githubService.completeOAuthFlow.mockReset();
    githubService.disconnectAccount.mockReset();
    githubService.handleRateLimitError.mockReset();

    githubService.checkConnection.mockResolvedValue({ connected: false, username: '' });
    githubService.getUserRepos.mockResolvedValue([]);
    githubService.initiateOAuthFlow.mockResolvedValue('https://github.com/login/oauth/authorize');
    githubService.completeOAuthFlow.mockResolvedValue({ success: true });
    githubService.disconnectAccount.mockResolvedValue({ success: true });
    githubService.handleRateLimitError.mockReturnValue(null);

    authApi.updateGitHubStatus.mockReset();
    authApi.updateGitHubStatus.mockImplementation((connected, username) => ({
      id: 7,
      github_connected: connected,
      github_username: username,
    }));

    window.confirm = jest.fn(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders disconnected view and shows connect error when oauth url is missing', async () => {
    githubService.initiateOAuthFlow.mockResolvedValueOnce('');

    render(<GitHubIntegration />);

    expect(
      await screen.findByRole('heading', { name: 'Connect Your GitHub Account' })
    ).toBeInTheDocument();
    expect(setAuthError).toHaveBeenCalledWith(null);

    fireEvent.click(screen.getByRole('button', { name: /connect with github/i }));

    await waitFor(() => {
      expect(githubService.initiateOAuthFlow).toHaveBeenCalled();
    });

    expect(
      await screen.findByText(/No GitHub authorization URL received from server/i)
    ).toBeInTheDocument();
  });

  test('completes oauth callback and updates auth state', async () => {
    const updatedUser = {
      id: 7,
      github_connected: true,
      github_username: 'octocat',
    };

    mockUseLocation.mockReturnValue({ search: '?code=abc123&state=state-1' });

    githubService.checkConnection
      .mockResolvedValueOnce({ connected: false, username: '' })
      .mockResolvedValueOnce({ connected: true, username: 'octocat' });
    githubService.getUserRepos.mockResolvedValue([{ id: 1, name: 'repo-one' }]);
    authApi.updateGitHubStatus.mockReturnValue(updatedUser);

    render(<GitHubIntegration />);

    await waitFor(() => {
      expect(githubService.completeOAuthFlow).toHaveBeenCalledWith('abc123', 'state-1');
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/github', { replace: true });
    });

    await waitFor(() => {
      expect(setCurrentUser).toHaveBeenCalledWith(updatedUser);
    });
  });

  test('renders connected state with repositories and disconnects account', async () => {
    const updatedUser = {
      id: 7,
      github_connected: false,
      github_username: '',
    };

    githubService.checkConnection.mockResolvedValue({ connected: true, username: 'octocat' });
    githubService.getUserRepos.mockResolvedValue([{ id: 9, name: 'devsync-web' }]);
    authApi.updateGitHubStatus.mockReturnValue(updatedUser);

    render(<GitHubIntegration />);

    expect(await screen.findByText(/GitHub Account Connected/i)).toBeInTheDocument();
    expect(await screen.findByText(/Repo: devsync-web/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /disconnect/i }));

    await waitFor(() => {
      expect(githubService.disconnectAccount).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(setCurrentUser).toHaveBeenCalledWith(updatedUser);
    });
  });

  test('renders rate limit callout when connection check is rate-limited', async () => {
    githubService.checkConnection.mockRejectedValue({
      status: 403,
      data: { message: 'GitHub API rate limit exceeded' },
    });
    githubService.handleRateLimitError.mockReturnValue({
      title: 'GitHub API Rate Limit Exceeded',
      message: 'API quota exceeded',
      suggestion: 'Retry in a few minutes',
    });

    render(<GitHubIntegration />);

    expect(await screen.findByText('GitHub API Rate Limit Exceeded')).toBeInTheDocument();
    expect(screen.getByText('API quota exceeded')).toBeInTheDocument();
    expect(screen.getByText('Retry in a few minutes')).toBeInTheDocument();
  });

  test('shows authentication required message on unauthorized status check', async () => {
    githubService.checkConnection.mockRejectedValue({ status: 401 });

    render(<GitHubIntegration />);

    expect(
      await screen.findByText(/Authentication required. Please login again./i)
    ).toBeInTheDocument();
  });

  test('shows repository fetch fallback error when loading repositories fails', async () => {
    githubService.checkConnection.mockResolvedValue({ connected: true, username: 'octocat' });
    githubService.getUserRepos.mockRejectedValue(new Error('repositories unavailable'));
    githubService.handleRateLimitError.mockReturnValue(null);

    render(<GitHubIntegration />);

    expect(
      await screen.findByText(/Failed to fetch repositories. Please try again later./i)
    ).toBeInTheDocument();
  });
});