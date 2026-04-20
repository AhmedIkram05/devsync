import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AuthProvider, useAuth } from '../../context/AuthContext';
import { authApi } from '../../services/utils/auth';
import { githubService } from '../../services/github';

jest.mock('../../services/utils/auth', () => ({
  authApi: {
    getCurrentUser: jest.fn(),
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
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
    showGithubPrompt,
    login,
    handleGithubPromptResponse,
    setCurrentUser,
  } = useAuth();

  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="user-id">{currentUser ? String(currentUser.id) : 'none'}</div>
      <div data-testid="show-prompt">{String(showGithubPrompt)}</div>
      <button
        onClick={() => {
          login({ email: 'dev@example.com', password: 'password123' }).catch(() => {});
        }}
      >
        Login
      </button>
      <button onClick={() => handleGithubPromptResponse(false)}>Skip Prompt</button>
      <button onClick={() => setCurrentUser({ name: 'Updated User', token: '' })}>Update User</button>
    </div>
  );
}

const renderWithProvider = () => {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>
    </MemoryRouter>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.clear();

    authApi.getCurrentUser.mockImplementation(() => {
      const rawUser = localStorage.getItem('user');
      return rawUser ? JSON.parse(rawUser) : null;
    });

    authApi.login.mockReset();
    authApi.register.mockReset();
    authApi.logout.mockReset();
    githubService.initiateOAuthFlow.mockReset();
    githubService.completeOAuthFlow.mockReset();
    githubService.checkConnection.mockResolvedValue({ connected: false });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  test('hydrates authenticated user from localStorage without loading flicker', () => {
    localStorage.setItem(
      'user',
      JSON.stringify({ id: 1, email: 'user@example.com', token: 'token-1', role: 'client' })
    );

    renderWithProvider();

    expect(screen.getByTestId('loading')).toHaveTextContent('false');
    expect(screen.getByTestId('user-id')).toHaveTextContent('1');
  });

  test('login stores token, enables GitHub prompt, and keeps existing token on partial user update', async () => {
    authApi.login.mockResolvedValue({
      user: {
        id: 7,
        name: 'Dev User',
        email: 'dev@example.com',
        role: 'client',
        github_connected: false,
      },
      token: 'token-7',
    });

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
    expect(storedAfterLogin.token).toBe('token-7');

    fireEvent.click(screen.getByRole('button', { name: 'Update User' }));
    const storedAfterUpdate = JSON.parse(localStorage.getItem('user'));
    expect(storedAfterUpdate.name).toBe('Updated User');
    expect(storedAfterUpdate.token).toBe('token-7');

    fireEvent.click(screen.getByRole('button', { name: 'Skip Prompt' }));
    expect(screen.getByTestId('show-prompt')).toHaveTextContent('false');
  });
});
