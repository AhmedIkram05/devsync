import { useNotifications } from '../context/NotificationContext';

// Thin wrapper around NotificationContext: fetch/mutation helpers only, no behavior change.
export const useNotificationFetch = () => {
  const {
    notifications,
    unreadCount,
    markAsRead,
    deleteNotification,
    markAllAsRead,
    refreshNotifications,
    isLoading,
    error,
    rateLimited,
  } = useNotifications();
  return {
    notifications,
    unreadCount,
    markAsRead,
    deleteNotification,
    markAllAsRead,
    refreshNotifications,
    isLoading,
    error,
    rateLimited,
  };
};

export default useNotificationFetch;
