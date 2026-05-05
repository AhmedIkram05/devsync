import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const ReportTable = ({ data = [], type }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  const totalPages = Math.ceil(data.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedData = data.slice(startIndex, startIndex + itemsPerPage);
  
  // Different column configurations based on report type
  const getHeaders = () => {
    switch(type) {
      case 'tasks':
        return ['Task', 'Status', 'Assignee', 'Progress', 'Deadline', 'Actions'];
      case 'github':
        return ['Repository', 'Issues', 'PRs', 'Commits', 'Last Updated', 'Actions'];
      case 'developers':
        return ['Developer', 'Tasks', 'Completed', 'Avg. Progress', 'Due Soon', 'Actions'];
      default:
        return [];
    }
  };
  
  // Renders the appropriate cell content based on report type and column
  const renderCell = (item, column) => {
    if (type === 'tasks') {
      switch(column) {
        case 'Task':
          return (
            <div>
              <div className="text-sm font-medium text-slate-100">{item.title}</div>
              <div className="text-xs text-slate-400">{item.project_name}</div>
            </div>
          );
        case 'Status':
          return (
            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
              item.status === 'completed' ? 'bg-emerald-500/20 text-emerald-300' :
              item.status === 'in_progress' ? 'bg-sky-500/20 text-sky-300' :
              'bg-slate-700/50 text-slate-300'
            }`}>
              {item.status === 'in_progress' ? 'In Progress' : 
              item.status === 'todo' ? 'To Do' :
              item.status === 'review' ? 'Review' :
              item.status === 'backlog' ? 'Backlog' :
              item.status.charAt(0).toUpperCase() + item.status.slice(1)}
            </span>
          );
        case 'Assignee':
          return item.assignee_name || 'Unassigned';
        case 'Progress':
          return (
            <div className="w-full bg-slate-800/50 rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${
                  item.progress >= 100 ? 'bg-emerald-500' : 
                  item.progress >= 50 ? 'bg-rose-500' : 
                  item.progress > 0 ? 'bg-amber-500' : 
                  'bg-slate-700'
                }`}
                style={{ width: `${item.progress || 0}%` }}
              ></div>
            </div>
          );
        case 'Deadline':
          return formatDate(item.deadline);
        case 'Actions':
          return (
            <Link 
              to={`/TaskDetailUser/${item.id}`}
              className="text-rose-400 hover:text-rose-300"
            >
              View
            </Link>
          );
        default:
          return '';
      }
    } else if (type === 'github') {
      switch(column) {
        case 'Repository':
          return (
            <div>
              <div className="text-sm font-medium text-slate-100">{item.name}</div>
              <div className="text-xs text-slate-400">{item.owner}</div>
            </div>
          );
        case 'Issues':
          return item.open_issues || 0;
        case 'PRs':
          return item.open_prs || 0;
        case 'Commits':
          return item.recent_commits || 0;
        case 'Last Updated':
          return formatDate(item.last_updated);
        case 'Actions':
          return (
            <a 
              href={item.html_url} 
              target="_blank"
              rel="noopener noreferrer"
              className="text-rose-400 hover:text-rose-300"
            >
              View on GitHub
            </a>
          );
        default:
          return '';
      }
    } else if (type === 'developers') {
      switch(column) {
        case 'Developer':
          return (
            <div>
              <div className="text-sm font-medium text-slate-100">{item.name}</div>
              <div className="text-xs text-slate-400">{item.email}</div>
            </div>
          );
        case 'Tasks':
          return item.total_tasks || 0;
        case 'Completed':
          return item.completed_tasks || 0;
        case 'Avg. Progress':
          return `${item.avg_progress || 0}%`;
        case 'Due Soon':
          return item.due_soon || 0;
        case 'Actions':
          return (
            <Link 
              to={`/tasks?assignee=${item.id}`}
              className="text-rose-400 hover:text-rose-300"
            >
              View Tasks
            </Link>
          );
        default:
          return '';
      }
    }
    
    return '';
  };
  
  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString();
    } catch (e) {
      return 'Invalid date';
    }
  };
  
  // Handle pagination
  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };
  
  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };
  
  const headers = getHeaders();
  
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-6 text-slate-400">
        No data available for this report
      </div>
    );
  }
  
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-700/70">
          <thead className="bg-slate-800/60">
            <tr>
              {headers.map((header, index) => (
                <th 
                  key={index} 
                  className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-slate-900/40 divide-y divide-slate-700/70">
            {paginatedData.map((item, itemIndex) => (
              <tr key={itemIndex}>
                {headers.map((header, headerIndex) => (
                  <td key={headerIndex} className="px-6 py-4 whitespace-nowrap">
                    {renderCell(item, header)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="py-3 flex items-center justify-between border-t border-slate-800/70 px-4">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={handlePreviousPage}
              disabled={currentPage === 1}
              className={`relative inline-flex items-center px-4 py-2 border border-slate-700/70 text-sm font-medium rounded-full ${
                currentPage === 1
                  ? 'bg-slate-800/50 text-slate-500 cursor-not-allowed'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80'
              }`}
            >
              Previous
            </button>
            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              className={`ml-3 relative inline-flex items-center px-4 py-2 border border-slate-700/70 text-sm font-medium rounded-full ${
                currentPage === totalPages
                  ? 'bg-slate-800/50 text-slate-500 cursor-not-allowed'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80'
              }`}
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                <span className="font-medium">
                  {Math.min(startIndex + itemsPerPage, data.length)}
                </span>{' '}
                of <span className="font-medium">{data.length}</span> results
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                <button
                  onClick={handlePreviousPage}
                  disabled={currentPage === 1}
                  className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium ${
                    currentPage === 1
                      ? 'text-gray-300 cursor-not-allowed'
                      : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <span className="sr-only">Previous</span>
                  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </button>
                
                {/* Page Numbers */}
                {[...Array(totalPages)].map((_, i) => {
                  const pageNumber = i + 1;
                  const isCurrentPage = pageNumber === currentPage;
                  
                  // Only show a subset of pages if there are many
                  if (totalPages > 7) {
                    if (
                      pageNumber === 1 ||
                      pageNumber === totalPages ||
                      (pageNumber >= currentPage - 1 && pageNumber <= currentPage + 1)
                    ) {
                      return (
                        <button
                          key={i}
                          onClick={() => setCurrentPage(pageNumber)}
                          className={`relative inline-flex items-center px-4 py-2 border ${
                            isCurrentPage
                              ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                              : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                          } text-sm font-medium`}
                        >
                          {pageNumber}
                        </button>
                      );
                    } else if (
                      pageNumber === currentPage - 2 ||
                      pageNumber === currentPage + 2
                    ) {
                      return (
                        <span
                          key={i}
                          className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700"
                        >
                          ...
                        </span>
                      );
                    }
                    return null;
                  }
                  
                  // Show all pages if there are few
                  return (
                    <button
                      key={i}
                      onClick={() => setCurrentPage(pageNumber)}
                      className={`relative inline-flex items-center px-4 py-2 border ${
                        isCurrentPage
                          ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                          : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                      } text-sm font-medium`}
                    >
                      {pageNumber}
                    </button>
                  );
                })}
                
                <button
                  onClick={handleNextPage}
                  disabled={currentPage === totalPages}
                  className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium ${
                    currentPage === totalPages
                      ? 'text-gray-300 cursor-not-allowed'
                      : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <span className="sr-only">Next</span>
                  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportTable;