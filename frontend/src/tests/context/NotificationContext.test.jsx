import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import io from 'socket.io-client';

import { NotificationProvider, useNotifications } from '../../context/NotificationContext';
import { notificationService } from '../../services/utils/api';
import { useAuth } from '../../context/AuthContext';

jest.mock('socket.io-client', () => jest.fn());

jest.mock('../../services/utils/api', () => ({
  notificationService: {
    getNotifications: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
  },
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

function NotificationHarness() {
  const {
    notifications,
    unreadCount,
    isConnected,
    isLoading,
    rateLimited,
    serverDown,
    error,
    markAsRead,
    markAllAsRead,
    refreshNotifications,
    checkServerStatus,
  } = useNotifications();

  return (
    <div>
      <div data-testid="total-count">{String(notifications.length)}</div>
      <div data-testid="unread-count">{String(unreadCount)}</div>
      <div data-testid="is-connected">{String(isConnected)}</div>
      <div data-testid="is-loading">{String(isLoading)}</div>
      <div data-testid="rate-limited">{String(rateLimited)}</div>
      <div data-testid="server-down">{String(serverDown)}</div>
      <div data-testid="error-text">{error || ''}</div>
      <button onClick={() => markAsRead(1)}>Mark One</button>
      <button onClick={() => markAllAsRead()}>Mark All</button>
      <button onClick={() => refreshNotifications()}>Refresh</button>
      <button onClick={() => checkServerStatus()}>Check Status</button>
    </div>
  );
}

describe('NotificationContext', () => {
  const socketHandlers = {};
  const socketMock = {
    on: jest.fn(),
    disconnect: jest.fn(),
  };

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    Object.keys(socketHandlers).forEach((key) => delete socketHandlers[key]);
    socketMock.on.mockReset();
    socketMock.disconnect.mockReset();
    socketMock.on.mockImplementation((event, callback) => {
      socketHandlers[event] = callback;
    });

    io.mockReturnValue(socketMock);
    useAuth.mockReturnValue({ currentUser: { id: 1, token: 'token-1' } });

    notificationService.getNotifications.mockReset();
    notificationService.markAsRead.mockReset();
    notificationService.markAllAsRead.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('loads notifications and updates connection state from socket events', async () => {
    notificationService.getNotifications.mockResolvedValue([
      { id: 1, read: false, message: 'New comment' },
      { id: 2, read: true, message: 'Task updated' },
    ]);

    render(
      <NotificationProvider>
        <NotificationHarness />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(notificationService.getNotifications).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByTestId('total-count')).toHaveTextContent('2');
    });

    await waitFor(() => {
      expect(screen.getByTestId('unread-count')).toHaveTextContent('1');
    });

    act(() => {
      socketHandlers.connect();
    });

    expect(screen.getByTestId('is-connected')).toHaveTextContent('true');
  });

  test('marks notifications as read through API and optimistic state updates', async () => {
    notificationService.getNotifications.mockResolvedValue([
      { id: 1, read: false, message: 'New mention' },
      { id: 2, read: false, message: 'Task assigned' },
    ]);
    notificationService.markAsRead.mockResolvedValue({ success: true });
    notificationService.markAllAsRead.mockResolvedValue({ success: true });

    render(
      <NotificationProvider>
        <NotificationHarness />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('unread-count')).toHaveTextContent('2');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Mark One' }));
    await waitFor(() => {
      expect(notificationService.markAsRead).toHaveBeenCalledWith(1);
    });

    await waitFor(() => {
      expect(screen.getByTestId('unread-count')).toHaveTextContent('1');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Mark All' }));
    await waitFor(() => {
      expect(notificationService.markAllAsRead).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByTestId('unread-count')).toHaveTextContent('0');
    });
  });

  test('surfaces server-down state when notification fetch reports connection error', async () => {
    notificationService.getNotifications.mockResolvedValue({
      isConnectionError: true,
    });

    render(
      <NotificationProvider>
        <NotificationHarness />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('server-down')).toHaveTextContent('true');
    });

    await waitFor(() => {
      expect(screen.getByTestId('error-text')).toHaveTextContent('Server appears to be offline');
    });
  });

  test('sets rate-limited state and skips non-forced refresh calls', async () => {
    notificationService.getNotifications.mockRejectedValue({ status: 429, message: '429 too many requests' });

    render(
      <NotificationProvider>
        <NotificationHarness />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('rate-limited')).toHaveTextContent('true');
    });

    const initialCalls = notificationService.getNotifications.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => {
      expect(notificationService.getNotifications.mock.calls.length).toBe(initialCalls);
    });
  });

  test('marks server down after repeated socket connection failures', async () => {
    notificationService.getNotifications.mockResolvedValue([]);

    jest.useFakeTimers();
    try {
      render(
        <NotificationProvider>
          <NotificationHarness />
        </NotificationProvider>
      );

      await waitFor(() => {
        expect(notificationService.getNotifications).toHaveBeenCalled();
      });

      act(() => {
        socketHandlers.connect_error(new Error('socket down'));
        socketHandlers.connect_error(new Error('socket down'));
        socketHandlers.connect_error(new Error('socket down'));
        socketHandlers.connect_error(new Error('socket down'));
        socketHandlers.connect_error(new Error('socket down'));
      });

      expect(screen.getByTestId('server-down')).toHaveTextContent('true');
      expect(socketMock.disconnect).toHaveBeenCalled();
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  test('returns early for mark-all operations while server is down', async () => {
    notificationService.getNotifications.mockResolvedValue({ isConnectionError: true });

    render(
      <NotificationProvider>
        <NotificationHarness />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('server-down')).toHaveTextContent('true');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Mark All' }));
    expect(notificationService.markAllAsRead).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Check Status' }));
    await waitFor(() => {
      expect(notificationService.getNotifications).toHaveBeenCalled();
    });
  });

  test('handles incoming socket notifications and browser notification permission', async () => {
    notificationService.getNotifications.mockResolvedValue([]);

    const browserNotification = jest.fn(() => ({ close: jest.fn() }));
    browserNotification.permission = 'granted';
    Object.defineProperty(window, 'Notification', {
      writable: true,
      value: browserNotification,
    });

    render(
      <NotificationProvider>
        <NotificationHarness />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(notificationService.getNotifications).toHaveBeenCalled();
    });

    act(() => {
      socketHandlers.notification({ id: 55, message: 'Build complete', read: false });
    });

    expect(screen.getByTestId('total-count')).toHaveTextContent('1');
    expect(screen.getByTestId('unread-count')).toHaveTextContent('1');
    expect(browserNotification).toHaveBeenCalledWith('DevSync Notification', {
      body: 'Build complete',
      icon: '/logo192.png',
    });
  });

  test('does not initialize with missing user token', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 1 } }); // No token

    render(
      <NotificationProvider>
        <NotificationHarness />
      </NotificationProvider>
    );

    // Give it a moment to possibly call the service (it shouldn't)
    await waitFor(() => {
      expect(notificationService.getNotifications).not.toHaveBeenCalled();
    });
  });

  test('debounces frequent manual refresh calls', async () => {
    notificationService.getNotifications.mockResolvedValue([]);
    jest.useFakeTimers();
    try {
      render(
        <NotificationProvider>
          <NotificationHarness />
        </NotificationProvider>
      );

      await waitFor(() => expect(notificationService.getNotifications).toHaveBeenCalledTimes(1));

      // Rapid-fire refresh clicks
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

      // Immediately there should be no extra calls (debounced)
      expect(notificationService.getNotifications).toHaveBeenCalledTimes(1);

      // Advance timers past the debounce window so the scheduled refresh fires quickly
      jest.advanceTimersByTime(100);

      await waitFor(() => expect(notificationService.getNotifications).toHaveBeenCalledTimes(2));
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  test('handles nested data format from getNotifications', async () => {
    // Backend sometimes returns { data: [...] } instead of direct array
    notificationService.getNotifications.mockResolvedValue({
      data: [{ id: 10, read: false, message: 'Nested payload' }]
    });

    render(
      <NotificationProvider>
        <NotificationHarness />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('total-count')).toHaveTextContent('1');
    });
  });

  test('handles generic fetch error', async () => {
    notificationService.getNotifications.mockRejectedValue(new Error('Some generic failure'));

    render(
      <NotificationProvider>
        <NotificationHarness />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('error-text')).toHaveTextContent('Failed to load notifications');
    });
  });

  test('markAsRead and markAllAsRead revert optimistic updates on error', async () => {
    // Initial fetch passes
    notificationService.getNotifications.mockResolvedValueOnce([
      { id: 1, read: false, message: 'Unread 1' },
      { id: 2, read: false, message: 'Unread 2' },
    ]);
    // The mark actions fail
    notificationService.markAsRead.mockRejectedValue(new Error('mark failed'));
    notificationService.markAllAsRead.mockRejectedValue(new Error('mark all failed'));
    
    // As part of the fallback, it fetches again
    notificationService.getNotifications.mockResolvedValue([
      { id: 1, read: false, message: 'Unread 1' },
      { id: 2, read: false, message: 'Unread 2' },
    ]);

    render(
      <NotificationProvider>
        <NotificationHarness />
      </NotificationProvider>
    );

    await waitFor(() => expect(screen.getByTestId('unread-count')).toHaveTextContent('2'));

    // Trigger failure
    fireEvent.click(screen.getByRole('button', { name: 'Mark One' }));

    // Re-fetch should be invoked to revert state
    await waitFor(() => {
      expect(notificationService.getNotifications).toHaveBeenCalledTimes(2);
    });

    // Mark all fail
    fireEvent.click(screen.getByRole('button', { name: 'Mark All' }));
    
    await waitFor(() => {
      expect(notificationService.getNotifications).toHaveBeenCalledTimes(3);
    });
  });
});
