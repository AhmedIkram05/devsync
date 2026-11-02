import React from 'react';

// Project/task status pill. Extracted verbatim from AdminDashboard.
const StatusBadge = ({ status }) => {
  const styles = {
    active:    'bg-emerald-500/15 text-emerald-300 border border-emerald-400/20',
    completed: 'bg-sky-500/15     text-sky-300     border border-sky-400/20',
    'on-hold': 'bg-amber-500/15   text-amber-300   border border-amber-400/20',
    on_hold:   'bg-amber-500/15   text-amber-300   border border-amber-400/20',
    cancelled: 'bg-rose-500/15    text-rose-300    border border-rose-400/20',
  }[status] ?? 'bg-slate-800 text-slate-300 border border-slate-700';

  const label = (status || 'unknown')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  return (
    <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${styles}`}>
      {label}
    </span>
  );
};

export default StatusBadge;
