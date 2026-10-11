import { useNotifications } from '../context/NotificationContext';

// Thin wrapper around NotificationContext: socket state only, no behavior change.
export const useNotificationSocket = () => {
  const { isConnected, serverDown, checkServerStatus } = useNotifications();
  return { isConnected, serverDown, checkServerStatus };
};

export default useNotificationSocket;
