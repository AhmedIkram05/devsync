import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import io from 'socket.io-client';
import { notificationService, projectService } from '../services/utils/api';
import { useAuth } from './AuthContext';
import { logger } from '../utils/logger';

const NotificationContext = createContext();

const _isTestEnv = process.env.NODE_ENV === 'test';
const MIN_FETCH_INTERVAL = _isTestEnv ? 50 : 3000; // ms between fetches
const SERVER_RETRY_DELAY = _isTestEnv ? 50 : 30000; // ms
const RATE_LIMIT_RETRY_DELAY = _isTestEnv ? 50 : 30000; // ms
const RECONNECT_RETRY_DELAY = _isTestEnv ? 50 : 60000; // ms

// Deterministic Cypress guard: background activity (heartbeat interval, socket
// polling transport, debounce/retry timeouts, reconnect loop) re-renders the
// app subtree and trips "page updated while executing" on TaskList/AdminProjects.
// notification-flows uses REST intercepts only, so skipping socket + auto-retries
// under Cypress is safe. Single mount fetch still runs so pages load.
// Jest runs with NODE_ENV=test and window.Cypress undefined -> unchanged.
const isCypress = typeof window !== 'undefined' && !!window.Cypress;

export const useNotifications = () => useContext(NotificationContext);

const isNotificationRead = (notification) => Boolean(notification?.is_read || notification?.read);

const MAX_NOTIFICATIONS = 100;

const dedupById = (list) => {
  const seen = new Set();
  return list.filter((n) => {
    const id = n?.id;
    if (id === undefined || id === null) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, MAX_NOTIFICATIONS);
};

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [serverDown, setServerDown] = useState(false);
  
  const { currentUser } = useAuth();
  
  const socketRef = useRef(null);
  const lastFetchTimeRef = useRef(0);
  const refreshTimeoutRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const isMountedRef = useRef(true);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  
  // Debounced refresh notifications function with rate limiting
  const refreshNotifications = useCallback(async (force = false) => {
    if (!isMountedRef.current) return;
    if (!currentUser) {
      return;
    }
    
    // If server is detected as down and not a forced refresh, skip
    if (serverDown && !force) {
      logger.log('Skipping notification refresh as server appears to be down');
      return;
    }

    // If rate limited and not forced, skip this refresh
    if (rateLimited && !force) {
      logger.log('Skipping notification refresh due to rate limiting');
      return;
    }
    
    // Check time since last fetch - enforce minimum 3 second gap between requests
    const now = Date.now();
    const timeSinceLastFetch = now - lastFetchTimeRef.current;
    const minFetchInterval = MIN_FETCH_INTERVAL; // ms between fetches
    
    // If we fetched recently and this isn't a forced refresh, debounce it
    if (timeSinceLastFetch < minFetchInterval && !force) {
      // Clear any existing timeout
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      // Under Cypress skip the deferred retry: no background re-render loop.
      // The forced mount fetch still runs, so pages load deterministically.
      if (isCypress) {
        return;
      }

      // Set a new timeout to fetch after the minimum interval has passed
      refreshTimeoutRef.current = setTimeout(() => {
        if (!isMountedRef.current) {
          refreshTimeoutRef.current = null;
          return;
        }
        refreshNotifications(true); // Force refresh after delay
      }, minFetchInterval - timeSinceLastFetch);
      
      return;
    }
    
    // Clear any existing timeout
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      lastFetchTimeRef.current = now; // Update last fetch time
      
      const data = await notificationService.getNotifications();
      
      // Check if we received a connection error
      if (data && data.isConnectionError) {
        setServerDown(true);
        setError("Server appears to be offline. Notifications will refresh when the connection is restored.");
        return;
      }
      
      // If we got here, the server is up
      setServerDown(false);
      
      // Reset rate limited flag on successful fetch
      if (rateLimited) {
        setRateLimited(false);
      }
      
      if (Array.isArray(data)) {
        setNotifications(dedupById(data));
      } else if (data && Array.isArray(data.data)) {
        setNotifications(dedupById(data.data));
      } else {
        logger.warn('Unexpected notification data format:', data);
        setNotifications([]);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      
      // Detect server connection issues
      if (error.message && (
          error.message.includes('Failed to fetch') || 
          error.message.includes('Network Error') ||
          error.message.includes('server is down')
      )) {
        setServerDown(true);
        setError("Server connection failed. Notifications will refresh when the connection is restored.");

        // Under Cypress skip the auto-retry loop (re-render churn); manual retry via checkServerStatus.
        if (isCypress) {
          return;
        }

        // Schedule a check to see if server is back up
        refreshTimeoutRef.current = setTimeout(() => {
          if (!isMountedRef.current) {
            refreshTimeoutRef.current = null;
            return;
          }
          logger.log('Checking if server is back online...');
          refreshNotifications(true);
        }, SERVER_RETRY_DELAY);
        
        return;
      }
      
      // Handle rate limiting error specifically
      if (error.status === 429 || (error.message && error.message.includes('429'))) {
        logger.warn('Rate limited when fetching notifications. Will try again later.');
        setRateLimited(true);

        // Under Cypress skip the auto-retry loop (re-render churn).
        if (isCypress) {
          return;
        }

        // Auto retry after a longer delay for rate limit errors
        refreshTimeoutRef.current = setTimeout(() => {
          if (!isMountedRef.current) {
            refreshTimeoutRef.current = null;
            return;
          }
          logger.log('Attempting to fetch notifications again after rate limit cooling period');
          refreshNotifications(true);
        }, RATE_LIMIT_RETRY_DELAY);
      } else {
        setError('Failed to load notifications');
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, rateLimited, serverDown]);
  
  useEffect(() => {
    lastFetchTimeRef.current = 0;
  }, [currentUser]);

  useEffect(() => {
    isMountedRef.current = true;
    let socketConnection = null;
    
    const connectSocket = () => {
      if (!currentUser) {
        logger.log('No user available for socket connection');
        return;
      }
      
      // Don't try to connect if we know the server is down
      if (serverDown) {
        logger.log('Not connecting to WebSocket - server appears to be down');
        return;
      }
      
      // Clean up any existing connection
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      
      try {
        // Create socket connection with sensible defaults
        const configuredApiUrl = process.env.REACT_APP_API_URL;
        const socketUrl = configuredApiUrl
          ? (() => {
              try {
                return new URL(configuredApiUrl).origin;
              } catch (error) {
                return configuredApiUrl.replace(/\/api\/v1\/?$/, '');
              }
            })()
          : process.env.NODE_ENV === 'development'
            ? `${window.location.protocol}//${window.location.hostname}:8000`
            : `${window.location.protocol}//${window.location.hostname}`;

        const configuredTransport = (process.env.REACT_APP_SOCKET_TRANSPORT || 'both').toLowerCase();
        const transportMap = {
          polling: ['polling'],
          websocket: ['websocket'],
          both: ['polling', 'websocket']
        };
        const socketTransports = transportMap[configuredTransport] || transportMap.both;
        socketConnection = io(socketUrl, {
          withCredentials: true,
          transports: socketTransports,
          upgrade: socketTransports.length > 1,
          reconnection: true,
          reconnectionAttempts: maxReconnectAttempts,
          reconnectionDelay: 1000,
          timeout: 5000 // Shorter timeout to detect connection issues faster
        });
        
        // Store the socket in the ref
        socketRef.current = socketConnection;

        // D5 presence: a 10s heartbeat keeps the server-side 30s presence key
        // alive (3:1 TTL-to-beat ratio survives one dropped beat). Cleared on
        // teardown and whenever a new connection replaces this one.
        // Skipped under Cypress: the interval re-renders the app subtree.
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
        if (!isCypress) {
          heartbeatIntervalRef.current = setInterval(() => {
            if (socketConnection.connected && typeof socketConnection.emit === 'function') {
              socketConnection.emit('heartbeat', {});
            }
          }, 10000);
        }
        
        // Socket event handlers
        socketConnection.on('connect', () => {
          logger.log('Socket.IO connected');
          setIsConnected(true);
          setServerDown(false); // Clear server down flag on successful connection
          reconnectAttemptsRef.current = 0; // Reset reconnect counter
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }

          if (typeof socketConnection.emit === 'function') {
            socketConnection.emit('register', {}, (ack) => {
              if (ack?.status && ack.status !== 'success') {
                logger.warn('Socket.IO registration did not succeed:', ack);
              }
            });

            // Join rooms for every project this user can see so room-scoped
            // dashboard pings reach them (and only them). The server re-checks
            // membership on join, so a forged project_id is denied. Best
            // effort: missing the ping only delays a refresh, REST stays
            // authoritative. Re-runs on every reconnect since rooms are
            // per-connection server-side.
            Promise.resolve()
              .then(() => projectService.getAllProjects())
              .then((projects) => {
                (Array.isArray(projects) ? projects : []).forEach((p) => {
                  const pid = p?.id ?? p?.project_id;
                  if (pid !== undefined && pid !== null) {
                    socketConnection.emit('join_project', { project_id: pid });
                  }
                });
              })
              .catch((e) => {
                logger.warn('Socket project-room join failed:', e?.message || e);
              });
          }
        });
        
        socketConnection.on('disconnect', () => {
          logger.log('Socket.IO disconnected');
          setIsConnected(false);
        });
        
        socketConnection.on('connect_error', (error) => {
          console.error('Socket.IO connection error:', error);
          setIsConnected(false);
          
          reconnectAttemptsRef.current++;
          logger.log(`Socket connection attempt ${reconnectAttemptsRef.current} of ${maxReconnectAttempts} failed`);
          
          // After max attempts, stop trying and mark server as down
          if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
            console.error('Maximum WebSocket reconnection attempts reached - marking server as down');
            setServerDown(true);
            
            // Close the socket to prevent further automatic reconnect attempts
            if (socketRef.current) {
              socketRef.current.disconnect();
              socketRef.current = null;
            }
            
            // Schedule a retry to check if server is up after a longer delay
            // Skipped under Cypress: no reconnect loop re-render churn.
            if (!isCypress) {
              if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
              }
              reconnectTimeoutRef.current = setTimeout(() => {
                if (!isMountedRef.current) {
                  reconnectTimeoutRef.current = null;
                  return;
                }
                logger.log('Checking if server is back online...');
                setServerDown(false); // Reset the flag to allow reconnection attempts
                reconnectAttemptsRef.current = 0; // Reset counter
                connectSocket(); // Try to connect again
                refreshNotifications(true); // Also refresh notifications
                reconnectTimeoutRef.current = null;
              }, RECONNECT_RETRY_DELAY);
            }
          }
        });
        
        // Listen for notifications
        socketConnection.on('notification', (newNotification) => {
          logger.log('Received new notification:', newNotification);
          setNotifications(prev =>
            prev.some((n) => n?.id !== undefined && n?.id === newNotification?.id)
              ? prev
              : [newNotification, ...prev].slice(0, MAX_NOTIFICATIONS)
          );
          
          // If browser notifications are supported and permitted, show a browser notification
          if ('Notification' in window && Notification.permission === 'granted') {
            try {
              const notification = new Notification('DevSync Notification', {
                body: newNotification.message,
                icon: '/logo192.png' // Replace with your app's icon
              });
              
              // Open app when notification is clicked
              notification.onclick = function() {
                window.focus();
                notification.close();
              };
            } catch (e) {
              console.error('Error showing browser notification:', e);
            }
          }
        });

        // Relay task-related socket events into a global browser event so other parts
        // of the UI (e.g., dashboards) can react without coupling to the socket context.
        const relayTaskEvent = (taskPayload) => {
          try {
            window.dispatchEvent(new CustomEvent('devsync:task-updated', { detail: taskPayload }));
          } catch (e) {
            logger.warn('Failed to dispatch devsync:task-updated event', e);
          }
        };

        const relayDashboardEvent = (payload) => {
          try {
            window.dispatchEvent(new CustomEvent('devsync:dashboard-updated', { detail: payload }));
          } catch (e) {
            logger.warn('Failed to dispatch devsync:dashboard-updated event', e);
          }
        };

        // Common task event names the backend may emit; listen to several variants.
        ['task', 'task.updated', 'task_update', 'task:updated', 'task_updated'].forEach((evtName) => {
          socketConnection.on(evtName, (payload) => {
            logger.log(`Received socket event ${evtName}`, payload);
            relayTaskEvent(payload || {});
            relayDashboardEvent(payload || {});
          });
        });

        socketConnection.on('dashboard_updated', (payload) => {
          logger.log('Received socket event dashboard_updated', payload);
          relayDashboardEvent(payload || {});
        });
      } catch (error) {
        console.error('Error setting up socket connection:', error);
      }
    };
    
    // Only try to connect if we have a user and the server is not known to be down
    // Under Cypress skip socket connect (tests use REST intercepts); keep the
    // single mount fetch so pages load deterministically with no polling churn.
    if (currentUser && !serverDown) {
      if (!isCypress) {
        connectSocket();
      }
      if (!rateLimited) {
        refreshNotifications(true); // Initial fetch with force=true
      }
    }
    
    // Clean up function
    return () => {
      isMountedRef.current = false;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [currentUser, refreshNotifications, serverDown, rateLimited]);
  
  // Calculate unread count
  const unreadCount = notifications.filter(notification => !isNotificationRead(notification)).length;
  
  // Mark a notification as read
  const markAsRead = async (notificationId) => {
    if (serverDown) {
      logger.log('Server appears to be down, cannot mark notification as read');
      return;
    }
    
    try {
      // Optimistic UI update
      setNotifications(prev => prev.map(notification =>
        notification.id === notificationId 
          ? { ...notification, read: true, is_read: true }
          : notification
      ));
      
      // Make API call
      await notificationService.markAsRead(notificationId);
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      // Revert the UI change in case of error
      refreshNotifications(true);
    }
  };

  const deleteNotification = async (notificationId) => {
    if (serverDown) {
      logger.log('Server appears to be down, cannot delete notification');
      return;
    }

    const previousNotifications = notifications;

    try {
      setNotifications((prev) => prev.filter((notification) => notification.id !== notificationId));
      await notificationService.deleteNotification(notificationId);
    } catch (error) {
      console.error('Failed to delete notification:', error);
      setNotifications(previousNotifications);
    }
  };
  
  // Mark all notifications as read
  const markAllAsRead = async () => {
    if (serverDown) {
      logger.log('Server appears to be down, cannot mark all notifications as read');
      return;
    }
    
    try {
      // Update UI immediately for better UX
      setNotifications(prev => prev.map(notification => ({ ...notification, read: true, is_read: true })));
      
      // API call to mark all as read
      await notificationService.markAllAsRead();
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
      // Revert UI change if the API call failed
      refreshNotifications(true);
    }
  };
  
  // Check if server is back online
  const checkServerStatus = useCallback(() => {
    if (serverDown) {
      logger.log('Checking if server is back online...');
      refreshNotifications(true);
    }
  }, [serverDown, refreshNotifications]);
  
  const value = {
    notifications,
    unreadCount,
    markAsRead,
    deleteNotification,
    markAllAsRead,
    refreshNotifications,
    isConnected,
    isLoading,
    error,
    rateLimited,
    serverDown,
    checkServerStatus
  };
  
  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationContext;
