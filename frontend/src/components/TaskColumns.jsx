import React from 'react';
import { Link } from 'react-router-dom';

function TaskColumns({ tasks = [] }) {
  // Ensure tasks is an array
  const tasksArray = Array.isArray(tasks) ? tasks : [];
  
  // Group tasks by their status
  const todoTasks = tasksArray.filter(task => task?.status === 'todo' || task?.status === 'backlog') || [];
  const inProgressTasks = tasksArray.filter(task => task?.status === 'in_progress') || [];
  const completedTasks = tasksArray.filter(task => task?.status === 'completed') || [];
  
  // Function to display the date in a readable format
  const formatDate = (dateString) => {
    if (!dateString) return 'No date set';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (error) {
      return 'Invalid date';
    }
  };
  
  // Function to determine if a task is overdue
  const isTaskOverdue = (task) => {
    if (!task?.deadline) return false;
    
    try {
      const deadline = new Date(task.deadline);
      const today = new Date();
      return deadline < today && task?.status !== 'completed';
    } catch (error) {
      return false;
    }
  };

  // Function to render a single task card
  const renderTaskCard = (task, borderColor) => {
    // Ensure task has an id
    const taskId = task?.id || `task-${Math.random().toString(36).substr(2, 9)}`;
    const taskTitle = task?.title || 'Untitled Task';
    const taskPriority = task?.priority || 'medium';
    const taskProgress = task?.progress || 0;
    
    return (
      <Link 
        to={`/TaskDetailUser/${taskId}`} 
        key={taskId} 
        className={`block p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800/70 border-l-4 ${borderColor}`}
      >
        <h4 className="font-medium text-slate-100">{taskTitle}</h4>
        <div className="flex justify-between items-center mt-2 text-sm">
          <span className={`${isTaskOverdue(task) ? 'text-rose-400 font-semibold' : 'text-slate-400'}`}>
            Due: {formatDate(task?.deadline)}
          </span>
          
          {task?.status === 'completed' ? (
            <span className="px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs">
              ✓ Done
            </span>
          ) : task?.status === 'in_progress' ? (
            <div className="flex items-center">
              <div className="w-20 bg-slate-700/70 rounded-full h-2.5 mr-2">
                <div 
                  className="bg-rose-500 h-2.5 rounded-full" 
                  style={{ width: `${taskProgress}%` }}
                ></div>
              </div>
              <span className="text-xs text-slate-300">{taskProgress}%</span>
            </div>
          ) : (
            <span className="px-2 py-1 rounded-full bg-slate-700/70 text-slate-300 text-xs">
                {taskPriority === 'high' ? 'High' : 
                 taskPriority === 'medium' ? 'Medium' : 'Low'}
              </span>
          )}
        </div>
      </Link>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
      {/* To Do Column */}
      <div className="bg-slate-900/70 p-4 rounded-2xl shadow border border-slate-800/70">
        <h3 className="font-semibold mb-4 text-slate-200 flex items-center">
          <span className="w-3 h-3 bg-slate-600 rounded-full mr-2"></span>
          To Do ({todoTasks.length})
        </h3>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {todoTasks.length > 0 ? (
            todoTasks.map(task => renderTaskCard(task, 'border-slate-600'))
          ) : (
            <div className="text-center py-6 text-slate-400">No tasks</div>
          )}
        </div>
      </div>
      
      {/* In Progress Column */}
      <div className="bg-slate-900/70 p-4 rounded-2xl shadow border border-slate-800/70">
        <h3 className="font-semibold mb-4 text-slate-200 flex items-center">
          <span className="w-3 h-3 bg-amber-400 rounded-full mr-2"></span>
          In Progress ({inProgressTasks.length})
        </h3>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {inProgressTasks.length > 0 ? (
            inProgressTasks.map(task => renderTaskCard(task, 'border-amber-400'))
          ) : (
            <div className="text-center py-6 text-slate-400">No tasks in progress</div>
          )}
        </div>
      </div>
      
      {/* Completed Column */}
      <div className="bg-slate-900/70 p-4 rounded-2xl shadow border border-slate-800/70">
        <h3 className="font-semibold mb-4 text-slate-200 flex items-center">
          <span className="w-3 h-3 bg-emerald-500 rounded-full mr-2"></span>
          Completed ({completedTasks.length})
        </h3>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {completedTasks.length > 0 ? (
            completedTasks.map(task => renderTaskCard({ ...task, status: 'completed' }, 'border-emerald-500'))
          ) : (
            <div className="text-center py-6 text-slate-400">No completed tasks</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TaskColumns;