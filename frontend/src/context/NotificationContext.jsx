import React, { createContext, useContext } from 'react';
import { useNotificationSocket } from '../hooks/useNotificationSocket';

const NotificationContext = createContext();

export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }) => {
  // Socket subscription + notification state/dedup/read bookkeeping all live in
  // the hook; the provider only wires the value into the context.
  const value = useNotificationSocket();

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationContext;
