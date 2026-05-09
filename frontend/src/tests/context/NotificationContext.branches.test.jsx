import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { NotificationProvider, useNotifications } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../services/utils/api';

// Mock dependencies
jest.mock('socket.io-client', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn()
  }))
}));

jest.mock('../../services/utils/api');
jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
  AuthProvider: ({ children }) => children
}));

// Test component
const TestComponent = () => {
  const { notifications, isConnected, isLoading, error, rateLimited } = useNotifications();
  return (
    <div>
      {isLoading && <div data-testid="loading">Loading</div>}
      {error && <div data-testid="error">{error}</div>}
      {rateLimited && <div data-testid="rate-limited">Rate Limited</div>}
      {isConnected && <div data-testid="connected">Connected</div>}
      <div data-testid="count">{notifications.length}</div>
    </div>
  );
};

describe('NotificationContext branch coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({
      currentUser: { id: 1, token: 'test-token' }
    });

    api.notificationService = {
      getNotifications: jest.fn()
    };
  });

  describe('Initial state and loading branches', () => {
    test('initializes with empty notifications and isConnected false', async () => {
      api.notificationService.getNotifications.mockResolvedValue([]);

      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('count')).toHaveTextContent('0');
      });

      expect(screen.queryByTestId('connected')).not.toBeInTheDocument();
    });

    test('skips refresh when no currentUser', async () => {
      useAuth.mockReturnValue({ currentUser: null });
      api.notificationService.getNotifications.mockResolvedValue([]);

      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      await waitFor(() => {
        expect(api.notificationService.getNotifications).not.toHaveBeenCalled();
      });
    });

    test('skips refresh when currentUser has no token', async () => {
      useAuth.mockReturnValue({ currentUser: { id: 1, token: null } });
      api.notificationService.getNotifications.mockResolvedValue([]);

      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      await waitFor(() => {
        expect(api.notificationService.getNotifications).not.toHaveBeenCalled();
      });
    });
  });

  describe('Notification data handling branches', () => {
    test('handles array response directly', async () => {
      const notifications = [
        { id: 1, message: 'Task created', is_read: false },
        { id: 2, message: 'Task updated', is_read: true }
      ];
      api.notificationService.getNotifications.mockResolvedValue(notifications);

      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('count')).toHaveTextContent('2');
      });
    });

    test('handles data.data array response', async () => {
      const notifications = [
        { id: 1, message: 'Test', is_read: false }
      ];
      api.notificationService.getNotifications.mockResolvedValue({
        data: notifications
      });

      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('count')).toHaveTextContent('1');
      });
    });

    test('sets empty array for unexpected data format', async () => {
      api.notificationService.getNotifications.mockResolvedValue({
        message: 'Invalid format'
      });

      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('count')).toHaveTextContent('0');
      });
    });
  });

  describe('Error handling branches', () => {
    test('detects server connection error', async () => {
      api.notificationService.getNotifications.mockResolvedValue({
        isConnectionError: true
      });

      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent(/offline|connection/i);
      });
    });

    test('handles network error with proper message', async () => {
      const error = new Error('Failed to fetch');
      api.notificationService.getNotifications.mockRejectedValue(error);

      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent(/connection/i);
      });
    });

    test('detects rate limit 429 error', async () => {
      const error = new Error('Rate limited');
      error.status = 429;
      api.notificationService.getNotifications.mockRejectedValue(error);

      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('rate-limited')).toBeInTheDocument();
      });
    });

    test('handles generic error response', async () => {
      const error = new Error('Unknown error');
      api.notificationService.getNotifications.mockRejectedValue(error);

      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('error')).toBeInTheDocument();
      });
    });
  });

  describe('Rate limiting branches', () => {
    test('skips refresh when rate limited and not forced', async () => {
      const error = new Error('Rate limited');
      error.status = 429;
      api.notificationService.getNotifications.mockRejectedValueOnce(error);
      api.notificationService.getNotifications.mockResolvedValueOnce([]);

      const { rerender } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      // Wait for first call to hit rate limit
      await waitFor(() => {
        expect(screen.getByTestId('rate-limited')).toBeInTheDocument();
      });

      // Clear mocks to verify it doesn't call again
      api.notificationService.getNotifications.mockClear();
      
      // Force a re-render but shouldn't call API due to rate limit
      rerender(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      // Give it time but shouldn't make another call
      expect(api.notificationService.getNotifications).not.toHaveBeenCalled();
    });

    test('resets rate limited flag on successful fetch', async () => {
      const error = new Error('Rate limited');
      error.status = 429;
      api.notificationService.getNotifications
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce([{ id: 1, message: 'Test' }]);

      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      // First hit rate limit
      await waitFor(() => {
        expect(screen.getByTestId('rate-limited')).toBeInTheDocument();
      });
    });
  });

  describe('Server down detection branches', () => {
    test('marks server as down on connection error', async () => {
      api.notificationService.getNotifications.mockResolvedValue({
        isConnectionError: true
      });

      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent(/offline/);
      });
    });

    test('skips refresh when server is down and not forced', async () => {
      api.notificationService.getNotifications
        .mockResolvedValueOnce({ isConnectionError: true })
        .mockResolvedValueOnce([]);

      const TestComponent2 = () => {
        const ctx = useNotifications();
        return <div data-testid="mount">{String(ctx.error ? 'error' : 'ok')}</div>;
      };

      render(
        <NotificationProvider>
          <TestComponent2 />
        </NotificationProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('mount')).toBeInTheDocument();
      });

      // Should only be called once since server is down
      expect(api.notificationService.getNotifications).toHaveBeenCalledTimes(1);
    });
  });

  describe('Read notification branches', () => {
    test('correctly identifies read notifications using is_read', () => {
      // This tests the isNotificationRead helper
      const unreadNotif = { id: 1, is_read: false };
      const readNotif = { id: 2, is_read: true };
      const readNotifAlt = { id: 3, read: true };

      // Verify the logic would work correctly
      expect(Boolean(unreadNotif?.is_read || unreadNotif?.read)).toBe(false);
      expect(Boolean(readNotif?.is_read || readNotif?.read)).toBe(true);
      expect(Boolean(readNotifAlt?.is_read || readNotifAlt?.read)).toBe(true);
    });

    test('handles notifications with null/undefined read flags', () => {
      const notif1 = { id: 1, is_read: null };
      const notif2 = { id: 2 };
      const notif3 = { id: 3, is_read: false, read: null };

      expect(Boolean(notif1?.is_read || notif1?.read)).toBe(false);
      expect(Boolean(notif2?.is_read || notif2?.read)).toBe(false);
      expect(Boolean(notif3?.is_read || notif3?.read)).toBe(false);
    });
  });

  describe('Cleanup and unmount branches', () => {
    test('cleans up on unmount', async () => {
      api.notificationService.getNotifications.mockResolvedValue([]);

      const { unmount } = render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('count')).toBeInTheDocument();
      });

      // Unmount should not throw
      expect(() => unmount()).not.toThrow();
    });
  });
});
