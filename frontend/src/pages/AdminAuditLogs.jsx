import { useState, useEffect, useCallback } from 'react';
import { auditLogService } from '../services/utils/api';

const AdminAuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);

  const perPage = 25;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const filters = { page, per_page: perPage };
      if (actionFilter) filters.action = actionFilter;
      if (actorFilter) filters.actor = actorFilter;
      const data = await auditLogService.getLogs(filters);
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setPages(data.pages || 0);
    } catch (err) {
      console.error('Failed to fetch audit logs', err);
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, actorFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleViewDetail = async (logId) => {
    const detail = await auditLogService.getLogById(logId);
    setSelectedLog(detail);
  };

  const actionBadge = (action) => {
    if (action?.includes('login')) return 'bg-blue-500/20 text-blue-300';
    if (action?.includes('register')) return 'bg-emerald-500/20 text-emerald-300';
    if (action?.includes('delete')) return 'bg-rose-500/20 text-rose-300';
    if (action?.includes('role')) return 'bg-amber-500/20 text-amber-300';
    return 'bg-slate-500/20 text-slate-300';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-['Space_Grotesk']">
      <div className="max-w-6xl mx-auto px-6 py-10 md:px-10">
        <h1 className="text-2xl font-bold mb-10 text-slate-100">Audit Logs</h1>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <input type="text" placeholder="Filter by action..." value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            className="flex-1 rounded-lg border border-slate-700/60 bg-slate-900/80 py-2 px-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-400/60" />
          <input type="text" placeholder="Filter by actor ID..." value={actorFilter}
            onChange={(e) => { setActorFilter(e.target.value); setPage(1); }}
            className="w-40 rounded-lg border border-slate-700/60 bg-slate-900/80 py-2 px-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-400/60" />
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-12 text-slate-400">Loading audit logs...</div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-slate-800/80">
              <table className="w-full text-left">
                <thead className="bg-slate-900/80 text-slate-400 text-sm uppercase">
                  <tr>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Resource</th>
                    <th className="px-4 py-3 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/30 transition">
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                        {log.created_at ? new Date(log.created_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded ${actionBadge(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {log.actor_user_id ? `User ${log.actor_user_id}` : 'System'}
                        {log.actor_role && <span className="ml-1 text-xs text-slate-500">({log.actor_role})</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {log.resource_type || '—'}{log.resource_id ? ` #${log.resource_id}` : ''}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleViewDetail(log.id)}
                          className="text-xs px-3 py-1 rounded bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 transition">
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-500">No audit logs found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 text-sm text-slate-400">
              <span>Total: {total} entries</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)}
                  className="px-3 py-1 rounded border border-slate-700 disabled:opacity-30 hover:bg-slate-800 transition">Prev</button>
                <span className="px-3 py-1">Page {page} of {pages || 1}</span>
                <button disabled={page >= pages} onClick={() => setPage(page + 1)}
                  className="px-3 py-1 rounded border border-slate-700 disabled:opacity-30 hover:bg-slate-800 transition">Next</button>
              </div>
            </div>
          </>
        )}

        {/* Detail Drawer */}
        {selectedLog && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
              <h2 className="text-lg font-semibold mb-4">Audit Log Detail</h2>
              <dl className="space-y-3 text-sm">
                {[['ID', selectedLog.id], ['Action', selectedLog.action], ['Actor', selectedLog.actor_user_id],
                  ['Role', selectedLog.actor_role], ['Resource', `${selectedLog.resource_type || ''} ${selectedLog.resource_id || ''}`],
                  ['IP', selectedLog.ip], ['User Agent', selectedLog.user_agent],
                  ['Timestamp', selectedLog.created_at ? new Date(selectedLog.created_at).toLocaleString() : '—']
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between">
                    <dt className="text-slate-400">{label}</dt>
                    <dd className="text-slate-200 text-right max-w-xs truncate">{val || '—'}</dd>
                  </div>
                ))}
                {selectedLog.metadata && (
                  <div>
                    <dt className="text-slate-400 mb-1">Metadata</dt>
                    <dd><pre className="text-xs bg-slate-950 p-2 rounded overflow-x-auto">{JSON.stringify(selectedLog.metadata, null, 2)}</pre></dd>
                  </div>
                )}
              </dl>
              <div className="mt-6 text-right">
                <button onClick={() => setSelectedLog(null)}
                  className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 transition">Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminAuditLogs;
