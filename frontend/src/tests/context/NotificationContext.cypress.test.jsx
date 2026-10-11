import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('socket.io-client', () => jest.fn());

jest.mock('../../services/utils/api', () => ({
  notificationService: {
    getNotifications: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
    deleteNotification: jest.fn(),
  },
  projectService: { getAllProjects: jest.fn() },
}));

jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }));

// window.Cypress must be truthy before NotificationContext is first required:
// the module captures `isCypress` in a module-level const at import time, so it
// cannot be a static import here.
window.Cypress = {};

const io = require('socket.io-client');
const { notificationService } = require('../../services/utils/api');
const { useAuth } = require('../../context/AuthContext');
const { NotificationProvider, useNotifications } = require('../../context/NotificationContext');

const Harness = () => {
  const { notifications, serverDown, rateLimited, refreshNotifications } = useNotifications();
  return (
    <div>
      <div data-testid="count">{String(notifications.length)}</div>
      <div data-testid="server-down">{String(serverDown)}</div>
      <div data-testid="rate-limited">{String(rateLimited)}</div>
      <button onClick={() => refreshNotifications()}>Refresh</button>
    </div>
  );
};

// Under Cypress the background churn (socket, debounce/retry timers) must be
// skipped while the single mount fetch still runs. These branches are only
// reachable with window.Cypress truthy.
describe('NotificationContext under Cypress (window.Cypress truthy)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ currentUser: { id: 1, token: 'token-1' } });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('skips the socket connection but still performs the mount fetch', async () => {
    notificationService.getNotifications.mockResolvedValue([{ id: 1, message: 'x', is_read: false }]);

    render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(notificationService.getNotifications).toHaveBeenCalledTimes(1);
    });
    expect(io).not.toHaveBeenCalled();
  });

  test('skips the debounced retry for a near-immediate non-forced refresh', async () => {
    notificationService.getNotifications.mockResolvedValue([]);

    render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(notificationService.getNotifications).toHaveBeenCalledTimes(1);
    });

    // Inside the minimum-fetch window; Cypress returns instead of scheduling a timer.
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(notificationService.getNotifications).toHaveBeenCalledTimes(1);
  });

  test('skips the server-retry timer when the mount fetch reports the server offline', async () => {
    notificationService.getNotifications.mockRejectedValue(new Error('Failed to fetch'));

    render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('server-down')).toHaveTextContent('true');
    });
  });

  test('skips the rate-limit retry timer when the mount fetch is throttled', async () => {
    const err = new Error('429 too many requests');
    err.status = 429;
    notificationService.getNotifications.mockRejectedValue(err);

    render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('rate-limited')).toHaveTextContent('true');
    });
  });
});
