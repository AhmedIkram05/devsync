import React from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import ReportTable from './ReportTable';
import { getDateRangeLabel, getReportLabel, formatGeneratedAt } from '../utils/reportPdf';
import { buildSummarySnapshot, buildTaskTrend, getGithubRepoMetrics, getRepoLabel, hasNonZero } from '../utils/reportStats';
import { baseAxisOptions, doughnutOptions, chartPalette, doughnutBorder } from '../utils/reportCharts';

// ─── Sub-components ───────────────────────────────────────────────────────
const SummaryCard = ({ title, value, color, icon }) => {
  const colorClasses = {
    blue:   'bg-sky-500/15 text-sky-300 border border-sky-400/20',
    green:  'bg-emerald-500/15 text-emerald-300 border border-emerald-400/20',
    yellow: 'bg-amber-500/15 text-amber-300 border border-amber-400/20',
    red:    'bg-rose-500/15 text-rose-300 border border-rose-400/20',
    purple: 'bg-purple-500/15 text-purple-300 border border-purple-400/20',
  };

  return (
    <div className={`rounded-xl p-4 ${colorClasses[color] || 'bg-slate-800/50 text-slate-400 border border-slate-700/70'}`}>
      <div className="flex items-center gap-4">
        <div className="shrink-0">{icon}</div>
        <div>
          <p className="text-xs font-medium opacity-75 uppercase tracking-wide">{title}</p>
          <p className="text-2xl font-semibold mt-0.5">{value}</p>
        </div>
      </div>
    </div>
  );
};

const ChartCard = ({ title, subtitle, emptyState, children }) => (
  <div className="bg-slate-900/70 rounded-2xl shadow-md p-6 border border-slate-800/70">
    <div className="mb-4">
      <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
      {subtitle && <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
    <div className="h-72">
      {emptyState ? (
        <div className="h-full flex items-center justify-center border border-dashed border-slate-700/70 rounded-lg">
          <p className="text-sm text-slate-400">No chart data for this range.</p>
        </div>
      ) : (
        children
      )}
    </div>
  </div>
);

// ─── Chart rendering ──────────────────────────────────────────────────────
// Renders against the type that produced the loaded data (`reportType` is
// `loadedReportType` from the page), not the possibly-newer selection — that
// keeps the previous charts mounted during a type/range switch.
const ReportCharts = ({ reportData, reportType, dateRange, generatedReports = [], pdfError, onDeleteReport, onDownloadPdf }) => {
  if (!reportData) return null;

  const { summary, details } = reportData;
  const summarySnapshot = buildSummarySnapshot(reportType, summary, details);
  const dateRangeLabel = getDateRangeLabel(dateRange);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {reportType === 'tasks' && (
          <>
            <SummaryCard title="Total Tasks" value={summarySnapshot.total || 0} color="blue"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
            />
            <SummaryCard title="Completed" value={summarySnapshot.completed || 0} color="green"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>}
            />
            <SummaryCard title="In Progress" value={summarySnapshot.in_progress || 0} color="yellow"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            />
            <SummaryCard title="Overdue" value={summarySnapshot.overdue || 0} color="red"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            />
          </>
        )}

        {reportType === 'github' && (
          <>
            <SummaryCard title="Connected Repos" value={summarySnapshot.repos || 0} color="purple"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>}
            />
            <SummaryCard title="Open Issues" value={summarySnapshot.open_issues || 0} color="blue"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
            />
            <SummaryCard title="Total PRs" value={summarySnapshot.total_prs || 0} color="green"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>}
            />
            <SummaryCard title="Recent Commits" value={summarySnapshot.recent_commits || 0} color="yellow"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
            />
          </>
        )}

        {reportType === 'developers' && (
          <>
            <SummaryCard title="Team Members" value={summarySnapshot.team_members || 0} color="blue"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
            />
            <SummaryCard title="Avg. Tasks Per Dev" value={summarySnapshot.avg_tasks || 0} color="purple"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
            />
            <SummaryCard title="Avg. Completion Rate" value={`${summarySnapshot.avg_completion || 0}%`} color="green"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
            />
            <SummaryCard title="Active Developers" value={summarySnapshot.active_devs || 0} color="yellow"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            />
          </>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {reportType === 'tasks' && (() => {
          // Include all known task statuses in the breakdown so nothing is grouped as "Other"
          const taskStatusValues = [
            summarySnapshot.backlog || 0,
            summarySnapshot.todo || 0,
            summarySnapshot.in_progress || 0,
            summarySnapshot.review || 0,
            summarySnapshot.done || summarySnapshot.completed || 0,
            summarySnapshot.overdue || 0
          ];
          const taskStatusData = {
            labels: ['Backlog', 'To Do', 'In Progress', 'In Review', 'Completed', 'Overdue'],
            datasets: [{
              data: taskStatusValues,
              backgroundColor: [
                chartPalette.gray,
                chartPalette.blue,
                chartPalette.yellow,
                chartPalette.purple,
                chartPalette.green,
                chartPalette.red
              ],
              borderColor: doughnutBorder,
              borderWidth: 2
            }]
          };

          const taskTrend = buildTaskTrend(details, dateRange);
          const taskTrendData = {
            labels: taskTrend.labels,
            datasets: [{
              label: 'Tasks created',
              data: taskTrend.counts,
              borderColor: chartPalette.blueBorder,
              backgroundColor: 'rgba(56, 189, 248, 0.15)',
              tension: 0.35,
              fill: true,
              pointRadius: 3
            }]
          };

          return (
            <>
              <ChartCard title="Task status breakdown" subtitle={`Distribution for ${dateRangeLabel}`} emptyState={!hasNonZero(taskStatusValues)}>
                <Doughnut data={taskStatusData} options={doughnutOptions} />
              </ChartCard>
              <ChartCard title="Tasks created over time" subtitle={`Activity for ${dateRangeLabel}`} emptyState={!hasNonZero(taskTrend.counts)}>
                <Line data={taskTrendData} options={baseAxisOptions} />
              </ChartCard>
            </>
          );
        })()}

        {reportType === 'github' && (() => {
          const repos = Array.isArray(details) ? details : [];
          const repoActivity = repos.map((repo) => ({ label: getRepoLabel(repo), ...getGithubRepoMetrics(repo) }));
          const topRepos = repoActivity.sort((a, b) => b.total - a.total).slice(0, 6);
          const repoBarData = {
            labels: topRepos.map((r) => r.label),
            datasets: [
              { label: 'Open Issues',     data: topRepos.map((r) => r.openIssues),    backgroundColor: chartPalette.blue   },
              { label: 'Total PRs',        data: topRepos.map((r) => r.totalPrs),       backgroundColor: chartPalette.green  },
              { label: 'Recent Commits',  data: topRepos.map((r) => r.recentCommits), backgroundColor: chartPalette.yellow }
            ]
          };

          const issuesTotal  = repos.reduce((s, r) => s + getGithubRepoMetrics(r).openIssues, 0);
          const prsTotal     = repos.reduce((s, r) => s + getGithubRepoMetrics(r).totalPrs, 0);
          const commitsTotal = repos.reduce((s, r) => s + getGithubRepoMetrics(r).recentCommits, 0);
          const githubMixValues = [issuesTotal, prsTotal, commitsTotal];
          const githubMixData = {
            labels: ['Open Issues', 'Total PRs', 'Recent Commits'],
            datasets: [{
              data: githubMixValues,
              backgroundColor: [chartPalette.blue, chartPalette.green, chartPalette.yellow],
              borderColor: doughnutBorder,
              borderWidth: 2
            }]
          };

          return (
            <>
              <ChartCard title="Repository activity by repo" subtitle={`Top repositories · ${dateRangeLabel}`} emptyState={!hasNonZero(topRepos.map((r) => r.total))}>
                <Bar data={repoBarData} options={baseAxisOptions} />
              </ChartCard>
              <ChartCard title="Activity mix" subtitle={`Snapshot for ${dateRangeLabel}`} emptyState={!hasNonZero(githubMixValues)}>
                <Doughnut data={githubMixData} options={doughnutOptions} />
              </ChartCard>
            </>
          );
        })()}

        {reportType === 'developers' && (() => {
          const developers = Array.isArray(details) ? details : [];
          const topDevelopers = [...developers].sort((a, b) => (b.total_tasks || 0) - (a.total_tasks || 0)).slice(0, 6);
          const developerBarData = {
            labels: topDevelopers.map((dev) => dev.name || 'Developer'),
            datasets: [
              { label: 'Total Tasks',     data: topDevelopers.map((dev) => dev.total_tasks     || 0), backgroundColor: chartPalette.purple },
              { label: 'Completed Tasks', data: topDevelopers.map((dev) => dev.completed_tasks || 0), backgroundColor: chartPalette.green  }
            ]
          };

          const idleCount = Math.max((summarySnapshot.team_members || 0) - (summarySnapshot.active_devs || 0), 0);
          const developerMixValues = [summarySnapshot.active_devs || 0, idleCount];
          const developerMixData = {
            labels: ['Active', 'Idle'],
            datasets: [{
              data: developerMixValues,
              backgroundColor: [chartPalette.green, chartPalette.gray],
              borderColor: doughnutBorder,
              borderWidth: 2
            }]
          };

          return (
            <>
              <ChartCard title="Task volume by developer" subtitle={`Top contributors · ${dateRangeLabel}`} emptyState={!hasNonZero(topDevelopers.map((dev) => dev.total_tasks || 0))}>
                <Bar data={developerBarData} options={baseAxisOptions} />
              </ChartCard>
              <ChartCard title="Developer activity" subtitle={`Active vs idle · ${dateRangeLabel}`} emptyState={!hasNonZero(developerMixValues)}>
                <Doughnut data={developerMixData} options={doughnutOptions} />
              </ChartCard>
            </>
          );
        })()}
      </div>

      {/* Report Details + Generated Reports */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:items-stretch">
        <div className="bg-slate-900/70 rounded-2xl shadow-md overflow-hidden border border-slate-800/70 flex h-full flex-col lg:h-[36rem]">
          <div className="px-6 py-4 border-b border-slate-800">
            <h2 className="text-lg font-semibold text-slate-100">Report Details</h2>
          </div>
          <div className="flex-1 min-h-0">
            <ReportTable data={details || []} type={reportType} />
          </div>
        </div>

        <div className="bg-slate-900/70 rounded-2xl shadow-md border border-slate-800/70 flex h-full flex-col lg:h-[36rem]">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">Generated Reports</h2>
            <span className="text-xs text-slate-400 uppercase tracking-wide">PDF downloads</span>
          </div>
          {pdfError && (
            <p className="px-6 pt-3 text-xs text-rose-300">{pdfError}</p>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto p-6 pr-4">
            {generatedReports.length === 0 ? (
              <p className="text-sm text-slate-400">
                No generated reports yet. Use Generate Report to create one.
              </p>
            ) : (
              <div className="space-y-4">
                {generatedReports.map((report) => (
                  <div
                    key={report.id}
                    className="group relative border border-slate-700/70 rounded-xl p-4 flex flex-col gap-3 bg-slate-800/30 hover:border-slate-600/70 transition-all"
                  >
                    {/* Delete Button */}
                    <button
                      onClick={() => onDeleteReport(report.id)}
                      className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-rose-500/10"
                      title="Delete Report"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>

                    <div>
                      <div className="text-sm font-semibold text-slate-100">
                        {getReportLabel(report.type)}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {getDateRangeLabel(report.dateRange)} · {formatGeneratedAt(report.generatedAt)}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-slate-400">
                        Summary entries: {Object.keys(report.summary || {}).length}
                      </div>
                      <button
                        type="button"
                        onClick={() => onDownloadPdf(report)}
                        className="px-3 py-1.5 bg-indigo-600/90 text-white text-xs font-medium rounded-full hover:bg-indigo-500 transition-colors shadow-sm"
                      >
                        Download PDF
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportCharts;
