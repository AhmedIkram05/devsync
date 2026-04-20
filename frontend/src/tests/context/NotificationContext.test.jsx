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
    serverDown,
    error,
    markAsRead,
    markAllAsRead,
  } = useNotifications();

  return (
    <div>
      <div data-testid="total-count">{String(notifications.length)}</div>
      <div data-testid="unread-count">{String(unreadCount)}</div>
      <div data-testid="is-connected">{String(isConnected)}</div>
      <div data-testid="server-down">{String(serverDown)}</div>
      <div data-testid="error-text">{error || ''}</div>
      <button onClick={() => markAsRead(1)}>Mark One</button>
      <button onClick={() => markAllAsRead()}>Mark All</button>
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
});
