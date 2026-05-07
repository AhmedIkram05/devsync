import React from 'react';
import { render, screen } from '@testing-library/react';

import App from '../App';

let mockAuthState = {
  currentUser: null,
  loading: false,
  showGithubPrompt: false,
};

jest.mock('../context/AuthContext', () => ({
  AuthProvider: ({ children }) => <>{children}</>,
  useAuth: () => mockAuthState,
}));

jest.mock('../context/NotificationContext', () => ({
  NotificationProvider: ({ children }) => <>{children}</>,
}));

jest.mock('../components/Navbar', () => () => <div>Navbar</div>);
jest.mock('../components/GitHubConnectPrompt', () => () => <div>GitHub Connect Prompt</div>);

jest.mock('../pages/TaskList', () => () => <div>Task List Page</div>);
jest.mock('../pages/GitHubIntegration', () => () => <div>GitHub Integration Page</div>);
jest.mock('../pages/AdminDashboard', () => () => <div>Admin Dashboard Page</div>);
jest.mock('../pages/TaskCreation', () => () => <div>Task Creation Page</div>);
jest.mock('../pages/DeveloperProgress', () => () => <div>Developer Progress Page</div>);
jest.mock('../pages/Reports', () => () => <div>Reports Page</div>);
jest.mock('../pages/AdminProjects', () => () => <div>Admin Projects Page</div>);
jest.mock('../pages/ProjectDetails', () => () => <div>Project Details Page</div>);
jest.mock('../pages/Login', () => () => <div>Login Page</div>);
jest.mock('../pages/BasicDashboard', () => () => <div>Client Dashboard Page</div>);
jest.mock('../pages/TaskDetailsUser', () => () => <div>Task Details User Page</div>);
jest.mock('../pages/GithubIntegrationDetail', () => () => <div>GitHub Integration Detail Page</div>);
jest.mock('../pages/Register', () => () => <div>Register Page</div>);
jest.mock('../pages/GitHubCallback', () => () => <div>GitHub Callback Page</div>);
jest.mock('../pages/Forbidden', () => () => <div>Forbidden Page</div>);

const renderAt = (path) => {
  window.history.pushState({}, '', path);
  return render(<App />);
};

describe('App route access controls', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    mockAuthState = {
      currentUser: null,
      loading: false,
      showGithubPrompt: false,
    };
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('redirects unauthenticated users from protected route to login', async () => {
    renderAt('/tasks');

    expect(await screen.findByText('Login Page')).toBeInTheDocument();
  });

  test('shows loading spinner while auth state is initializing', () => {
    mockAuthState = {
      currentUser: null,
      loading: true,
      showGithubPrompt: false,
    };

    renderAt('/tasks');

    expect(screen.getByRole('status', { name: /loading authentication state/i })).toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
  });

  test('redirects authenticated admin from login page to admin dashboard', async () => {
    mockAuthState = {
      currentUser: { id: 1, role: 'admin', token: 'test-token' },
      loading: false,
      showGithubPrompt: false,
    };

    renderAt('/login');

    expect(await screen.findByText('Admin Dashboard Page')).toBeInTheDocument();
  });

  test('redirects developer user from admin route to member dashboard', async () => {
    mockAuthState = {
      currentUser: { id: 2, role: 'developer', token: 'test-token' },
      loading: false,
      showGithubPrompt: false,
    };

    renderAt('/admin');

    expect(await screen.findByText('Forbidden Page')).toBeInTheDocument();
  });

  test('redirects authenticated admin from root path to admin dashboard', async () => {
    mockAuthState = {
      currentUser: { id: 1, role: 'admin', token: 'test-token' },
      loading: false,
      showGithubPrompt: false,
    };

    renderAt('/');

    expect(await screen.findByText('Admin Dashboard Page')).toBeInTheDocument();
  });

  test('redirects authenticated developer from root path to member dashboard', async () => {
    mockAuthState = {
      currentUser: { id: 2, role: 'developer', token: 'test-token' },
      loading: false,
      showGithubPrompt: false,
    };

    renderAt('/');

    expect(await screen.findByText('Client Dashboard Page')).toBeInTheDocument();
  });

  test('renders GitHub connection prompt when enabled', async () => {
    mockAuthState = {
      currentUser: { id: 2, role: 'developer', token: 'test-token' },
      loading: false,
      showGithubPrompt: true,
    };

    renderAt('/BasicDashboard');

    expect(await screen.findByText('GitHub Connect Prompt')).toBeInTheDocument();
  });

  test('allows unauthenticated access to API v1 GitHub callback route', async () => {
    renderAt('/api/v1/github/callback');

    expect(await screen.findByText('GitHub Callback Page')).toBeInTheDocument();
  });
});
