import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import Navbar from '../../components/Navbar';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';

const mockLogout = jest.fn();
const mockRefreshNotifications = jest.fn();
const mockMarkAllAsRead = jest.fn();

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../context/NotificationContext', () => ({
  useNotifications: jest.fn(),
}));

jest.mock('../../components/Notifications', () => ({ notifications }) => (
  <div>Notifications list ({notifications.length})</div>
));

const renderNavbar = () => {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Navbar />
    </MemoryRouter>
  );
};

describe('Navbar component', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    mockLogout.mockReset();
    mockRefreshNotifications.mockReset();
    mockMarkAllAsRead.mockReset();

    useAuth.mockReturnValue({
      currentUser: {
        id: 1,
        role: 'admin',
        name: 'Admin User',
        email: 'admin@example.com',
      },
      logout: mockLogout,
    });

    useNotifications.mockReturnValue({
      notifications: [{ id: 1, message: 'Task updated' }],
      unreadCount: 2,
      markAsRead: jest.fn(),
      markAllAsRead: mockMarkAllAsRead,
      refreshNotifications: mockRefreshNotifications,
      isConnected: true,
    });

    Object.defineProperty(window, 'Notification', {
      writable: true,
      value: {
        permission: 'default',
        requestPermission: jest.fn(),
      },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns null when there is no authenticated user', () => {
    useAuth.mockReturnValue({ currentUser: null, logout: mockLogout });

    const { container } = renderNavbar();

    expect(container).toBeEmptyDOMElement();
  });

  test('requests browser notification permission on mount when permission is default', () => {
    renderNavbar();

    expect(window.Notification.requestPermission).toHaveBeenCalled();
  });

  test('renders admin navigation links and unread notification badge', async () => {
    renderNavbar();

    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Create Task').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Developer Progress').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Reports').length).toBeGreaterThan(0);
    expect(screen.getAllByText('GitHub').length).toBeGreaterThan(0);

    expect(await screen.findByText('2')).toBeInTheDocument();
  });

  test('opens notification panel, refreshes notifications, and marks all as read', async () => {
    renderNavbar();

    const notificationButton = screen.getByRole('button', { name: /notifications?/i });
    fireEvent.click(notificationButton);

    await waitFor(() => {
      expect(mockRefreshNotifications).toHaveBeenCalled();
    });

    expect(await screen.findByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Notifications list (1)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /mark all as read/i }));
    expect(mockMarkAllAsRead).toHaveBeenCalled();
  });

  test('toggles mobile menu and shows developer links for non-admin users', async () => {
    useAuth.mockReturnValue({
      currentUser: {
        id: 2,
        role: 'developer',
        name: 'Developer User',
        email: 'developer@example.com',
      },
      logout: mockLogout,
    });

    renderNavbar();

    expect(screen.getAllByText('Logout')).toHaveLength(1);

    const mobileToggle = screen.getByRole('button', { name: /menu/i });
    fireEvent.click(mobileToggle);

    await waitFor(() => {
      expect(screen.getAllByText('Logout')).toHaveLength(2);
    });

    expect(screen.getAllByText('Tasks').length).toBeGreaterThan(0);
    expect(screen.getAllByText('GitHub').length).toBeGreaterThan(0);
    expect(screen.queryByText('Create Task')).not.toBeInTheDocument();
  });

  test('shows task creation link for team leads', () => {
    useAuth.mockReturnValue({
      currentUser: {
        id: 3,
        role: 'team_lead',
        name: 'Lead User',
        email: 'lead@example.com',
      },
      logout: mockLogout,
    });

    renderNavbar();

    expect(screen.getAllByText('Create Task').length).toBeGreaterThan(0);
  });

  test('shows logging out state while logout is in progress', async () => {
    let resolveLogout;
    mockLogout.mockReturnValue(
      new Promise((resolve) => {
        resolveLogout = resolve;
      })
    );

    renderNavbar();

    fireEvent.click(screen.getByRole('button', { name: /logout/i }));
    expect(screen.getByRole('button', { name: /logging out/i })).toBeInTheDocument();

    resolveLogout();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
    });
  });

  test('handles logout failures without breaking UI', async () => {
    mockLogout.mockRejectedValue(new Error('logout failed'));

    renderNavbar();

    fireEvent.click(screen.getByRole('button', { name: /logout/i }));

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith('Logout failed:', expect.any(Error));
    });

    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
  });
});
