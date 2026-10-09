import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AuthProvider, useAuth } from '../../context/AuthContext';
import { authApi } from '../../services/utils/auth';
import { dashboardService } from '../../services/utils/api';
import { githubService } from '../../services/github';

jest.mock('../../services/utils/auth', () => ({
  authApi: {
    getCurrentUser: jest.fn(),
    verifySession: jest.fn(),
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
  },
}));

jest.mock('../../services/utils/api', () => ({
  dashboardService: {
    prefetchReportData: jest.fn(),
    clearReportDataCache: jest.fn(),
  },
}));

jest.mock('../../services/github', () => ({
  githubService: {
    initiateOAuthFlow: jest.fn(),
    completeOAuthFlow: jest.fn(),
    checkConnection: jest.fn(),
  },
}));

function AuthHarness() {
  const {
    currentUser,
    loading,
    error,
    githubConnected,
    authInProgress,
    showGithubPrompt,
    login,
    register,
    logout,
    connectGitHub,
    handleGithubPromptResponse,
    setCurrentUser,
    verifyToken,
  } = useAuth();

  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="user-id">{currentUser ? String(currentUser.id) : 'none'}</div>
      <div data-testid="error-text">{error || ''}</div>
      <div data-testid="github-connected">{String(githubConnected)}</div>
      <div data-testid="auth-progress">{String(authInProgress)}</div>
      <div data-testid="show-prompt">{String(showGithubPrompt)}</div>
      <button
        onClick={() => {
          login({ email: 'dev@example.com', password: 'password123' }).catch(() => {});
        }}
      >
        Login
      </button>
      <button
        onClick={() => {
          connectGitHub().catch(() => {});
        }}
      >
        Connect GitHub
      </button>
      <button
        onClick={() => {
          register({ name: 'New User', email: 'new@example.com', password: 'password123' }).catch(() => {});
        }}
      >
        Register
      </button>
      <button
        onClick={() => {
          logout().catch(() => {});
        }}
      >
        Logout
      </button>
      <button onClick={() => handleGithubPromptResponse(false)}>Skip Prompt</button>
      <button onClick={() => setCurrentUser({ name: 'Updated User' })}>Update User</button>
      <button onClick={() => { verifyToken().catch(() => {}); }}>Verify Session</button>
    </div>
  );
}

const renderWithProvider = (initialEntries = ['/']) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>
    </MemoryRouter>
  );
};

const storedProfile = (id, overrides = {}) => ({
  id,
  email: 'user@example.com',
  role: 'developer',
  ...overrides,
});

describe('AuthContext', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.clear();

    authApi.getCurrentUser.mockImplementation(() => {
      const rawUser = localStorage.getItem('user');
      return rawUser ? JSON.parse(rawUser) : null;
    });
    authApi.verifySession.mockImplementation(async () => {
      const rawUser = localStorage.getItem('user');
      if (!rawUser) {
        throw new Error('No session');
      }
      const user = JSON.parse(rawUser);
      if (!user.id || !user.email) {
        throw new Error('No session');
      }
      return { user, exp: user.exp ?? null };
    });

    authApi.login.mockReset();
    authApi.register.mockReset();
    authApi.logout.mockReset();
    dashboardService.prefetchReportData.mockReset();
    dashboardService.prefetchReportData.mockResolvedValue(null);
    dashboardService.clearReportDataCache.mockReset();
    githubService.initiateOAuthFlow.mockReset();
    githubService.completeOAuthFlow.mockReset();
    githubService.checkConnection.mockResolvedValue({ connected: false });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  test('hydrates cached profile and validates session via /me without tokens', async () => {
    localStorage.setItem('user', JSON.stringify(storedProfile(1)));

    renderWithProvider();

    expect(screen.getByTestId('user-id')).toHaveTextContent('1');
    await waitFor(() => {
      expect(authApi.verifySession).toHaveBeenCalled();
    });
    const stored = JSON.parse(localStorage.getItem('user'));
    expect(stored.token).toBeUndefined();
  });

  test('ignores stored users with legacy client role', async () => {
    localStorage.setItem(
      'user',
      JSON.stringify(storedProfile(1, { role: 'client' }))
    );
    authApi.verifySession.mockRejectedValue(new Error('No session'));

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('user-id')).toHaveTextContent('none');
    });
    expect(localStorage.getItem('user')).toBeNull();
  });

  test('login stores sanitized profile, enables GitHub prompt, and merges updates without tokens', async () => {
    authApi.login.mockResolvedValue({
      user: storedProfile(7, { name: 'Dev User', github_connected: false }),
    });
    // No valid cookie session at mount — user 7 must come from login, not cache.
    authApi.verifySession.mockRejectedValue(new Error('No session'));

    renderWithProvider();

    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith({
        email: 'dev@example.com',
        password: 'password123',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('user-id')).toHaveTextContent('7');
    });

    await waitFor(() => {
      expect(screen.getByTestId('show-prompt')).toHaveTextContent('true');
    });

    const storedAfterLogin = JSON.parse(localStorage.getItem('user'));
    expect(storedAfterLogin.token).toBeUndefined();
    expect(storedAfterLogin.id).toBe(7);

    fireEvent.click(screen.getByRole('button', { name: 'Update User' }));
    const storedAfterUpdate = JSON.parse(localStorage.getItem('user'));
    expect(storedAfterUpdate.name).toBe('Updated User');
    expect(storedAfterUpdate.token).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'Skip Prompt' }));
    expect(screen.getByTestId('show-prompt')).toHaveTextContent('false');
  });

  test('verifyToken validates the cookie session via /me', async () => {
    localStorage.setItem('user', JSON.stringify(storedProfile(3)));
    authApi.verifySession.mockResolvedValue({ user: storedProfile(3), exp: 123 });

    renderWithProvider();

    fireEvent.click(screen.getByRole('button', { name: 'Verify Session' }));

    await waitFor(() => {
      expect(authApi.verifySession).toHaveBeenCalled();
    });
  });

  test('connectGitHub shows auth-required error when no stored user exists', async () => {
    renderWithProvider();

    authApi.getCurrentUser.mockReturnValue(null);

    fireEvent.click(screen.getByRole('button', { name: 'Connect GitHub' }));

    await waitFor(() => {
      expect(screen.getByTestId('error-text')).toHaveTextContent(
        'Authentication required. Please log in again before connecting GitHub.'
      );
    });
  });

  test('supports register and logout flows', async () => {
    localStorage.setItem('user', JSON.stringify(storedProfile(7)));
    authApi.register.mockResolvedValue({ success: true });
    authApi.logout.mockResolvedValue({ success: true });

    renderWithProvider();

    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    await waitFor(() => {
      expect(authApi.register).toHaveBeenCalledWith({
        name: 'New User',
        email: 'new@example.com',
        password: 'password123',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    await waitFor(() => {
      expect(authApi.logout).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByTestId('user-id')).toHaveTextContent('none');
    });
    expect(localStorage.getItem('user')).toBeNull();
  });

  test('handles explicit GitHub success callback query parameters', async () => {
    githubService.checkConnection.mockResolvedValue({ connected: true, username: 'octocat' });

    localStorage.setItem(
      'user',
      JSON.stringify(storedProfile(9, { github_connected: false }))
    );

    renderWithProvider(['/github/callback?github_success=true&github_username=octocat&user_id=9']);

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('user'));
      expect(stored.github_connected).toBe(true);
      expect(stored.github_username).toBe('octocat');
    });

    expect(screen.getByTestId('github-connected')).toHaveTextContent('true');
    expect(screen.getByTestId('show-prompt')).toHaveTextContent('false');
  });

  test('handles OAuth code callback and updates connected user state', async () => {
    localStorage.setItem(
      'user',
      JSON.stringify(storedProfile(11, { github_connected: false }))
    );
    githubService.completeOAuthFlow.mockResolvedValue({ success: true, github_username: 'octo' });

    renderWithProvider(['/github/callback?code=oauth-code&state=test-state']);

    await waitFor(() => {
      expect(githubService.completeOAuthFlow).toHaveBeenCalledWith('oauth-code');
    });

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('user'));
      expect(stored.github_connected).toBe(true);
      expect(stored.github_username).toBe('octo');
    });
  });

  test('shows callback error query parameter and handles login payload missing user', async () => {
    renderWithProvider(['/github/callback?error=access_denied']);

    expect(screen.getByTestId('error-text')).toHaveTextContent('GitHub connection error: access_denied');

    authApi.login.mockResolvedValue({ message: 'no user' });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(screen.getByTestId('error-text')).toHaveTextContent('No user data received. Please try again.');
    });
  });

  test('reconciles stale github_connected state when backend check reports disconnected', async () => {
    localStorage.setItem(
      'user',
      JSON.stringify(storedProfile(15, { github_connected: true, github_username: 'old' }))
    );
    githubService.checkConnection.mockResolvedValue({ connected: false });

    renderWithProvider();

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('user'));
      expect(stored.github_connected).toBe(false);
      expect(stored.github_username).toBe('');
    });
  });

  test('cached profile without email is ignored', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 99 }));
    authApi.verifySession.mockRejectedValue(new Error('No session'));

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('user-id')).toHaveTextContent('none');
    });
  });

  test('failed session validation falls back to cached profile', async () => {
    authApi.getCurrentUser.mockReturnValue(storedProfile(5));
    authApi.verifySession.mockRejectedValue(new Error('expired'));
    githubService.checkConnection.mockResolvedValue({ connected: false });

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('user-id')).toHaveTextContent('5');
    });
  });

  test('loadUser with github_connected=true does NOT show prompt', async () => {
    const profile = storedProfile(20, { github_connected: true, github_username: 'octo' });
    authApi.getCurrentUser.mockReturnValue(profile);
    authApi.verifySession.mockResolvedValue({ user: profile, exp: null });
    githubService.checkConnection.mockResolvedValue({ connected: true });

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('user-id')).toHaveTextContent('20');
    });
    expect(screen.getByTestId('show-prompt')).toHaveTextContent('false');
  });

  test('register failure sets error and rethrows', async () => {
    authApi.register.mockRejectedValue(new Error('email already taken'));

    renderWithProvider();

    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => {
      expect(screen.getByTestId('error-text')).toHaveTextContent('email already taken');
    });
  });

  test('logout failure still clears user state and localStorage', async () => {
    localStorage.setItem('user', JSON.stringify(storedProfile(7)));
    authApi.logout.mockRejectedValue(new Error('server gone'));

    renderWithProvider();

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));

    await waitFor(() => {
      expect(screen.getByTestId('user-id')).toHaveTextContent('none');
    });
    expect(localStorage.getItem('user')).toBeNull();
  });

  test('updateUser merges profile fields without tokens', async () => {
    localStorage.setItem('user', JSON.stringify(storedProfile(7)));
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    renderWithProvider();

    fireEvent.click(screen.getByRole('button', { name: 'Update User' }));
    expect(screen.getByTestId('user-id')).toHaveTextContent('7');
    const stored = JSON.parse(localStorage.getItem('user'));
    expect(stored.name).toBe('Updated User');
    expect(stored.token).toBeUndefined();
  });

  test('OAuth code callback returns success=false — no github state update', async () => {
    localStorage.setItem(
      'user',
      JSON.stringify(storedProfile(11, { github_connected: false }))
    );
    githubService.completeOAuthFlow.mockResolvedValue({ success: false });

    renderWithProvider(['/github/callback?code=oauth-code&state=test-state']);

    await waitFor(() => {
      expect(githubService.completeOAuthFlow).toHaveBeenCalledWith('oauth-code');
    });

    await waitFor(() => {
      expect(screen.getByTestId('github-connected')).toHaveTextContent('false');
    });
  });

  test('connectGitHub catches error and sets error message', async () => {
    localStorage.setItem('user', JSON.stringify(storedProfile(7)));
    authApi.getCurrentUser.mockReturnValue(storedProfile(7));
    githubService.initiateOAuthFlow.mockRejectedValue(new Error('oauth failed'));

    renderWithProvider();

    fireEvent.click(screen.getByRole('button', { name: 'Connect GitHub' }));

    await waitFor(() => {
      expect(screen.getByTestId('error-text')).toHaveTextContent(
        'Failed to connect to GitHub. Please try again.'
      );
    });
  });

  test('fetches permissions via cookie session and warms GitHub reports for connected admins', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({ permissions: ['can_view_all_users'] }),
    });

    const adminProfile = storedProfile(31, {
      email: 'admin@example.com',
      role: 'admin',
      github_connected: true,
    });
    authApi.getCurrentUser.mockReturnValue(adminProfile);
    authApi.verifySession.mockResolvedValue({ user: adminProfile, exp: null });
    githubService.checkConnection.mockResolvedValue({ connected: true });

    const originalRequestIdleCallback = window.requestIdleCallback;
    const originalCancelIdleCallback = window.cancelIdleCallback;
    window.requestIdleCallback = (callback) => {
      callback({ didTimeout: false, timeRemaining: () => 50 });
      return 1;
    };
    window.cancelIdleCallback = jest.fn();

    localStorage.setItem('user', JSON.stringify(adminProfile));
    renderWithProvider();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/permissions'),
        expect.objectContaining({
          credentials: 'include',
        })
      );
    });
    expect(global.fetch.mock.calls[0][1].headers).toBeUndefined();

    await waitFor(() => {
      expect(dashboardService.prefetchReportData).toHaveBeenCalledWith('github', 'week');
    });
    await waitFor(() => {
      expect(dashboardService.prefetchReportData).toHaveBeenCalledWith('github', 'month');
    });
    await waitFor(() => {
      expect(dashboardService.prefetchReportData).toHaveBeenCalledWith('github', 'quarter');
    });
    await waitFor(() => {
      expect(dashboardService.prefetchReportData).toHaveBeenCalledWith('github', 'year');
    });

    const stored = JSON.parse(localStorage.getItem('user'));
    expect(stored.permissions).toEqual(['can_view_all_users']);

    window.requestIdleCallback = originalRequestIdleCallback;
    window.cancelIdleCallback = originalCancelIdleCallback;
  });
});
