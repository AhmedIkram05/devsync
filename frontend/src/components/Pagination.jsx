import React from 'react';

// Reusable server-pagination control. Driven by the backend `pagination` object
// ({ page, per_page, total, pages }); tolerates the audit-log aliases
// (current_page/total_pages) so it can back any list view.
const Pagination = ({ pagination, onPageChange, className = '' }) => {
  if (!pagination) return null;

  const page = pagination.page ?? pagination.current_page ?? 1;
  const pages = pagination.pages ?? pagination.total_pages ?? 1;
  const total = pagination.total ?? 0;

  const goTo = (next) => {
    if (typeof onPageChange !== 'function') return;
    if (next < 1 || next > pages || next === page) return;
    onPageChange(next);
  };

  return (
    <div className={`flex items-center justify-between mt-4 text-sm text-slate-400 ${className}`}>
      <span>Total: {total} items</span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => goTo(page - 1)}
          className="px-3 py-1 rounded border border-slate-700 disabled:opacity-30 hover:bg-slate-800 transition"
        >
          Prev
        </button>
        <span className="px-3 py-1">Page {page} of {pages || 1}</span>
        <button
          type="button"
          disabled={page >= pages}
          onClick={() => goTo(page + 1)}
          className="px-3 py-1 rounded border border-slate-700 disabled:opacity-30 hover:bg-slate-800 transition"
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default Pagination;
