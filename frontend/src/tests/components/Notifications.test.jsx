import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import Notifications from '../../components/Notifications';
import { notificationService } from '../../services/utils/api';
import { useNotifications } from '../../context/NotificationContext';

jest.mock('../../services/utils/api', () => ({
  notificationService: {
    markAsRead: jest.fn(),
  },
}));

jest.mock('../../context/NotificationContext', () => ({
  useNotifications: jest.fn(),
}));

describe('Notifications component', () => {
  const refreshNotifications = jest.fn();

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    refreshNotifications.mockReset();
    notificationService.markAsRead.mockReset();

    useNotifications.mockReturnValue({
      isLoading: false,
      error: null,
      rateLimited: false,
      refreshNotifications,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders rate limited state and retries refresh', () => {
    useNotifications.mockReturnValue({
      isLoading: false,
      error: null,
      rateLimited: true,
      refreshNotifications,
    });

    render(<Notifications notifications={[]} onNotificationUpdate={jest.fn()} />);

    expect(screen.getByText(/Rate limit exceeded/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refreshNotifications).toHaveBeenCalledWith(true);
  });

  test('renders loading and error states when no notifications exist', () => {
    useNotifications.mockReturnValue({
      isLoading: true,
      error: null,
      rateLimited: false,
      refreshNotifications,
    });

    const { rerender } = render(<Notifications notifications={[]} />);

    expect(screen.getByText(/Loading notifications/i)).toBeInTheDocument();

    useNotifications.mockReturnValue({
      isLoading: false,
      error: 'Failed to load notifications',
      rateLimited: false,
      refreshNotifications,
    });

    rerender(<Notifications notifications={[]} />);

    expect(screen.getByText(/Failed to load notifications/i)).toBeInTheDocument();
  });

  test('renders empty state for no notifications', () => {
    render(<Notifications notifications={[]} onNotificationUpdate={jest.fn()} />);

    expect(screen.getByText(/No new notifications/i)).toBeInTheDocument();
  });

  test('marks notification as read and invokes update callback', async () => {
    const onNotificationUpdate = jest.fn();
    notificationService.markAsRead.mockResolvedValue({ success: true });

    render(
      <Notifications
        notifications={[
          {
            id: 11,
            content: 'Task assigned to you',
            created_at: '2099-01-01T00:00:00.000Z',
            read: false,
          },
        ]}
        onNotificationUpdate={onNotificationUpdate}
      />
    );

    fireEvent.click(screen.getByText(/Task assigned to you/i));

    await waitFor(() => {
      expect(notificationService.markAsRead).toHaveBeenCalledWith(11);
    });

    expect(onNotificationUpdate).toHaveBeenCalled();
  });

  test('handles mark-as-read failure gracefully', async () => {
    notificationService.markAsRead.mockRejectedValue(new Error('mark failed'));

    render(
      <Notifications
        notifications={[
          {
            id: 21,
            message: 'Build failed',
            created_at: '2099-01-01T00:00:00.000Z',
            is_read: true,
          },
        ]}
      />
    );

    fireEvent.click(screen.getByText(/Build failed/i));

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith('Failed to mark notification as read:', expect.any(Error));
    });
  });
});
