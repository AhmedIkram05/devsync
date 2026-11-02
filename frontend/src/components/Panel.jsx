import React from 'react';
import { Link } from 'react-router-dom';

// Shared surfaces so the admin dashboard's panels stay visually consistent.
// Extracted verbatim from AdminDashboard.
export const panelClass = 'bg-slate-900/70 border border-slate-800/70 rounded-2xl overflow-hidden shadow-md backdrop-blur-sm';
export const panelHeaderClass = 'px-5 py-4 border-b border-slate-800 flex items-center justify-between';
export const sectionTitleClass = 'text-lg font-semibold text-slate-100';

const Panel = ({ children, className = '' }) => (
  <div className={`${panelClass} ${className}`}>
    {children}
  </div>
);

export const PanelHeader = ({ title, linkTo, linkLabel }) => (
  <div className={panelHeaderClass}>
    <h3 className="text-base font-semibold text-slate-100">{title}</h3>
    {linkTo && (
      <Link to={linkTo} className="text-sm text-rose-300 hover:text-rose-200 transition-colors">
        {linkLabel ?? 'View all'}
      </Link>
    )}
  </div>
);

export default Panel;
