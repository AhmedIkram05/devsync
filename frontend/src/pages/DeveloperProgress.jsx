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
    <div className="min-h-screen bg-slate-950 text-slate-100 font-['Space_Grotesk']">
      <div className="max-w-6xl mx-auto px-6 py-10 md:px-10">
        <h1 className="text-2xl font-bold mb-10 text-slate-100">Developer Progress</h1>
        
        {/* Filter Controls */}
        <div className="mb-10 flex flex-wrap gap-2">
          <button 
            onClick={() => setFilter('all')} 
            className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${filter === 'all' 
              ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' 
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'}`}
          >
            All Developers
          </button>
          <button 
            onClick={() => setFilter('active')} 
            className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${filter === 'active' 
              ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' 
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'}`}
          >
            With Active Tasks
          </button>
          <button 
            onClick={() => setFilter('completed')} 
            className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${filter === 'completed' 
              ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' 
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'}`}
          >
            With Completed Tasks
          </button>
        </div>
        
        {filteredDevelopers.length === 0 ? (
          <div className="bg-slate-900/70 rounded-2xl border border-slate-800/70 shadow p-10 text-center text-slate-500 font-medium backdrop-blur-sm">
            No developers match the selected filter
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDevelopers.map(developer => (
              <div key={developer.id} className="bg-slate-900/70 border border-slate-800/70 rounded-2xl overflow-hidden shadow-md backdrop-blur-sm">
                {/* Developer Header */}
                <div className="bg-gradient-to-r from-rose-500/80 to-rose-600/80 text-white p-5">
                  <h2 className="font-bold text-lg tracking-tight">{developer.name}</h2>
                  <p className="text-xs opacity-90 uppercase font-semibold tracking-wider">{developer.role || 'Team Member'}</p>
                </div>
                
                {/* Developer Stats */}
                <div className="p-6">
                  <div className="grid grid-cols-2 gap-4 mb-5">
                    <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/50">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Tasks</p>
                      <p className="text-2xl font-bold text-slate-100">{developer.total_tasks || 0}</p>
                    </div>
                    <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/50">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Completed</p>
                      <p className="text-2xl font-bold text-emerald-400">{developer.completed_tasks || 0}</p>
                    </div>
                  </div>
                  
                  <div className="mb-6">
                    <div className="flex justify-between text-xs font-bold uppercase tracking-wider mb-2 text-slate-400">
                      <span>Overall Progress</span>
                      <span className="text-slate-100">
                        {Math.round((developer.completed_tasks / (developer.total_tasks || 1)) * 100)}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-800/50 rounded-full h-2 border border-slate-700/50 overflow-hidden">
                      <div 
                        className="bg-rose-500 h-2 rounded-full transition-all duration-500" 
                        style={{ width: `${Math.round((developer.completed_tasks / (developer.total_tasks || 1)) * 100)}%` }}
                      ></div>
                    </div>
                  </div>
                  
                  {/* Recent Tasks */}
                  {developer.recent_tasks && developer.recent_tasks.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Recent Activity</h3>
                      {developer.recent_tasks.slice(0, 3).map(task => (
                        <Link 
                          to={`/tasks/${task.id}`}
                          key={task.id} 
                          className="group block text-sm p-3 border border-slate-800/50 rounded-xl bg-slate-800/20 hover:bg-slate-800/40 hover:border-slate-700/50 transition-all"
                        >
                          <div className="flex justify-between items-start gap-2">
                            <span className="font-semibold text-slate-200 group-hover:text-white transition-colors truncate">{task.title}</span>
                            <span className={`text-[9px] font-bold uppercase tracking-tighter px-2 py-0.5 rounded-md shrink-0 ${
                              task.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' : 
                              task.status === 'in_progress' ? 'bg-sky-500/10 text-sky-400' : 
                              'bg-slate-800 text-slate-500'
                            }`}>
                              {task.status.replace('_', ' ')}
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                  
                  {/* View All Tasks Button */}
                  <div className="mt-6 pt-5 border-t border-slate-800/50 text-center">
                    <Link 
                      to={`/tasks?assignee=${developer.id}`}
                      className="text-xs font-bold text-rose-400 hover:text-rose-300 uppercase tracking-widest transition"
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
    </div>
  );
};

export default DeveloperProgress;