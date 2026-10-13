import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

import GitHubCallback from '../../pages/GitHubCallback';
import { githubService, OAUTH_STATE_TTL_MS } from '../../services/github';
import { githubService as legacyGithubService } from '../../services/utils/api';
import { useAuth } from '../../context/AuthContext';
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

jest.mock('../../services/utils/auth', () => ({
  csrfHeaders: () => ({}),
  authApi: {
    getCurrentUser: jest.fn(),
    updateGitHubStatus: jest.fn(),
  },
}));

jest.mock('../../components/LoadingSpinner', () => () => <div>Loading spinner</div>);

const jsonResponse = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: jest.fn().mockResolvedValue(payload),
  headers: { get: () => 'application/json' },
});

describe('GitHubCallback OAuth single-owner strict state', () => {
  let setCurrentUser;
  let setAuthError;

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    sessionStorage.clear();
    localStorage.clear();
    global.fetch = jest.fn();

    setCurrentUser = jest.fn();
    setAuthError = jest.fn();
    mockNavigate.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue({ search: '' });

    useAuth.mockReturnValue({
      currentUser: { id: 7, email: 'dev@example.com' },
      setCurrentUser,
      setError: setAuthError,
    });
    authApi.getCurrentUser.mockReturnValue({ id: 7, email: 'dev@example.com' });
    authApi.updateGitHubStatus.mockReturnValue({
      id: 7,
      github_connected: true,
      github_username: 'octocat',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  test('state mismatch is rejected before any token exchange', async () => {
    sessionStorage.setItem('github_oauth_state', 'expected-state');
    sessionStorage.setItem('github_oauth_state_ts', String(Date.now()));
    mockUseLocation.mockReturnValue({ search: '?code=oauth-code&state=attacker-state' });

    render(<GitHubCallback />);

    expect(
      await screen.findByText(/Error processing GitHub authorization: Security validation failed/i)
    ).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
    // Single-use: mismatched state is consumed
    expect(sessionStorage.getItem('github_oauth_state')).toBeNull();
  });

  test('expired state (TTL) is rejected before any token exchange', async () => {
    sessionStorage.setItem('github_oauth_state', 'state-123');
    sessionStorage.setItem(
      'github_oauth_state_ts',
      String(Date.now() - OAUTH_STATE_TTL_MS - 60 * 1000)
    );
    mockUseLocation.mockReturnValue({ search: '?code=oauth-code&state=state-123' });

    render(<GitHubCallback />);

    expect(
      await screen.findByText(/Error processing GitHub authorization: Security validation failed/i)
    ).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('github_oauth_state')).toBeNull();
  });

  test('replay of a consumed state is rejected (single-use)', async () => {
    sessionStorage.setItem('github_oauth_state', 'state-once');
    sessionStorage.setItem('github_oauth_state_ts', String(Date.now()));
    global.fetch.mockResolvedValue(jsonResponse({ success: true, github_username: 'octocat' }));

    const first = await githubService.completeOAuthFlow('code-1', 'state-once');
    expect(first.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await expect(githubService.completeOAuthFlow('code-1', 'state-once')).rejects.toThrow(
      'Security validation failed. Please try connecting to GitHub again.'
    );
    // No second network call — the replay never reaches the backend
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('StrictMode double-mount exchanges the code exactly once', async () => {
    sessionStorage.setItem('github_oauth_state', 'oauth-state');
    sessionStorage.setItem('github_oauth_state_ts', String(Date.now()));
    global.fetch.mockResolvedValue(jsonResponse({ success: true, github_username: 'octocat' }));
    mockUseLocation.mockReturnValue({ search: '?code=oauth-code&state=oauth-state' });

    render(
      <React.StrictMode>
        <GitHubCallback />
      </React.StrictMode>
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/v1/github/callback');
    expect(JSON.parse(options.body)).toEqual({ code: 'oauth-code', state: 'oauth-state' });
    expect(await screen.findByText(/GitHub connected successfully!/i)).toBeInTheDocument();
  });

  test('forged ?github_success=true without server connected:true does NOT set github_connected', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ connected: false }));
    authApi.updateGitHubStatus.mockClear();
    mockUseLocation.mockReturnValue({
      search: '?github_success=true&github_username=attacker&user_id=7',
    });

    render(<GitHubCallback />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/github', expect.objectContaining({ replace: true }));
    }, { timeout: 3000 });
    expect(authApi.updateGitHubStatus).not.toHaveBeenCalled();
    expect(setCurrentUser).not.toHaveBeenCalled();
  });

  test('verified ?github_success=true with server connected:true updates status', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ connected: true, username: 'octocat' }));
    authApi.updateGitHubStatus.mockClear();
    mockUseLocation.mockReturnValue({
      search: '?github_success=true&github_username=octocat&user_id=7',
    });

    render(<GitHubCallback />);

    await waitFor(() => {
      expect(authApi.updateGitHubStatus).toHaveBeenCalledWith(true, 'octocat');
    });
    expect(setCurrentUser).toHaveBeenCalled();
  });

  test('legacy utils/api shim requires state (insecure code-only path gone)', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ success: true }));

    await expect(legacyGithubService.completeOAuthFlow('code-123')).rejects.toThrow(
      'Security validation failed. Please try connecting to GitHub again.'
    );
    await expect(legacyGithubService.completeOAuthFlow('code-123', '')).rejects.toThrow(
      'Security validation failed. Please try connecting to GitHub again.'
    );
    expect(global.fetch).not.toHaveBeenCalled();

    const result = await legacyGithubService.completeOAuthFlow('code-123', 'state-123');
    expect(result).toEqual({ success: true });
    const [, options] = global.fetch.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ code: 'code-123', state: 'state-123' });
  });
});
