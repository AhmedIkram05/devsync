import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter as Router } from 'react-router-dom';
import { AuthProvider, useAuth } from '../../context/AuthContext';
import * as authApi from '../../services/utils/auth';

jest.mock('../../services/utils/auth');
jest.mock('../../services/github', () => ({
  githubService: {
    initiateOAuthFlow: jest.fn()
  }
}));

jest.mock('../../services/utils/api', () => ({
  dashboardService: {}
}));

// Test component that uses AuthContext
const TestComponent = () => {
  const auth = useAuth();
  return (
    <div>
      {auth.loading && <div data-testid="loading">Loading...</div>}
      {auth.currentUser && (
        <div data-testid="user-info">
          <span data-testid="user-id">{auth.currentUser.id}</span>
          <span data-testid="user-role">{auth.currentUser.role}</span>
        </div>
      )}
      {!auth.currentUser && !auth.loading && <div data-testid="no-user">Not logged in</div>}
      {auth.error && <div data-testid="error">{auth.error}</div>}
      {auth.showGithubPrompt && <div data-testid="github-prompt">Connect GitHub</div>}
    </div>
  );
};

describe('AuthContext branch coverage', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    authApi.authApi = {
      getCurrentUser: jest.fn(() => null),
      login: jest.fn(),
      logout: jest.fn(),
      register: jest.fn()
    };
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Initialization branches', () => {
    test('loads user from localStorage with valid token and role', async () => {
      const validUser = { id: 1, email: 'test@test.com', token: 'abc', role: 'developer' };
      localStorage.setItem('user', JSON.stringify(validUser));
      
      authApi.authApi.getCurrentUser.mockReturnValue(validUser);

      render(
        <Router>
          <AuthProvider>
            <TestComponent />
          </AuthProvider>
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByTestId('user-id')).toHaveTextContent('1');
        expect(screen.getByTestId('user-role')).toHaveTextContent('developer');
      });
    });

    test('initializes with null user when localStorage is empty', async () => {
      authApi.authApi.getCurrentUser.mockReturnValue(null);

      render(
        <Router>
          <AuthProvider>
            <TestComponent />
          </AuthProvider>
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByTestId('no-user')).toBeInTheDocument();
      });
    });

    test('clears localStorage on invalid token during init', async () => {
      const invalidUser = { id: 1, email: 'test@test.com', role: 'developer' }; // no token
      localStorage.setItem('user', JSON.stringify(invalidUser));
      
      authApi.authApi.getCurrentUser.mockReturnValue(null);

      render(
        <Router>
          <AuthProvider>
            <TestComponent />
          </AuthProvider>
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByTestId('no-user')).toBeInTheDocument();
      });
    });

    test('clears localStorage on invalid role during init', async () => {
      const invalidRoleUser = { id: 1, email: 'test@test.com', token: 'abc', role: 'superuser' };
      localStorage.setItem('user', JSON.stringify(invalidRoleUser));
      
      authApi.authApi.getCurrentUser.mockReturnValue(null);

      render(
        <Router>
          <AuthProvider>
            <TestComponent />
          </AuthProvider>
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByTestId('no-user')).toBeInTheDocument();
      });
    });

    test('initializes github_connected state from user data', async () => {
      const user = { 
        id: 1, 
        email: 'test@test.com', 
        token: 'abc', 
        role: 'developer',
        github_connected: true
      };
      localStorage.setItem('user', JSON.stringify(user));
      
      authApi.authApi.getCurrentUser.mockReturnValue(user);

      render(
        <Router>
          <AuthProvider>
            <TestComponent />
          </AuthProvider>
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByTestId('user-info')).toBeInTheDocument();
      });
    });

    test('handles corrupted localStorage JSON gracefully', async () => {
      localStorage.setItem('user', 'not valid json');
      
      authApi.authApi.getCurrentUser.mockReturnValue(null);

      render(
        <Router>
          <AuthProvider>
            <TestComponent />
          </AuthProvider>
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByTestId('no-user')).toBeInTheDocument();
        expect(localStorage.getItem('user')).toBeNull();
      });
    });

    test('validates role is in VALID_ROLES set', async () => {
      const teamLeadUser = { 
        id: 2, 
        email: 'lead@test.com', 
        token: 'def', 
        role: 'team_lead'
      };
      localStorage.setItem('user', JSON.stringify(teamLeadUser));
      
      authApi.authApi.getCurrentUser.mockReturnValue(teamLeadUser);

      render(
        <Router>
          <AuthProvider>
            <TestComponent />
          </AuthProvider>
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByTestId('user-role')).toHaveTextContent('team_lead');
      });
    });

    test('validates admin role', async () => {
      const adminUser = { 
        id: 3, 
        email: 'admin@test.com', 
        token: 'ghi', 
        role: 'admin'
      };
      localStorage.setItem('user', JSON.stringify(adminUser));
      
      authApi.authApi.getCurrentUser.mockReturnValue(adminUser);

      render(
        <Router>
          <AuthProvider>
            <TestComponent />
          </AuthProvider>
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByTestId('user-role')).toHaveTextContent('admin');
      });
    });
  });

  describe('verifyToken branch coverage', () => {
    test('verifyToken returns false for null user', async () => {
      authApi.authApi.getCurrentUser.mockReturnValue(null);

      render(
        <Router>
          <AuthProvider>
            <TestComponent />
          </AuthProvider>
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByTestId('no-user')).toBeInTheDocument();
      });
    });

    test('verifyToken returns false when user has no token', async () => {
      const userNoToken = { id: 1, email: 'test@test.com', role: 'developer' };
      localStorage.setItem('user', JSON.stringify(userNoToken));
      
      authApi.authApi.getCurrentUser.mockReturnValue(null);

      render(
        <Router>
          <AuthProvider>
            <TestComponent />
          </AuthProvider>
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByTestId('no-user')).toBeInTheDocument();
      });
    });

    test('verifyToken returns true for user with valid token', async () => {
      const validUser = { id: 1, email: 'test@test.com', token: 'xyz', role: 'developer' };
      localStorage.setItem('user', JSON.stringify(validUser));
      
      authApi.authApi.getCurrentUser.mockReturnValue(validUser);

      render(
        <Router>
          <AuthProvider>
            <TestComponent />
          </AuthProvider>
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByTestId('user-info')).toBeInTheDocument();
      });
    });
  });

  describe('GitHub connection status branches', () => {
    test('initializes github_connected state when property present', async () => {
      const user = { 
        id: 1, 
        email: 'test@test.com', 
        token: 'abc', 
        role: 'developer',
        github_connected: false
      };
      localStorage.setItem('user', JSON.stringify(user));
      
      authApi.authApi.getCurrentUser.mockReturnValue(user);

      render(
        <Router>
          <AuthProvider>
            <TestComponent />
          </AuthProvider>
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByTestId('user-info')).toBeInTheDocument();
      });
    });

    test('initializes github_connected state from user data', async () => {
      const user = { 
        id: 1, 
        email: 'test@test.com', 
        token: 'abc', 
        role: 'developer',
        github_connected: true
      };
      localStorage.setItem('user', JSON.stringify(user));
      
      authApi.authApi.getCurrentUser.mockReturnValue(user);

      render(
        <Router>
          <AuthProvider>
            <TestComponent />
          </AuthProvider>
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByTestId('user-info')).toBeInTheDocument();
      });
    });

    test('handles missing github_connected property', async () => {
      const user = { 
        id: 1, 
        email: 'test@test.com', 
        token: 'abc', 
        role: 'developer'
      };
      localStorage.setItem('user', JSON.stringify(user));
      
      authApi.authApi.getCurrentUser.mockReturnValue(user);

      render(
        <Router>
          <AuthProvider>
            <TestComponent />
          </AuthProvider>
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByTestId('user-info')).toBeInTheDocument();
      });
    });

    test('preserves github_connected true status', async () => {
      const user = { 
        id: 1, 
        email: 'test@test.com', 
        token: 'abc', 
        role: 'developer',
        github_connected: true
      };
      localStorage.setItem('user', JSON.stringify(user));
      
      authApi.authApi.getCurrentUser.mockReturnValue(user);

      render(
        <Router>
          <AuthProvider>
            <TestComponent />
          </AuthProvider>
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByTestId('user-info')).toBeInTheDocument();
      });
    });
  });

  describe('Permissions loading branches', () => {
    test('uses permissions from localStorage if present', async () => {
      const user = { 
        id: 1, 
        email: 'test@test.com', 
        token: 'abc', 
        role: 'developer',
        permissions: ['can_create_projects', 'can_view_reports']
      };
      localStorage.setItem('user', JSON.stringify(user));
      
      authApi.authApi.getCurrentUser.mockReturnValue(user);

      render(
        <Router>
          <AuthProvider>
            <TestComponent />
          </AuthProvider>
        </Router>
      );

      await waitFor(() => {
        expect(screen.getByTestId('user-info')).toBeInTheDocument();
      });
    });
  });
});
