import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import io from 'socket.io-client';

import { NotificationProvider, useNotifications } from '../../context/NotificationContext';
import { notificationService, projectService } from '../../services/utils/api';
import { useAuth } from '../../context/AuthContext';

jest.mock('socket.io-client', () => jest.fn());

jest.mock('../../services/utils/api', () => ({
  notificationService: {
    getNotifications: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
    deleteNotification: jest.fn(),
  },
  projectService: {
    getAllProjects: jest.fn(),
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
    deleteNotification,
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
      <button onClick={() => deleteNotification(1)}>Delete One</button>
      <button onClick={() => deleteNotification(2)}>Delete Two</button>
      <button onClick={() => markAllAsRead()}>Mark All</button>
      <button onClick={() => refreshNotifications()}>Refresh</button>
      <button onClick={() => checkServerStatus()}>Check Status</button>
    </div>
  );
}

describe('NotificationContext', () => {
  let socketHandlers;
  let socketMock;

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    socketHandlers = {};
    socketMock = {
      on: jest.fn((event, callback) => {
        socketHandlers[event] = callback;
      }),
      emit: jest.fn(),
      disconnect: jest.fn(),
    };

    io.mockReturnValue(socketMock);
    useAuth.mockReturnValue({ currentUser: { id: 1, token: 'token-1' } });

    notificationService.getNotifications.mockReset();
    notificationService.markAsRead.mockReset();
    notificationService.markAllAsRead.mockReset();
    notificationService.deleteNotification.mockReset();
    projectService.getAllProjects.mockReset();
  });

  afterEach(() => {
    // Unmount before the next test rebuilds the mock, so a late effect from a
    // prior test cannot re-register handlers on a shared mock object.
    cleanup();
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

    expect(io).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      withCredentials: true,
    }));
    expect(io.mock.calls[0][1].auth).toBeUndefined();

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
    expect(socketMock.emit).toHaveBeenCalledWith('register', {}, expect.any(Function));
  });

  test('joins project rooms on socket connect for room-scoped pings', async () => {
    notificationService.getNotifications.mockResolvedValue([]);
    projectService.getAllProjects.mockResolvedValue([{ id: 11 }, { id: 22 }]);

    render(
      <NotificationProvider>
        <NotificationHarness />
      </NotificationProvider>
    );

    act(() => {
      socketHandlers.connect();
    });

    await waitFor(() => {
      expect(socketMock.emit).toHaveBeenCalledWith('join_project', { project_id: 11 });
    });
    expect(socketMock.emit).toHaveBeenCalledWith('join_project', { project_id: 22 });
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

      await act(async () => {});

      expect(notificationService.getNotifications).toHaveBeenCalled();

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

  test('initializes with a user even when no token is present', async () => {
    notificationService.getNotifications.mockResolvedValue([]);
    useAuth.mockReturnValue({ currentUser: { id: 1 } }); // No token

    render(
      <NotificationProvider>
        <NotificationHarness />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(notificationService.getNotifications).toHaveBeenCalled();
    });

    expect(io).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      withCredentials: true,
    }));
    expect(io.mock.calls[0][1].auth).toBeUndefined();
  });

  test('does not initialize without a current user', async () => {
    useAuth.mockReturnValue({ currentUser: null });

    render(
      <NotificationProvider>
        <NotificationHarness />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(notificationService.getNotifications).not.toHaveBeenCalled();
    });
    expect(io).not.toHaveBeenCalled();
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

      // The mount fetch is invoked synchronously by the effect; flush it
      // without waitFor, which polls on real timers while fake timers are active.
      await act(async () => {});
      expect(notificationService.getNotifications).toHaveBeenCalledTimes(1);

      // Rapid-fire refresh clicks
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

      // Immediately there should be no extra calls (debounced)
      expect(notificationService.getNotifications).toHaveBeenCalledTimes(1);

      // Advance timers past the debounce window so the scheduled refresh fires quickly
      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      expect(notificationService.getNotifications).toHaveBeenCalledTimes(2);
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

  test('deletes notifications and reverts on delete failure', async () => {
    notificationService.getNotifications.mockResolvedValue([
      { id: 1, read: false, message: 'Delete me' },
      { id: 2, read: false, message: 'Keep me' },
    ]);
    notificationService.deleteNotification
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('delete failed'));

    render(
      <NotificationProvider>
        <NotificationHarness />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('total-count')).toHaveTextContent('2');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delete One' }));

    await waitFor(() => {
      expect(notificationService.deleteNotification).toHaveBeenCalledWith(1);
    });

    expect(screen.getByTestId('total-count')).toHaveTextContent('1');

    fireEvent.click(screen.getByRole('button', { name: 'Delete Two' }));

    await waitFor(() => {
      expect(notificationService.deleteNotification).toHaveBeenCalledWith(2);
    });

    await waitFor(() => {
      expect(screen.getByTestId('total-count')).toHaveTextContent('1');
    });
  });

  test('relays task and dashboard socket events to window events', async () => {
    notificationService.getNotifications.mockResolvedValue([]);
    const dispatchSpy = jest.spyOn(window, 'dispatchEvent');

    render(
      <NotificationProvider>
        <NotificationHarness />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(notificationService.getNotifications).toHaveBeenCalled();
    });

    act(() => {
      socketHandlers['task.updated']({ id: 99, status: 'completed' });
      socketHandlers.dashboard_updated({ id: 99, status: 'completed' });
    });

    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(CustomEvent));
    dispatchSpy.mockRestore();
  });

  test('refetches after unmount/remount (mounted flag reset)', async () => {
    // Freeze the clock so the 50ms minimum-fetch window cannot be crossed by
    // wall-clock drift between mount and remount on a loaded CI runner.
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);

    notificationService.getNotifications.mockResolvedValue([
      { id: 1, read: false, message: 'First mount' },
    ]);

    const { unmount } = render(
      <NotificationProvider>
        <NotificationHarness />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(notificationService.getNotifications).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByTestId('total-count')).toHaveTextContent('1');
    });

    unmount();

    notificationService.getNotifications.mockClear();
    notificationService.getNotifications.mockResolvedValue([
      { id: 2, read: false, message: 'Second mount' },
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
      expect(screen.getByTestId('total-count')).toHaveTextContent('1');
    });
  });

  test('ignores duplicate socket notification ids', async () => {
    notificationService.getNotifications.mockResolvedValue([
      { id: 1, read: false, message: 'Existing' },
    ]);

    render(
      <NotificationProvider>
        <NotificationHarness />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('total-count')).toHaveTextContent('1');
    });

    act(() => {
      socketHandlers.notification({ id: 1, message: 'Existing duplicate', read: false });
    });

    expect(screen.getByTestId('total-count')).toHaveTextContent('1');

    act(() => {
      socketHandlers.notification({ id: 2, message: 'Brand new', read: false });
    });

    expect(screen.getByTestId('total-count')).toHaveTextContent('2');
  });

  test('dedups REST payload by id and caps list at 100', async () => {
    const payload = [
      { id: 1, read: false, message: 'Dup A' },
      { id: 1, read: false, message: 'Dup A again' },
      ...Array.from({ length: 150 }, (_, i) => ({ id: 1000 + i, read: false, message: `N-${i}` })),
    ];
    notificationService.getNotifications.mockResolvedValue(payload);

    render(
      <NotificationProvider>
        <NotificationHarness />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('total-count')).toHaveTextContent('100');
    });
  });
});
