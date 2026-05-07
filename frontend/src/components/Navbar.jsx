import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationContext";
import { useState, useEffect } from "react";
import Notifications from "./Notifications";

const Navbar = () => {
  const { currentUser, logout, is } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead, refreshNotifications } = useNotifications();
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
  
  const isAdmin = is('admin');
  const isTeamLead = is('team_lead');
  const canCreateTasks = isAdmin || isTeamLead;

  return (
    <header className="bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 font-['Space_Grotesk']">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 md:px-10">
        <Link to="/" className="flex-shrink-0 mr-8 text-lg font-semibold tracking-wide text-white hover:text-slate-300 transition">
          DevSync
        </Link>
        
        {/* Desktop Navigation - Centered */}
        <nav className="hidden lg:flex flex-1 justify-center items-center gap-5 text-[13px] font-medium text-slate-300 px-4">
          {isAdmin ? (
            <>
              <Link to="/admin" className="transition hover:text-white">Dashboard</Link>
              <Link to="/tasks" className="transition hover:text-white">Tasks</Link>
              <Link to="/admin/projects" className="transition hover:text-white">Projects</Link>
              <Link to="/admin/create-task" className="transition hover:text-white">Create Task</Link>
              <Link to="/admin/developer-progress" className="transition hover:text-white text-nowrap">Developer Progress</Link>
              <Link to="/admin/reports" className="transition hover:text-white">Reports</Link>
              <div className="relative group/dropdown">
                <button className="transition hover:text-white flex items-center gap-1">
                  System
                  <svg className="h-3 w-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                </button>
                <div className="absolute top-full left-0 mt-2 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl opacity-0 invisible group-hover/dropdown:opacity-100 group-hover/dropdown:visible transition-all duration-200 z-[100] py-2">
                  <Link to="/admin/users" className="block px-4 py-2 hover:bg-slate-800 transition text-slate-300 hover:text-white">Users</Link>
                  <Link to="/admin/settings" className="block px-4 py-2 hover:bg-slate-800 transition text-slate-300 hover:text-white">Settings</Link>
                  <Link to="/admin/audit-logs" className="block px-4 py-2 hover:bg-slate-800 transition text-slate-300 hover:text-white">Audit Logs</Link>
                </div>
              </div>
              <Link to="/github" className="transition hover:text-white">GitHub</Link>
            </>
          ) : isTeamLead ? (
            <>
              <Link to="/admin" className="transition hover:text-white">Dashboard</Link>
              <Link to="/tasks" className="transition hover:text-white">Tasks</Link>
              <Link to="/admin/projects" className="transition hover:text-white">Projects</Link>
              <Link to="/admin/create-task" className="transition hover:text-white text-nowrap">Create Task</Link>
              <Link to="/admin/developer-progress" className="transition hover:text-white text-nowrap">Developer Progress</Link>
              <Link to="/admin/reports" className="transition hover:text-white">Reports</Link>
              <Link to="/github" className="transition hover:text-white">GitHub</Link>
            </>
          ) : (
            <>
              <Link to="/BasicDashboard" className="transition hover:text-white">Dashboard</Link>
              <Link to="/tasks" className="transition hover:text-white">Tasks</Link>
              <Link to="/github" className="transition hover:text-white">GitHub</Link>
            </>
          )}
        </nav>
        
        <div className="flex-shrink-0 flex items-center gap-6">
          {/* Notification Bell */}
          <div className="relative">
            <button 
              onClick={toggleNotifications}
              aria-label="Notifications"
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all focus:outline-none relative"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-[10px] font-bold text-white rounded-full flex items-center justify-center border border-slate-900 shadow-[0_0_8px_rgba(239,68,68,0.5)]">
                  {unreadCount}
                </span>
              )}
            </button>
            
            {showNotifications && (
              <div className="absolute right-0 mt-3 w-80 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-[100]">
                <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                  <h3 className="text-sm font-bold text-white tracking-tight">Notifications</h3>
                  <button 
                    onClick={markAllAsRead}
                    className="text-[10px] font-bold text-rose-400 hover:text-rose-300 uppercase tracking-wider transition"
                  >
                    Mark all as read
                  </button>
                </div>
                <Notifications 
                  notifications={notifications} 
                  onClose={() => setShowNotifications(false)}
                  onMarkRead={markAsRead}
                  onMarkAllRead={markAllAsRead}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 text-sm">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-semibold text-white tracking-tight">{currentUser.name}</div>
              <div className="text-[10px] text-slate-400 uppercase tracking-widest opacity-60 font-medium">{currentUser.role?.replace('_', ' ')}</div>
            </div>
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="rounded-full bg-red-500 px-4 py-2 font-semibold text-white transition hover:bg-red-400 disabled:opacity-50"
            >
              {isLoggingOut ? "Logging out..." : "Logout"}
            </button>
          </div>
        </div>

        {/* Mobile Menu Button */}
        <button 
          onClick={toggleMobileMenu}
          aria-label={showMobileMenu ? "Close menu" : "Open menu"}
          className="lg:hidden p-2 text-slate-400 hover:text-white transition focus:outline-none"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {showMobileMenu ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile Menu */}
      {showMobileMenu && (
        <div className="lg:hidden absolute top-full left-0 right-0 bg-slate-900 border-b border-slate-800 py-6 px-6 space-y-4 shadow-xl animate-in slide-in-from-top-4 duration-200 z-[100]">
          <div className="grid grid-cols-2 gap-4">
            {isAdmin ? (
              <>
                <Link to="/admin" className="text-slate-300 py-2 hover:text-white transition">Dashboard</Link>
                <Link to="/admin/create-task" className="text-slate-300 py-2 hover:text-white transition">Create Task</Link>
                <Link to="/admin/developer-progress" className="text-slate-300 py-2 hover:text-white transition">Developer Progress</Link>
                <Link to="/admin/reports" className="text-slate-300 py-2 hover:text-white transition">Reports</Link>
                <Link to="/admin/users" className="text-slate-300 py-2 hover:text-white transition">Users</Link>
                <Link to="/admin/settings" className="text-slate-300 py-2 hover:text-white transition">Settings</Link>
                <Link to="/admin/audit-logs" className="text-slate-300 py-2 hover:text-white transition">Audit Logs</Link>
                <Link to="/github" className="text-slate-300 py-2 hover:text-white transition">GitHub</Link>
              </>
            ) : isTeamLead ? (
              <>
                <Link to="/admin" className="text-slate-300 py-2 hover:text-white transition">Dashboard</Link>
                <Link to="/tasks" className="text-slate-300 py-2 hover:text-white transition">Tasks</Link>
                {canCreateTasks && (
                  <Link to="/admin/create-task" className="text-slate-300 py-2 hover:text-white transition">Create Task</Link>
                )}
                <Link to="/admin/reports" className="text-slate-300 py-2 hover:text-white transition">Reports</Link>
                <Link to="/github" className="text-slate-300 py-2 hover:text-white transition">GitHub</Link>
              </>
            ) : (
              <>
                <Link to="/BasicDashboard" className="text-slate-300 py-2 hover:text-white transition">Dashboard</Link>
                <Link to="/tasks" className="text-slate-300 py-2 hover:text-white transition">Tasks</Link>
                <Link to="/github" className="text-slate-300 py-2 hover:text-white transition">GitHub</Link>
              </>
            )}
          </div>
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300">
                {currentUser.name?.charAt(0)}
              </div>
              <div className="text-sm font-medium text-white">{currentUser.name}</div>
            </div>
            <button
              onClick={handleLogout}
              className="text-sm font-semibold text-rose-400 hover:text-rose-300 transition"
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
