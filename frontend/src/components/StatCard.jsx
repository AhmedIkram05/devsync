import React from 'react';

// KPI tile used by the admin/team-lead dashboard. Extracted verbatim from
// AdminDashboard so the page holds orchestration, not presentation.
const StatCard = ({ title, value, change, icon, color, currentTimeRange }) => {
  const colorClasses = {
    primary:   'bg-sky-500/15 text-sky-300 border border-sky-400/20',
    secondary: 'bg-rose-500/15 text-rose-300 border border-rose-400/20',
    success:   'bg-emerald-500/15 text-emerald-300 border border-emerald-400/20',
    warning:   'bg-amber-500/15 text-amber-300 border border-amber-400/20',
    error:     'bg-rose-500/15 text-rose-300 border border-rose-400/20',
    purple:    'bg-purple-500/15 text-purple-300 border border-purple-400/20',
  };

  return (
    <div className={`rounded-2xl p-6 shadow-md backdrop-blur-sm ${colorClasses[color] || 'bg-slate-900/70 text-slate-400 border border-slate-800/70'}`}>
      <div className="flex items-center gap-5">
        <div className="p-3 rounded-xl bg-slate-950/40 border border-white/5 text-slate-100">
          {icon}
        </div>
        <div className="flex-1">
          <p className="text-xs font-medium opacity-75 uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold mt-1 text-white">{value}</p>
          {change !== undefined && (
            <div className="flex items-center mt-1.5 text-[10px] font-bold uppercase tracking-tight">
              {change > 0 ? (
                <span className="text-emerald-400 flex items-center">
                  <svg className="w-3 h-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                  {change}%
                </span>
              ) : change < 0 ? (
                <span className="text-rose-400 flex items-center">
                  <svg className="w-3 h-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                  {Math.abs(change)}%
                </span>
              ) : (
                <span className="text-slate-500">No change</span>
              )}
              <span className="ml-1.5 text-slate-500 opacity-60">vs last {currentTimeRange}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StatCard;
