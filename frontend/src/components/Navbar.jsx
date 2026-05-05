import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationContext";
import { useState, useEffect } from "react";
import Notifications from "./Notifications";

const Navbar = () => {
  const { currentUser, logout } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead, refreshNotifications, isConnected } = useNotifications();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  
  // Request notification permission when the component mounts
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await logout();
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      setIsLoggingOut(false);
    }
  };
  
  const toggleMobileMenu = () => {
    setShowMobileMenu(!showMobileMenu);
  };
  
  const toggleNotifications = () => {
    setShowNotifications(!showNotifications);
    
    // If we're showing notifications and there are unread ones,
    // fetch the latest to ensure we have the newest data
    if (!showNotifications) {
      refreshNotifications();
    }
  };
  
  if (!currentUser) return null;
  
  const isAdmin = currentUser.role === "admin";
  const canCreateTasks = isAdmin || currentUser.role === "team_lead";

  return (
    <nav className="bg-transparent p-4 text-white">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6">
        <Link to="/" className="text-lg font-semibold tracking-wide">
          DevSync
        </Link>
        
        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center space-x-6">
          {isAdmin ? (
            <>
              <Link to="/admin" className="hover:text-gray-300 transition">
                Dashboard
              </Link>
              <Link to="/admin/create-task" className="hover:text-gray-300 transition">
                Create Task
              </Link>
              <Link to="/admin/developer-progress" className="hover:text-gray-300 transition">
                Developer Progress
              </Link>
              <Link to="/admin/reports" className="hover:text-gray-300 transition">
                Reports
              </Link>
              <Link to="/github" className="hover:text-gray-300 transition">
                GitHub
              </Link>
            </>
          ) : (
            <>
              <Link to="/BasicDashboard" className="hover:text-gray-300 transition">
                Dashboard
              </Link>
              <Link to="/tasks" className="hover:text-gray-300 transition">
                Tasks
              </Link>
              {canCreateTasks && (
                <Link to="/admin/create-task" className="hover:text-gray-300 transition">
                  Create Task
                </Link>
              )}
              <Link to="/github" className="hover:text-gray-300 transition">
                GitHub
              </Link>
            </>
          )}
          
          {/* Connection Status Indicator */}
          <div className="flex items-center">
            <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-red-500'}`}></span>
            <span className="ml-2 text-xs text-slate-300">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          
          {/* Notification Bell */}
          <div className="relative">
            <button 
              onClick={toggleNotifications}
              aria-label="Notifications"
              className="hover:text-gray-300 transition focus:outline-none"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              
              {unreadCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
            
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-slate-900/95 rounded-lg shadow-lg overflow-hidden z-20 border border-slate-800/70">
                <div className="py-2 px-3 bg-slate-800/70 text-slate-100 font-semibold flex justify-between">
                  <span>Notifications</span>
                </div>
                
                <div className="max-h-64 overflow-y-auto">
                  <Notifications 
                    notifications={notifications}
                    onNotificationUpdate={markAsRead}
                  />
                </div>
                
                {notifications.length > 0 && (
                  <div className="py-2 px-3 bg-slate-800/70 text-center">
                    <button 
                      onClick={markAllAsRead}
                      className="text-sm text-rose-400 hover:text-rose-300"
                    >
                      Mark all as read
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* User Menu */}
          <div className="flex items-center">
            <span className="mr-4 text-sm text-slate-200">{currentUser.name || currentUser.email}</span>
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="rounded-full bg-red-500/90 px-3 py-1 text-white text-sm font-semibold hover:bg-red-400 transition"
            >
              {isLoggingOut ? "Logging out..." : "Logout"}
            </button>
          </div>
        </div>
        
        {/* Mobile Menu Button */}
        <button 
          onClick={toggleMobileMenu} 
          aria-label={showMobileMenu ? 'Close menu' : 'Open menu'}
          className="md:hidden focus:outline-none"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showMobileMenu ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
          </svg>
        </button>
      </div>
      
      {/* Mobile Menu */}
      {showMobileMenu && (
        <div className="md:hidden mt-2 pt-2 pb-4 border-t border-blue-700">
          {isAdmin ? (
            <>
              <Link to="/admin" className="block px-3 py-2 hover:bg-blue-700 transition">
                Dashboard
              </Link>
              <Link to="/admin/create-task" className="block px-3 py-2 hover:bg-blue-700 transition">
                Create Task
              </Link>
              <Link to="/admin/developer-progress" className="block px-3 py-2 hover:bg-blue-700 transition">
                Developer Progress
              </Link>
              <Link to="/admin/reports" className="block px-3 py-2 hover:bg-blue-700 transition">
                Reports
              </Link>
              <Link to="/github" className="block px-3 py-2 hover:bg-blue-700 transition">
                GitHub
              </Link>
            </>
          ) : (
            <>
              <Link to="/BasicDashboard" className="block px-3 py-2 hover:bg-blue-700 transition">
                Dashboard
              </Link>
              <Link to="/tasks" className="block px-3 py-2 hover:bg-blue-700 transition">
                Tasks
              </Link>
              {canCreateTasks && (
                <Link to="/admin/create-task" className="block px-3 py-2 hover:bg-blue-700 transition">
                  Create Task
                </Link>
              )}
              <Link to="/github" className="block px-3 py-2 hover:bg-blue-700 transition">
                GitHub
              </Link>
            </>
          )}
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="block w-full text-left px-3 py-2 hover:bg-blue-700 transition"
          >
            {isLoggingOut ? "Logging out..." : "Logout"}
          </button>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
