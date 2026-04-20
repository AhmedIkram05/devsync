import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { dashboardService } from '../services/utils/api';
import LoadingSpinner from '../components/LoadingSpinner';

const DeveloperProgress = () => {
  const [developers, setDevelopers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all'); // all, active, completed

  useEffect(() => {
    const fetchDevelopersProgress = async () => {
      try {
        setLoading(true);
        
        // Fetch developers with their tasks and progress stats
        const developersData = await dashboardService.getDeveloperProgressStats();
        setDevelopers(developersData || []);
        
      } catch (err) {
        console.error('Failed to fetch developer progress:', err);
        setError('Failed to load developer progress data. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchDevelopersProgress();
  }, []);

  // Filter developers based on selected filter
  const filteredDevelopers = developers.filter(developer => {
    if (filter === 'all') return true;
    if (filter === 'active') return developer.active_tasks > 0;
    if (filter === 'completed') return developer.completed_tasks > 0;
    return true;
  });

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-screen items-center justify-center p-6">
        <div className="text-xl text-red-600 mb-4">{error}</div>
        <button 
          onClick={() => window.location.reload()} 
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Developer Progress</h1>
      
      {/* Filter Controls */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button 
          onClick={() => setFilter('all')} 
          className={`px-4 py-2 rounded ${filter === 'all' 
            ? 'bg-blue-600 text-white' 
            : 'bg-gray-200 hover:bg-gray-300'}`}
        >
          All Developers
        </button>
        <button 
          onClick={() => setFilter('active')} 
          className={`px-4 py-2 rounded ${filter === 'active' 
            ? 'bg-blue-600 text-white' 
            : 'bg-gray-200 hover:bg-gray-300'}`}
        >
          With Active Tasks
        </button>
        <button 
          onClick={() => setFilter('completed')} 
          className={`px-4 py-2 rounded ${filter === 'completed' 
            ? 'bg-blue-600 text-white' 
            : 'bg-gray-200 hover:bg-gray-300'}`}
        >
          With Completed Tasks
        </button>
      </div>
      
      {filteredDevelopers.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
          No developers match the selected filter
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDevelopers.map(developer => (
            <div key={developer.id} className="bg-white rounded-lg shadow overflow-hidden">
              {/* Developer Header */}
              <div className="bg-blue-600 text-white p-4">
                <h2 className="font-semibold text-lg">{developer.name}</h2>
                <p className="text-sm opacity-80">{developer.role || 'Team Member'}</p>
              </div>
              
              {/* Developer Stats */}
              <div className="p-4">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-blue-50 p-3 rounded">
                    <p className="text-xs text-blue-700">Assigned Tasks</p>
                    <p className="text-2xl font-bold">{developer.total_tasks || 0}</p>
                  </div>
                  <div className="bg-green-50 p-3 rounded">
                    <p className="text-xs text-green-700">Completed</p>
                    <p className="text-2xl font-bold">{developer.completed_tasks || 0}</p>
                  </div>
                </div>
                
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Overall Progress</span>
                    <span>
                      {Math.round((developer.completed_tasks / (developer.total_tasks || 1)) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                      className="bg-blue-600 h-2.5 rounded-full" 
                      style={{ width: `${Math.round((developer.completed_tasks / (developer.total_tasks || 1)) * 100)}%` }}
                    ></div>
                  </div>
                </div>
                
                {/* Recent Tasks */}
                {developer.recent_tasks && developer.recent_tasks.length > 0 && (
                  <>
                    <h3 className="font-semibold text-sm text-gray-600 mb-2">Recent Tasks</h3>
                    <div className="space-y-2">
                      {developer.recent_tasks.slice(0, 3).map(task => (
                        <Link 
                          to={`/tasks/${task.id}`}
                          key={task.id} 
                          className="block text-sm p-2 border rounded hover:bg-gray-50"
                        >
                          <div className="flex justify-between">
                            <span className="font-medium truncate">{task.title}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              task.status === 'completed' ? 'bg-green-100 text-green-800' : 
                              task.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' : 
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {task.status.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                            <div 
                              className={`h-1.5 rounded-full ${
                                task.progress >= 100 ? 'bg-green-500' :
                                task.progress > 0 ? 'bg-blue-500' : 'bg-gray-300'
                              }`}
                              style={{ width: `${task.progress || 0}%` }}
                            ></div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </>
                )}
                
                {/* View All Tasks Button */}
                <div className="mt-4 flex justify-center">
                  <Link 
                    to={`/tasks?assignee=${developer.id}`}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    View All Tasks
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DeveloperProgress;