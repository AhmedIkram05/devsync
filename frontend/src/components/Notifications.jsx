import React from 'react';
import { notificationService } from '../services/utils/api';
import { useNotifications } from '../context/NotificationContext';

function Notifications({ notifications = [], onNotificationUpdate }) {
  const { isLoading, error, rateLimited, refreshNotifications } = useNotifications();

  const handleNotificationClick = async (notificationId) => {
    if (!notificationId) return;
    
    try {
      await notificationService.markAsRead(notificationId);
      // Callback to parent to refresh notifications
      if (typeof onNotificationUpdate === 'function') {
        onNotificationUpdate();
      }
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  // Handle rate limited state
  if (rateLimited) {
    return (
      <div className="bg-slate-900/70 p-4 rounded-xl border border-slate-800/80">
        <div className="bg-amber-500/10 border border-amber-400/40 text-amber-200 px-4 py-3 rounded mb-4">
          <h3 className="font-semibold">Rate limit exceeded</h3>
          <p className="mt-1">Too many notification requests. Please wait a moment.</p>
          <button 
            onClick={() => refreshNotifications(true)}
            className="mt-2 text-sm font-medium text-rose-300 hover:text-rose-200"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Handle loading state
  if (isLoading && (!notifications || notifications.length === 0)) {
    return (
      <div className="bg-slate-900/70 p-4 rounded-xl border border-slate-800/80">
        <div className="flex justify-center items-center py-4">
          <svg className="animate-spin h-5 w-5 text-rose-400 mr-2" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-slate-300">Loading notifications...</span>
        </div>
      </div>
    );
  }

  // Handle error state
  if (error && (!notifications || notifications.length === 0)) {
    return (
      <div className="bg-slate-900/70 p-4 rounded-xl border border-slate-800/80">
        <div className="bg-rose-500/10 border border-rose-400/40 text-rose-200 px-4 py-3 rounded mb-4">
          <div className="flex">
            <svg className="h-5 w-5 text-rose-300 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>{error}</p>
          </div>
          <button 
            onClick={() => refreshNotifications(true)}
            className="mt-2 text-sm font-medium text-rose-300 hover:text-rose-200"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
  
  // Safely handle empty notifications array
  if (!notifications || notifications.length === 0) {
    return (
      <div className="bg-slate-900/70 p-4 rounded-xl border border-slate-800/80">
        <div className="text-slate-500 text-center">No new notifications</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/70 p-4 rounded-xl border border-slate-800/80">
      <div className="space-y-2">
        {notifications.map((notification) => {
          // Ensure each notification has an id
          const notificationId = notification?.id || `notification-${Math.random().toString(36).substr(2, 9)}`;
          const isRead = notification?.is_read || notification?.read || false;
          const content = notification?.content || notification?.message || 'No content';
          const createdAt = notification?.created_at ? new Date(notification.created_at).toLocaleDateString() : 'Unknown date';
          
          return (
            <div 
              key={notificationId} 
              className={`p-3 rounded cursor-pointer border ${isRead ? 'bg-slate-950/60 border-slate-800/60' : 'bg-rose-500/10 border-rose-400/20'} hover:bg-slate-900/70`}
              onClick={() => handleNotificationClick(notificationId)}
            >
              <div className="flex justify-between items-start">
                <div className="text-slate-200">{content}</div>
                <div className="text-xs text-slate-500">
                  {createdAt}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Notifications;