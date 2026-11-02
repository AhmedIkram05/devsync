import React from 'react';
import { Link } from 'react-router-dom';
import Panel, { PanelHeader, panelClass, panelHeaderClass, sectionTitleClass } from './Panel';
import StatusBadge from './StatusBadge';

// Presentational panels for the admin/team-lead dashboard. Moved verbatim out
// of AdminDashboard.jsx so the page holds state/data orchestration only.

export const MyProjectsPanel = ({ myProjects = [], recentProjects = [] }) => {
  const hasProjects = (myProjects?.length > 0) || (recentProjects?.length > 0);
  const projects = myProjects?.length > 0 ? myProjects : recentProjects;

  return (
    <div className={`${panelClass} flex flex-col h-[300px] lg:h-[300px]`}>
      <div className={panelHeaderClass}>
        <div>
          <h3 className={sectionTitleClass}>My Projects</h3>
          <p className="mt-1 text-xs text-slate-500">Projects you are assigned to</p>
        </div>
        <Link to="/admin/projects" className="text-sm text-rose-300 hover:text-rose-200 font-medium">View all</Link>
      </div>
      {hasProjects ? (
        <ul className="flex-1 divide-y divide-slate-800 overflow-y-auto min-h-0">
          {projects.map(project => (
            <li key={project.id} className="px-4 py-4 hover:bg-slate-800/60 transition-colors">
              <Link to={`/projects/${project.id}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-100">{project.name}</p>
                  <StatusBadge status={project.status} />
                </div>
                <div className="mt-1 flex items-center text-xs text-slate-400">
                  <span>{project.task_count ?? 0} tasks</span>
                  <span className="mx-1">•</span>
                  <span>{project.completion_percentage ?? 0}% complete</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="p-6 text-center text-slate-400">You are not assigned to any projects yet</div>
      )}
    </div>
  );
};

export const MyTasksPanel = ({ tasks = [] }) => {
  const activeTasks = (tasks || []).filter(
    (t) => !['done', 'completed'].includes((t.status || '').toLowerCase())
  );

  return (
    <div className={`${panelClass} flex flex-col h-[500px] lg:h-[500px]`}>
      <div className={panelHeaderClass}>
        <div>
          <h3 className={sectionTitleClass}>My Tasks</h3>
          <p className="mt-1 text-xs text-slate-500">Your latest assigned work, with the same fields you see on the tasks page.</p>
        </div>
        <Link to="/tasks" className="text-sm text-rose-300 hover:text-rose-200 font-medium">View all tasks</Link>
      </div>

      {activeTasks.length > 0 ? (
        <ul className="flex-1 divide-y divide-slate-800 overflow-y-auto min-h-0">
          {activeTasks.map((task) => (
            <li key={task.id} className="px-5 py-4 hover:bg-slate-800/60 transition-colors">
              <Link to={`/tasks/${task.id}`} className="block">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-100 truncate">{task.title}</p>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold"> {String(task.status || '').replace(/[_-]/g,' ')}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-400 line-clamp-2">{task.description || 'No description provided'}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>{task.project_name || task.project?.name || 'No project'}</span>
                      <span>•</span>
                      <span>Due {(task.deadline ?? task.due_date ?? task.dueDate) ? new Date(task.deadline ?? task.due_date ?? task.dueDate).toLocaleDateString() : '—'}</span>
                      <span>•</span>
                      <span>{task.progress || 0}% complete</span>
                    </div>
                    <div className="mt-3 w-full bg-slate-800 rounded-full h-1.5">
                      <div
                        className="bg-rose-400 h-1.5 rounded-full"
                        style={{ width: `${task.progress || 0}%` }}
                      />
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-rose-300 font-medium pt-1">View</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="p-6 text-center text-slate-400">
          <svg className="mx-auto h-12 w-12 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-slate-200">No tasks found</h3>
          <p className="mt-1 text-sm text-slate-400">You don't have any active tasks assigned yet.</p>
        </div>
      )}
    </div>
  );
};

export const TaskBreakdownPanel = ({ tasks = {} }) => {
  const backlog = tasks?.backlog || 0;
  const todo = tasks?.todo || 0;
  const inProgress = tasks?.in_progress ?? tasks?.active ?? 0;
  const inReview = tasks?.review ?? tasks?.inReview ?? 0;
  const done = tasks?.done || 0;
  const total = backlog + todo + inProgress + inReview + done;

  const rows = [
    { label: 'Backlog', value: backlog, color: 'bg-orange-500' },
    { label: 'To Do', value: todo, color: 'bg-slate-500' },
    { label: 'In Progress', value: inProgress, color: 'bg-sky-500' },
    { label: 'In Review', value: inReview, color: 'bg-amber-500' },
    { label: 'Done', value: done, color: 'bg-emerald-500' },
  ];

  return (
    <Panel>
      <PanelHeader title="Task Breakdown" />
      <div className="p-5 space-y-4">
        {rows.map(({ label, value, color }) => {
          const pct = total > 0 ? Math.round((value / total) * 100) : 0;

          return (
            <div key={label}>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-slate-300">{label}</span>
                <span className="text-slate-400">{value} <span className="text-slate-600">({pct}%)</span></span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5">
                <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
};

export const RecentAuditLogsPanel = ({ logs = [] }) => (
  <Panel>
    <PanelHeader title="Recent Audit Logs" linkTo="/admin/audit-logs" />
    {logs.length > 0 ? (
      <ul className="divide-y divide-slate-800 overflow-y-auto" style={{ maxHeight: '220px' }}>
        {logs.slice(0,5).map(log => (
          <li key={log.id} className="px-5 py-3 hover:bg-slate-800/50 transition-colors">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 pt-0.5">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-slate-800">
                  <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-100 truncate">{log.action}</p>
                <p className="text-xs text-slate-400 mt-0.5">{log.resource_type}{log.resource_id ? ` #${log.resource_id}` : ''}</p>
                <p className="text-xs text-slate-500 mt-1">{new Date(log.created_at).toLocaleDateString()} {new Date(log.created_at).toLocaleTimeString()}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    ) : (
      <div className="px-5 py-10 text-center text-slate-500 text-sm">No recent audit logs found.</div>
    )}
  </Panel>
);

export const RecentReportsPanel = ({ reports = [] }) => (
  <Panel>
    <PanelHeader title="Recent Created Reports" linkTo="/admin/reports" />
    {reports?.length > 0 ? (
      <ul className="divide-y divide-slate-800 overflow-y-auto" style={{ maxHeight: '220px' }}>
        {reports.map((r) => {
          const typeKey = r.report_type || r.type || r.reportType || 'report';
          const typeLabel = {
            tasks: 'Task Report',
            github: 'GitHub Activity',
            developers: 'Developer Performance'
          }[typeKey] || String(typeKey).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          const createdAt = r.created_at || r.generatedAt || r.createdAt || r.created || null;

          return (
            <li key={r.id || r.report_id} className="px-5 py-3 hover:bg-slate-800/50 transition-colors">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-100 truncate">{typeLabel}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{createdAt ? new Date(createdAt).toLocaleString() : ''}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    ) : (
      <div className="px-5 py-10 text-center text-slate-500 text-sm">No reports found.</div>
    )}
  </Panel>
);
