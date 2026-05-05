import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { dashboardService } from '../services/utils/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../context/AuthContext';

// StatCard component for dashboard metrics
const StatCard = ({ title, value, change, icon, color, currentTimeRange }) => {
  const getColorClasses = (colorName) => {
    switch (colorName) {
      case 'primary':
        return 'bg-rose-500/10 text-rose-200 border border-rose-400/20';
      case 'secondary':
        return 'bg-sky-500/10 text-sky-200 border border-sky-400/20';
      case 'success':
        return 'bg-emerald-500/10 text-emerald-200 border border-emerald-400/20';
      case 'warning':
        return 'bg-amber-500/10 text-amber-200 border border-amber-400/20';
      case 'error':
        return 'bg-rose-500/10 text-rose-200 border border-rose-400/20';
      default:
        return 'bg-slate-900/60 text-slate-200 border border-slate-800/70';
    }
  };

  return (
    <div className="bg-slate-900/70 overflow-hidden border border-slate-800/70 rounded-2xl">
      <div className="p-5">
        <div className="flex items-center">
          <div className={`flex-shrink-0 rounded-xl p-3 ${getColorClasses(color)}`}>
            {icon}
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-slate-400 truncate">{title}</dt>
              <dd>
                <div className="text-lg font-medium text-slate-100">{value}</div>
              </dd>
              {change !== undefined && (
                <dd className="flex items-center text-xs mt-1">
                  {change > 0 ? (
                    <span className="flex items-center text-emerald-300">
                      <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                      </svg>
                      {change}% increase
                    </span>
                  ) : change < 0 ? (
                    <span className="flex items-center text-rose-300">
                      <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                      {Math.abs(change)}% decrease
                    </span>
                  ) : (
                    <span className="text-slate-500">No change</span>
                  )}
                  <span className="ml-2 text-slate-500">since last {currentTimeRange}</span>
                </dd>
              )}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
};

const AdminDashboard = () => {
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState('week'); // 'week', 'month', 'quarter'
  const { currentUser } = useAuth();

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      console.log("Fetching dashboard data with token:", JSON.stringify(currentUser?.token).substring(0, 20) + "...");
      console.log("Fetching dashboard stats...");
      const data = await dashboardService.getAdminDashboardStats(timeRange);
      setDashboardData(data);
      setError(null);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [currentUser, timeRange]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleRefresh = () => {
    fetchDashboardData();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Admin Dashboard</h1>
            <p className="mt-1 text-sm text-slate-400">
              Overview of projects, tasks, and team progress
            </p>
          </div>
          
          <div className="mt-4 md:mt-0 flex space-x-3">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="rounded-md border border-slate-700/70 bg-slate-900/80 text-slate-200 shadow-sm focus:border-rose-400 focus:ring-rose-400 text-sm"
            >
              <option value="week">Last 7 days</option>
              <option value="month">Last 30 days</option>
              <option value="quarter">Last 90 days</option>
            </select>
            
            <button
              onClick={handleRefresh}
              className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium text-white bg-rose-500/90 hover:bg-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <LoadingSpinner size="lg" />
          </div>
        ) : error ? (
          <div className="bg-rose-500/10 p-4 rounded-lg border border-rose-400/40 text-rose-200">
            <div className="flex">
              <svg className="h-5 w-5 text-rose-300 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>{error}</p>
            </div>
            <button 
              onClick={handleRefresh}
              className="mt-3 text-sm font-medium text-rose-300 hover:text-rose-200"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard 
                title="Total Projects" 
                value={dashboardData?.projects?.total || 0}
                change={dashboardData?.projects?.change}
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                }
                color="primary"
                currentTimeRange={timeRange}
              />
              
              <StatCard 
                title="Active Tasks" 
                value={dashboardData?.tasks?.active || 0}
                change={dashboardData?.tasks?.activeChange}
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                }
                color="secondary"
                currentTimeRange={timeRange}
              />
              
              <StatCard 
                title="Completed Tasks" 
                value={dashboardData?.tasks?.completed || 0}
                change={dashboardData?.tasks?.completedChange}
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                }
                color="success"
                currentTimeRange={timeRange}
              />
              
              <StatCard 
                title="Team Members" 
                value={dashboardData?.users?.total || 0}
                change={dashboardData?.users?.change}
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                }
                color="warning"
                currentTimeRange={timeRange}
              />
            </div>
            
            {/* Project & Task Overview */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Recent projects */}
              <div className="lg:col-span-1 bg-slate-900/70 rounded-2xl border border-slate-800/70 overflow-hidden">
                <div className="px-4 py-5 sm:px-6 border-b border-slate-800/70 flex justify-between items-center">
                  <h3 className="text-lg leading-6 font-medium text-slate-100">Recent Projects</h3>
                  <Link to="/admin/projects" className="text-sm text-rose-300 hover:text-rose-200">
                    View all
                  </Link>
                </div>
                <div className="bg-slate-900/70 overflow-hidden">
                  <ul className="divide-y divide-slate-800/70">
                    {dashboardData?.recentProjects?.length > 0 ? (
                      dashboardData.recentProjects.map((project) => (
                        <li key={project.id} className="px-4 py-4 sm:px-6 hover:bg-slate-900/90">
                          <Link to={`/projects/${project.id}`} className="block">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium text-rose-200 truncate">{project.name}</p>
                              <div className="ml-2 flex-shrink-0 flex">
                                {project.status === 'active' && (
                                  <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-emerald-500/10 text-emerald-200">
                                    Active
                                  </p>
                                )}
                                {project.status === 'completed' && (
                                  <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-sky-500/10 text-sky-200">
                                    Completed
                                  </p>
                                )}
                                {(project.status === 'on-hold' || project.status === 'on_hold') && (
                                  <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-amber-500/10 text-amber-200">
                                    On Hold
                                  </p>
                                )}
                                {project.status === 'cancelled' && (
                                  <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-rose-500/10 text-rose-200">
                                    Cancelled
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="mt-2 flex justify-between">
                              <div className="sm:flex">
                                <p className="flex items-center text-sm text-slate-400">
                                  <svg className="flex-shrink-0 mr-1.5 h-5 w-5 text-slate-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                                  </svg>
                                  {new Date(project.created_at).toLocaleDateString()}
                                </p>
                                <p className="mt-2 flex items-center text-sm text-slate-400">
                                  <svg className="flex-shrink-0 mr-1.5 h-5 w-5 text-slate-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                  </svg>
                                  {project.task_count} Tasks
                                </p>
                              </div>
                            </div>
                          </Link>
                        </li>
                      ))
                    ) : (
                      <li className="px-4 py-4 sm:px-6 text-sm text-slate-500">
                        No recent projects found.
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;