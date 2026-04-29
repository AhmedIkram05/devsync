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
        return 'bg-primary-50 text-primary-700';
      case 'secondary':
        return 'bg-blue-50 text-blue-700';
      case 'success':
        return 'bg-green-50 text-green-700';
      case 'warning':
        return 'bg-yellow-50 text-yellow-700';
      case 'error':
        return 'bg-red-50 text-red-700';
      default:
        return 'bg-neutral-50 text-neutral-700';
    }
  };

  return (
    <div className="bg-white overflow-hidden shadow-card rounded-lg">
      <div className="p-5">
        <div className="flex items-center">
          <div className={`flex-shrink-0 rounded-md p-3 ${getColorClasses(color)}`}>
            {icon}
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-neutral-500 truncate">{title}</dt>
              <dd>
                <div className="text-lg font-medium text-neutral-900">{value}</div>
              </dd>
              {change !== undefined && (
                <dd className="flex items-center text-xs mt-1">
                  {change > 0 ? (
                    <span className="flex items-center text-green-600">
                      <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                      </svg>
                      {change}% increase
                    </span>
                  ) : change < 0 ? (
                    <span className="flex items-center text-red-600">
                      <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                      {Math.abs(change)}% decrease
                    </span>
                  ) : (
                    <span className="text-neutral-500">No change</span>
                  )}
                  <span className="ml-2 text-neutral-500">since last {currentTimeRange}</span>
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
    <div className="bg-neutral-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Admin Dashboard</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Overview of projects, tasks, and team progress
            </p>
          </div>
          
          <div className="mt-4 md:mt-0 flex space-x-3">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="rounded-md border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
            >
              <option value="week">Last 7 days</option>
              <option value="month">Last 30 days</option>
              <option value="quarter">Last 90 days</option>
            </select>
            
            <button
              onClick={handleRefresh}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
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
          <div className="bg-error-50 p-4 rounded-lg border border-error-300 text-error-800">
            <div className="flex">
              <svg className="h-5 w-5 text-error-400 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>{error}</p>
            </div>
            <button 
              onClick={handleRefresh}
              className="mt-3 text-sm font-medium text-error-600 hover:text-error-500"
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
              <div className="lg:col-span-1 bg-white rounded-lg shadow-card overflow-hidden">
                <div className="px-4 py-5 sm:px-6 border-b border-neutral-200 flex justify-between items-center">
                  <h3 className="text-lg leading-6 font-medium text-neutral-900">Recent Projects</h3>
                  <Link to="/admin/projects" className="text-sm text-primary-600 hover:text-primary-500">
                    View all
                  </Link>
                </div>
                <div className="bg-white shadow overflow-hidden">
                  <ul className="divide-y divide-neutral-200">
                    {dashboardData?.recentProjects?.length > 0 ? (
                      dashboardData.recentProjects.map((project) => (
                        <li key={project.id} className="px-4 py-4 sm:px-6 hover:bg-neutral-50">
                          <Link to={`/projects/${project.id}`} className="block">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium text-primary-700 truncate">{project.name}</p>
                              <div className="ml-2 flex-shrink-0 flex">
                                {project.status === 'active' && (
                                  <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                    Active
                                  </p>
                                )}
                                {project.status === 'completed' && (
                                  <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                                    Completed
                                  </p>
                                )}
                                {project.status === 'on-hold' && (
                                  <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                                    On Hold
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="mt-2 flex justify-between">
                              <div className="sm:flex">
                                <p className="flex items-center text-sm text-neutral-500">
                                  <svg className="flex-shrink-0 mr-1.5 h-5 w-5 text-neutral-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                                  </svg>
                                  {new Date(project.created_at).toLocaleDateString()}
                                </p>
                                <p className="mt-2 flex items-center text-sm text-neutral-500">
                                  <svg className="flex-shrink-0 mr-1.5 h-5 w-5 text-neutral-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
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
                      <li className="px-4 py-4 sm:px-6 text-sm text-neutral-500">
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