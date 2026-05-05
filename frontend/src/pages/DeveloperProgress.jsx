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
    <div className="container mx-auto p-6 bg-slate-950 min-h-screen text-slate-100">
      <h1 className="text-2xl font-bold mb-6 text-slate-100">Developer Progress</h1>
      
      {/* Filter Controls */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button 
          onClick={() => setFilter('all')} 
          className={`px-4 py-2 rounded-full ${filter === 'all' 
            ? 'bg-rose-500/90 text-white' 
            : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 border border-slate-700/70'}`}
        >
          All Developers
        </button>
        <button 
          onClick={() => setFilter('active')} 
          className={`px-4 py-2 rounded-full ${filter === 'active' 
            ? 'bg-rose-500/90 text-white' 
            : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 border border-slate-700/70'}`}
        >
          With Active Tasks
        </button>
        <button 
          onClick={() => setFilter('completed')} 
          className={`px-4 py-2 rounded-full ${filter === 'completed' 
            ? 'bg-rose-500/90 text-white' 
            : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 border border-slate-700/70'}`}
        >
          With Completed Tasks
        </button>
      </div>
      
      {filteredDevelopers.length === 0 ? (
        <div className="bg-slate-900/70 rounded-lg border border-slate-800/70 shadow p-6 text-center text-slate-400">
          No developers match the selected filter
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDevelopers.map(developer => (
            <div key={developer.id} className="bg-slate-900/70 border border-slate-800/70 rounded-2xl overflow-hidden">
              {/* Developer Header */}
              <div className="bg-gradient-to-r from-rose-500/80 to-rose-600/80 text-white p-4">
                <h2 className="font-semibold text-lg">{developer.name}</h2>
                <p className="text-sm opacity-90">{developer.role || 'Team Member'}</p>
              </div>
              
              {/* Developer Stats */}
              <div className="p-4">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/70">
                    <p className="text-xs text-slate-400">Assigned Tasks</p>
                    <p className="text-2xl font-bold text-slate-100">{developer.total_tasks || 0}</p>
                  </div>
                  <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/70">
                    <p className="text-xs text-slate-400">Completed</p>
                    <p className="text-2xl font-bold text-emerald-400">{developer.completed_tasks || 0}</p>
                  </div>
                </div>
                
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-300">Overall Progress</span>
                    <span className="text-slate-300">
                      {Math.round((developer.completed_tasks / (developer.total_tasks || 1)) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-800/50 rounded-full h-2.5 border border-slate-700/70">
                    <div 
                      className="bg-rose-500 h-2.5 rounded-full" 
                      style={{ width: `${Math.round((developer.completed_tasks / (developer.total_tasks || 1)) * 100)}%` }}
                    ></div>
                  </div>
                </div>
                
                {/* Recent Tasks */}
                {developer.recent_tasks && developer.recent_tasks.length > 0 && (
                  <>
                    <h3 className="font-semibold text-sm text-slate-300 mb-2">Recent Tasks</h3>
                    <div className="space-y-2">
                      {developer.recent_tasks.slice(0, 3).map(task => (
                        <Link 
                          to={`/tasks/${task.id}`}
                          key={task.id} 
                          className="block text-sm p-2 border border-slate-700/70 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 text-slate-300"
                        >
                          <div className="flex justify-between">
                            <span className="font-medium truncate text-slate-100">{task.title}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              task.status === 'completed' ? 'bg-emerald-500/20 text-emerald-300' : 
                              task.status === 'in_progress' ? 'bg-sky-500/20 text-sky-300' : 
                              'bg-slate-700/50 text-slate-300'
                            }`}>
                              {task.status.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="w-full bg-slate-800/50 rounded-full h-1.5 mt-1">
                            <div 
                              className={`h-1.5 rounded-full ${
                                task.progress >= 100 ? 'bg-emerald-500' :
                                task.progress > 0 ? 'bg-rose-500' : 'bg-slate-700'
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
                    className="text-rose-400 hover:text-rose-300 text-sm"
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