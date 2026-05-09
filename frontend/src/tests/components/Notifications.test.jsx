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

  test('renders loading and error states when no notifications exist', async () => {
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

    await waitFor(() => {
      expect(onNotificationUpdate).toHaveBeenCalled();
    });
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

  test('deletes notification when delete button clicked', async () => {
    const deleteNotification = jest.fn().mockResolvedValue({ success: true });
    const onNotificationUpdate = jest.fn();

    useNotifications.mockReturnValue({
      isLoading: false,
      error: null,
      rateLimited: false,
      refreshNotifications,
      deleteNotification,
    });

    render(
      <Notifications
        notifications={[
          {
            id: 31,
            content: 'Notification to delete',
            created_at: '2099-01-01T00:00:00.000Z',
            read: false,
          },
        ]}
        onNotificationUpdate={onNotificationUpdate}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => {
      expect(deleteNotification).toHaveBeenCalledWith(31);
    });

    await waitFor(() => {
      expect(onNotificationUpdate).toHaveBeenCalled();
    });
  });

  test('handles delete failure gracefully', async () => {
    const deleteNotification = jest.fn().mockRejectedValue(new Error('delete failed'));

    useNotifications.mockReturnValue({
      isLoading: false,
      error: null,
      rateLimited: false,
      refreshNotifications,
      deleteNotification,
    });

    render(
      <Notifications
        notifications={[
          {
            id: 41,
            content: 'Notification to fail delete',
            created_at: '2099-01-01T00:00:00.000Z',
            read: false,
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith('Failed to delete notification:', expect.any(Error));
    });
  });

  test('uses provided onMarkRead callback if available', async () => {
    const onMarkRead = jest.fn().mockResolvedValue({ success: true });
    const onNotificationUpdate = jest.fn();

    render(
      <Notifications
        notifications={[
          {
            id: 51,
            content: 'Test notification',
            created_at: '2099-01-01T00:00:00.000Z',
            read: false,
          },
        ]}
        onMarkRead={onMarkRead}
        onNotificationUpdate={onNotificationUpdate}
      />
    );

    fireEvent.click(screen.getByText(/Test notification/i));

    await waitFor(() => {
      expect(onMarkRead).toHaveBeenCalledWith(51);
    });
  });

  test('uses provided onDelete callback if available', async () => {
    const onDelete = jest.fn().mockResolvedValue({ success: true });
    const onNotificationUpdate = jest.fn();

    render(
      <Notifications
        notifications={[
          {
            id: 61,
            content: 'Test delete',
            created_at: '2099-01-01T00:00:00.000Z',
            read: false,
          },
        ]}
        onDelete={onDelete}
        onNotificationUpdate={onNotificationUpdate}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith(61);
    });
  });

  test('renders notification with title', () => {
    render(
      <Notifications
        notifications={[
          {
            id: 71,
            title: 'Task Update',
            content: 'Your task has been updated',
            created_at: '2099-01-01T00:00:00.000Z',
            read: false,
          },
        ]}
      />
    );

    expect(screen.getByText('Task Update')).toBeInTheDocument();
    expect(screen.getByText('Your task has been updated')).toBeInTheDocument();
  });

  test('renders read and unread notifications with different styles', () => {
    render(
      <Notifications
        notifications={[
          {
            id: 81,
            content: 'Read notification',
            created_at: '2099-01-01T00:00:00.000Z',
            read: true,
          },
          {
            id: 82,
            content: 'Unread notification',
            created_at: '2099-01-01T00:00:00.000Z',
            read: false,
          },
        ]}
      />
    );

    expect(screen.getByText('Read notification')).toBeInTheDocument();
    expect(screen.getByText('Unread notification')).toBeInTheDocument();
  });

  test('handles notifications with missing properties', () => {
    render(
      <Notifications
        notifications={[
          {
            id: 91,
            // missing content, title, created_at
          },
        ]}
      />
    );

    expect(screen.getByText('No content')).toBeInTheDocument();
    expect(screen.getByText('Unknown date')).toBeInTheDocument();
  });

  test('prevents delete of the same notification twice simultaneously', async () => {
    const deleteNotification = jest.fn();

    useNotifications.mockReturnValue({
      isLoading: false,
      error: null,
      rateLimited: false,
      refreshNotifications,
      deleteNotification,
    });

    deleteNotification.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ success: true }), 100)));

    render(
      <Notifications
        notifications={[
          {
            id: 101,
            content: 'Notification',
            created_at: '2099-01-01T00:00:00.000Z',
            read: false,
          },
        ]}
      />
    );

    const deleteBtn = screen.getByRole('button', { name: /delete/i });
    fireEvent.click(deleteBtn);

    // Button should show 'Deleting...'
    await waitFor(() => {
      expect(deleteBtn).toBeDisabled();
    });

    expect(deleteBtn).toHaveTextContent('Deleting...');
  });

  test('handles null notifications array', () => {
    render(<Notifications notifications={null} />);

    expect(screen.getByText(/No new notifications/i)).toBeInTheDocument();
  });
});
