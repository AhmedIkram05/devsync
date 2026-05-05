import React from 'react';

const GitHubIssueCard = ({ issue, onLinkClick, linkedTaskId, isLinking = false }) => {
  // Format date to be more readable
  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // Determine issue status based on GitHub issue state and labels
  const getIssueStatus = () => {
    if (issue.state === 'closed') {
      return { text: 'Closed', className: 'bg-slate-700/50 text-slate-300' };
    }
    
    // Check for common status labels
    const labels = issue.labels || [];
    for (const label of labels) {
      const labelName = (label.name || '').toLowerCase();
      
      if (labelName.includes('bug')) {
        return { text: 'Bug', className: 'bg-rose-500/20 text-rose-300' };
      } else if (labelName.includes('feature')) {
        return { text: 'Feature', className: 'bg-emerald-500/20 text-emerald-300' };
      } else if (labelName.includes('enhancement')) {
        return { text: 'Enhancement', className: 'bg-sky-500/20 text-sky-300' };
      } else if (labelName.includes('help')) {
        return { text: 'Help Wanted', className: 'bg-purple-500/20 text-purple-300' };
      }
    }
    
    return { text: 'Open', className: 'bg-amber-500/20 text-amber-300' };
  };
  
  const issueStatus = getIssueStatus();

  return (
    <div className="bg-slate-900/70 border border-slate-800/70 rounded-lg hover:shadow-lg transition-shadow p-4">
      <div className="flex justify-between">
        <div>
          <div className="flex items-center mb-2">
            <svg className="h-4 w-4 mr-2 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <h3 className="font-medium">
              <a 
                href={issue.html_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-rose-400 hover:text-rose-300"
              >
                #{issue.number} {issue.title}
              </a>
            </h3>
          </div>
          <p className="text-sm text-slate-400 mb-2">
            Opened by <span className="font-medium text-slate-300">{issue.user?.login || 'Unknown'}</span> on {formatDate(issue.created_at)}
          </p>
        </div>
        <span className={`px-2 py-1 h-6 rounded-full text-xs ${issueStatus.className}`}>
          {issueStatus.text}
        </span>
      </div>
      
      {issue.body && (
        <div className="text-sm text-slate-300 mt-3 mb-3 line-clamp-2">
          {issue.body}
        </div>
      )}
      
      <div className="flex justify-between items-center mt-4">
        <div className="flex space-x-1">
          {issue.labels?.slice(0, 3).map(label => (
            <span 
              key={label.id || label.name} 
              className="px-2 py-1 rounded-full text-xs bg-sky-500/20 text-sky-300"
              title={label.description || label.name}
            >
              {label.name}
            </span>
          ))}
          {(issue.labels?.length > 3) && (
            <span className="px-2 py-1 rounded-full text-xs bg-slate-700/50 text-slate-300">
              +{issue.labels.length - 3} more
            </span>
          )}
        </div>
        
        {onLinkClick && !linkedTaskId && (
          <button
            onClick={() => onLinkClick(issue.id)}
            disabled={isLinking}
            className={`px-3 py-1 rounded-full text-sm ${
              isLinking ? 'bg-slate-800/50 text-slate-500 cursor-not-allowed' : 'bg-rose-500/90 hover:bg-rose-600/90 text-white'
            }`}
          >
            {isLinking ? 'Linking...' : 'Link Issue'}
          </button>
        )}
        
        {linkedTaskId && (
          <div className="text-sm text-green-600 flex items-center">
            <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
            </svg>
            Linked to Task #{linkedTaskId}
          </div>
        )}
      </div>
    </div>
  );
};

export default GitHubIssueCard;