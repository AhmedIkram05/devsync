import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import GitHubCallback from '../../pages/GitHubCallback';
import { useAuth } from '../../context/AuthContext';
import { githubService } from '../../services/github';
import { authApi } from '../../services/utils/auth';

const mockNavigate = jest.fn();
const mockUseLocation = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useLocation: () => mockUseLocation(),
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../services/github', () => ({
  githubService: {
    completeOAuthFlow: jest.fn(),
  },
}));

jest.mock('../../services/utils/auth', () => ({
  authApi: {
    getCurrentUser: jest.fn(),
    updateGitHubStatus: jest.fn(),
  },
}));

jest.mock('../../components/LoadingSpinner', () => () => <div>Loading spinner</div>);

describe('GitHubCallback page', () => {
  let setCurrentUser;
  let setAuthError;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'error').mockImplementation(() => {});

    setCurrentUser = jest.fn();
    setAuthError = jest.fn();

    mockNavigate.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue({ search: '' });

    useAuth.mockReturnValue({
      currentUser: { id: 7, token: 'token-7' },
      setCurrentUser,
      setError: setAuthError,
    });

    githubService.completeOAuthFlow.mockReset();
    githubService.completeOAuthFlow.mockResolvedValue({
      success: true,
      github_username: 'octocat',
    });

    authApi.getCurrentUser.mockReset();
    authApi.getCurrentUser.mockReturnValue({
      id: 7,
      email: 'dev@example.com',
      token: 'token-7',
    });

    authApi.updateGitHubStatus.mockReset();
    authApi.updateGitHubStatus.mockReturnValue({
      id: 7,
      token: 'token-7',
      github_connected: true,
      github_username: 'octocat',
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('handles github_success callback params and redirects to github integration', async () => {
    mockUseLocation.mockReturnValue({
      search: '?github_success=true&github_username=octocat&user_id=7',
    });

    render(<GitHubCallback />);

    expect(await screen.findByText(/Successfully connected to GitHub!/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(authApi.updateGitHubStatus).toHaveBeenCalledWith(true, 'octocat');
    });

    expect(setCurrentUser).toHaveBeenCalledWith(
      expect.objectContaining({ github_connected: true, github_username: 'octocat' })
    );

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/github', { replace: true });
  });

  test('renders explicit callback error and returns to github integration', async () => {
    mockUseLocation.mockReturnValue({ search: '?error=access_denied' });

    render(<GitHubCallback />);

    expect(await screen.findByText(/GitHub connection error: access_denied/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /return to github integration/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/github');
  });

  test('shows no-code error when callback is missing authorization code', async () => {
    mockUseLocation.mockReturnValue({ search: '?state=state-only' });

    render(<GitHubCallback />);

    expect(await screen.findByText(/No authorization code received from GitHub/i)).toBeInTheDocument();
  });

  test('redirects to login when no authenticated user is available for callback exchange', async () => {
    mockUseLocation.mockReturnValue({ search: '?code=abc123&state=state-1' });
    useAuth.mockReturnValue({
      currentUser: null,
      setCurrentUser,
      setError: setAuthError,
    });
    authApi.getCurrentUser.mockReturnValue(null);

    render(<GitHubCallback />);

    expect(await screen.findByText(/Authentication required. Please log in again./i)).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/login', {
      replace: true,
      state: { from: '/github' },
    });
  });

  test('completes OAuth code flow, updates user, and redirects to integration page', async () => {
    mockUseLocation.mockReturnValue({ search: '?code=oauth-code&state=oauth-state' });

    render(<GitHubCallback />);

    await waitFor(() => {
      expect(githubService.completeOAuthFlow).toHaveBeenCalledWith('oauth-code', 'oauth-state');
    });

    await waitFor(() => {
      expect(authApi.updateGitHubStatus).toHaveBeenCalledWith(true, 'octocat');
    });

    expect(setCurrentUser).toHaveBeenCalledWith(
      expect.objectContaining({ github_connected: true, github_username: 'octocat' })
    );

    act(() => {
      jest.advanceTimersByTime(1500);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/github', { replace: true });
  });

  test('shows server connection guidance when OAuth exchange fails due to network issue', async () => {
    mockUseLocation.mockReturnValue({ search: '?code=oauth-code&state=oauth-state' });
    githubService.completeOAuthFlow.mockRejectedValue(new Error('Failed to fetch'));

    render(<GitHubCallback />);

    expect(
      await screen.findByText(/Server connection error. Please ensure the server is running and try again./i)
    ).toBeInTheDocument();
  });

  test('try again button restarts failed flow without code by returning to github page', async () => {
    mockUseLocation.mockReturnValue({ search: '?error=temporary_error' });

    render(<GitHubCallback />);

    expect(await screen.findByText(/GitHub connection error: temporary_error/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/github');
  });
});
