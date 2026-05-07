import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { dashboardService, reportService } from '../services/utils/api';
import LoadingSpinner from '../components/LoadingSpinner';
import ReportTable from '../components/ReportTable';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
);

const Reports = () => {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reportType, setReportType] = useState('tasks');
  const [dateRange, setDateRange] = useState('week');
  const [generatedReports, setGeneratedReports] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const reportCacheRef = useRef({});
  const latestRequestRef = useRef(0);

  const getReportLabel = (type) => {
    switch (type) {
      case 'tasks': return 'Task Report';
      case 'github': return 'GitHub Activity';
      case 'developers': return 'Developer Performance';
      default: return 'Report';
    }
  };

  const getDateRangeLabel = (range) => {
    switch (range) {
      case 'week': return 'Last Week';
      case 'month': return 'Last Month';
      case 'quarter': return 'Last Quarter';
      case 'year': return 'Last Year';
      default: return 'Custom Range';
    }
  };

  const formatGeneratedAt = (value) => {
    if (!value) return 'Unknown date';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown date';
    return date.toLocaleString('en-US');
  };

  const sanitizePdfText = (value) =>
    String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/[^\x20-\x7E]/g, '?');

  const buildPdfLines = (report) => {
    const summary = report.summary || {};
    const details = Array.isArray(report.details) ? report.details : [];
    const lines = [
      'DevSync Report',
      `Type: ${getReportLabel(report.type)}`,
      `Date Range: ${getDateRangeLabel(report.dateRange)}`,
      `Generated: ${formatGeneratedAt(report.generatedAt)}`,
      '',
      'Summary:'
    ];

    const summaryEntries = Object.entries(summary);
    if (summaryEntries.length === 0) {
      lines.push('No summary data.');
    } else {
      summaryEntries.forEach(([key, value]) => {
        lines.push(`- ${key.replace(/_/g, ' ')}: ${value}`);
      });
    }

    lines.push('', 'Details (top items):');

    if (details.length === 0) {
      lines.push('No detail data.');
    } else if (report.type === 'tasks') {
      details.slice(0, 8).forEach((task) => {
        lines.push(`- ${task.title || 'Untitled'} [${task.status || 'unknown'}]`);
      });
    } else if (report.type === 'developers') {
      details.slice(0, 8).forEach((developer) => {
        lines.push(`- ${developer.name || 'Unknown'} (${developer.email || 'n/a'}) tasks: ${developer.total_tasks || 0}`);
      });
    } else if (report.type === 'github') {
      details.slice(0, 8).forEach((repo) => {
        lines.push(`- ${repo.name || 'Repo'} (${repo.owner || 'owner'}) issues: ${repo.open_issues || 0} prs: ${repo.total_prs || 0}`);
      });
    } else {
      details.slice(0, 8).forEach((item) => {
        lines.push(`- ${item.name || item.title || 'Item'}`);
      });
    }

    return lines.map(sanitizePdfText);
  };

  const createPdfBlob = (lines) => {
    const textStream = [
      'BT', '/F1 12 Tf', '72 720 Td',
      ...lines.flatMap((line, index) =>
        index === 0 ? [`(${line}) Tj`] : ['0 -16 Td', `(${line}) Tj`]
      ),
      'ET'
    ].join('\n');

    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      `<< /Length ${textStream.length} >>\nstream\n${textStream}\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    ];

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(pdf.length);
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });

    const xrefStart = pdf.length;
    pdf += 'xref\n';
    pdf += `0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    offsets.slice(1).forEach((offset) => {
      pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

    return new Blob([pdf], { type: 'application/pdf' });
  };

  const loadReportData = useCallback(async ({ forceRefresh = false } = {}) => {
    const cacheKey = `${reportType}:${dateRange}`;
    const cachedReport = reportCacheRef.current[cacheKey];
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;

    if (cachedReport && reportType !== 'github' && !forceRefresh) {
      setReportData(cachedReport);
      setLoading(false);
      setError(null);
      return cachedReport;
    }

    try {
      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      const data = await dashboardService.getReportData(reportType, dateRange, { forceRefresh });
      // Ignore stale responses from previous report/date selections.
      if (requestId !== latestRequestRef.current) {
        return null;
      }
      reportCacheRef.current[cacheKey] = data;
      setReportData(data);
      return data;
    } catch (err) {
      if (requestId !== latestRequestRef.current) {
        return null;
      }
      console.error('Failed to fetch report data:', err);
      setError('Failed to load report data. Please try again.');
      return null;
    } finally {
      if (requestId === latestRequestRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [reportType, dateRange]);

  useEffect(() => {
    loadReportData();
  }, [loadReportData]);

  useEffect(() => {
    const loadSavedReports = async () => {
      try {
        const response = await reportService.getSavedReports();
        if (response.error) {
          console.warn('Failed to load saved reports:', response.error);
        } else if (response.reports) {
          setGeneratedReports(response.reports);
        }
      } catch (err) {
        console.error('Error loading saved reports:', err);
      }
    };

    loadSavedReports();
  }, []);

  const handleDeleteReport = async (reportId) => {
    try {
      const response = await reportService.deleteReport(reportId);
      if (response.error) {
        console.error('Failed to delete report:', response.error);
      } else {
        setGeneratedReports((prev) => prev.filter((r) => r.id !== reportId));
      }
    } catch (err) {
      console.error('Error deleting report:', err);
    }
  };

  const handleGenerateReport = async () => {
    const data = reportData || await loadReportData();
    if (!data) return;

    const now = new Date();
    const reportEntry = {
      id: `${now.getTime()}`,
      type: reportType,
      dateRange,
      generatedAt: now.toISOString(),
      summary: data.summary || {},
      details: data.details || []
    };

    try {
      const saveResponse = await reportService.saveReport(
        reportType,
        dateRange,
        reportEntry.summary,
        reportEntry.details
      );

      if (saveResponse?.report) {
        setGeneratedReports((prev) => [saveResponse.report, ...prev]);
        return;
      }

      if (saveResponse?.error) {
        console.warn('Failed to save report to backend:', saveResponse.error);
      }
    } catch (err) {
      console.error('Error saving report to backend:', err);
    }

    setGeneratedReports((prev) => [reportEntry, ...prev]);
  };

  const handleRefreshReport = async () => {
    await loadReportData({ forceRefresh: true });
  };

  const handleDownloadPdf = (report) => {
    const lines = buildPdfLines(report);
    const blob = createPdfBlob(lines);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `devsync-${report.type}-${report.dateRange}-${report.id}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const buildTimeBuckets = (range) => {
    const now = new Date();
    const buckets = [];

    if (range === 'week') {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      for (let i = 0; i < 7; i++) {
        const bucketStart = new Date(start);
        bucketStart.setDate(start.getDate() + i);
        const bucketEnd = new Date(bucketStart);
        bucketEnd.setDate(bucketStart.getDate() + 1);
        buckets.push({
          label: bucketStart.toLocaleDateString('en-US', { weekday: 'short' }),
          start: bucketStart,
          end: bucketEnd
        });
      }
      return buckets;
    }

    if (range === 'month') {
      const start = new Date(now);
      start.setDate(now.getDate() - 27);
      start.setHours(0, 0, 0, 0);
      for (let i = 0; i < 4; i++) {
        const bucketStart = new Date(start);
        bucketStart.setDate(start.getDate() + i * 7);
        const bucketEnd = new Date(bucketStart);
        bucketEnd.setDate(bucketStart.getDate() + 7);
        buckets.push({ label: `Week ${i + 1}`, start: bucketStart, end: bucketEnd });
      }
      return buckets;
    }

    const monthsToShow = range === 'quarter' ? 3 : 12;
    for (let i = 0; i < monthsToShow; i++) {
      const monthOffset = monthsToShow - 1 - i;
      const bucketStart = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
      const bucketEnd = new Date(now.getFullYear(), now.getMonth() - monthOffset + 1, 1);
      buckets.push({
        label: bucketStart.toLocaleDateString('en-US', { month: 'short' }),
        start: bucketStart,
        end: bucketEnd
      });
    }

    return buckets;
  };

  const buildTaskTrend = (tasks, range) => {
    const buckets = buildTimeBuckets(range);
    const counts = buckets.map(() => 0);

    (tasks || []).forEach((task) => {
      if (!task?.created_at) return;
      const createdAt = new Date(task.created_at);
      if (Number.isNaN(createdAt.getTime())) return;
      buckets.forEach((bucket, index) => {
        if (createdAt >= bucket.start && createdAt < bucket.end) {
          counts[index] += 1;
        }
      });
    });

    return { labels: buckets.map((b) => b.label), counts };
  };

  const buildSummarySnapshot = (type, summary, details) => {
    if (type === 'github') {
      const repos = Array.isArray(details) ? details : [];
      const openIssues = repos.reduce((sum, repo) => sum + getGithubRepoMetrics(repo).openIssues, 0);
      const totalPrs = repos.reduce((sum, repo) => sum + getGithubRepoMetrics(repo).totalPrs, 0);
      const recentCommits = repos.reduce((sum, repo) => sum + getGithubRepoMetrics(repo).recentCommits, 0);
      return {
        repos: summary?.repos ?? repos.length,
        open_issues: summary?.open_issues ?? openIssues,
        total_prs: summary?.total_prs ?? totalPrs,
        recent_commits: summary?.recent_commits ?? recentCommits
      };
    }

    if (type === 'developers') {
      return {
        team_members: summary?.team_members ?? summary?.developers ?? 0,
        avg_tasks: summary?.avg_tasks ?? 0,
        avg_completion: summary?.avg_completion ?? 0,
        active_devs: summary?.active_devs ?? 0
      };
    }

    return {
      total: summary?.total ?? 0,
      completed: summary?.completed ?? 0,
      in_progress: summary?.in_progress ?? 0,
      overdue: summary?.overdue ?? 0
    };
  };

  const hasNonZero = (values = []) => values.some((v) => Number(v) > 0);
  const getGithubUpdatedLabel = () => {
    if (reportType !== 'github') {
      return null;
    }

    const fetchedAt = reportData?.meta?.fetched_at;
    return fetchedAt ? `GitHub stats updated ${formatGeneratedAt(fetchedAt)}` : 'GitHub stats ready for live refresh';
  };

  const getRepoLabel = (repo) => repo?.name || repo?.full_name || 'Repo';
  const getGithubRepoMetrics = (repo) => {
    const openIssues = Number(repo?.open_issues ?? repo?.open_issues_count ?? 0) || 0;
    const totalPrs = Number(repo?.total_prs ?? 0) || 0;
    const recentCommits = Number(repo?.recent_commits ?? 0) || 0;
    return { openIssues, totalPrs, recentCommits, total: openIssues + totalPrs + recentCommits };
  };

  // ─── Chart theme tokens ───────────────────────────────────────────────────
  const slateLabel  = 'rgba(148, 163, 184, 1)';  // slate-400
  const slateGrid   = 'rgba(51,  65,  85,  0.6)'; // slate-700/60
  const tooltipBg   = 'rgba(15,  23,  42,  0.95)'; // slate-950

  const baseAxisOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { usePointStyle: true, boxWidth: 10, color: slateLabel, font: { size: 12 } }
      },
      tooltip: {
        backgroundColor: tooltipBg,
        titleColor: '#f1f5f9',
        bodyColor: slateLabel,
        borderColor: 'rgba(51, 65, 85, 0.7)',
        borderWidth: 1
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: slateLabel },
        border: { color: slateGrid }
      },
      y: {
        beginAtZero: true,
        ticks: { precision: 0, color: slateLabel },
        grid: { color: slateGrid },
        border: { color: slateGrid }
      }
    }
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { usePointStyle: true, boxWidth: 10, color: slateLabel, font: { size: 12 } }
      },
      tooltip: {
        backgroundColor: tooltipBg,
        titleColor: '#f1f5f9',
        bodyColor: slateLabel,
        borderColor: 'rgba(51, 65, 85, 0.7)',
        borderWidth: 1
      }
    },
    cutout: '60%'
  };

  // ─── Chart palette (brighter for dark surfaces) ───────────────────────────
  const chartPalette = {
    blue:        'rgba(56,  189, 248, 0.75)', // sky-400
    blueBorder:  'rgba(14,  165, 233, 1)',     // sky-500
    green:       'rgba(52,  211, 153, 0.75)', // emerald-400
    greenBorder: 'rgba(16,  185, 129, 1)',     // emerald-500
    yellow:      'rgba(251, 191, 36,  0.75)', // amber-400
    red:         'rgba(251, 113, 133, 0.75)', // rose-400
    purple:      'rgba(192, 132, 252, 0.75)', // purple-400
    gray:        'rgba(100, 116, 139, 0.75)'  // slate-500
  };

  // Doughnut segment separator matches dark surface
  const doughnutBorder = 'rgba(15, 23, 42, 0.8)';

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
            <p className="text-sm text-slate-500">No chart data for this range.</p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );

  // ─── Chart rendering ──────────────────────────────────────────────────────
  const renderCharts = () => {
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
            const otherCount = Math.max(
              (summarySnapshot.total || 0)
                - (summarySnapshot.completed || 0)
                - (summarySnapshot.in_progress || 0)
                - (summarySnapshot.overdue || 0),
              0
            );
            const taskStatusValues = [
              summarySnapshot.completed || 0,
              summarySnapshot.in_progress || 0,
              summarySnapshot.overdue || 0,
              otherCount
            ];
            const taskStatusData = {
              labels: ['Completed', 'In Progress', 'Overdue', 'Other'],
              datasets: [{
                data: taskStatusValues,
                backgroundColor: [chartPalette.green, chartPalette.yellow, chartPalette.red, chartPalette.gray],
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-900/70 rounded-2xl shadow-md overflow-hidden border border-slate-800/70">
            <div className="px-6 py-4 border-b border-slate-800">
              <h2 className="text-lg font-semibold text-slate-100">Report Details</h2>
            </div>
            <ReportTable data={details || []} type={reportType} />
          </div>

          <div className="bg-slate-900/70 rounded-2xl shadow-md border border-slate-800/70">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100">Generated Reports</h2>
              <span className="text-xs text-slate-500 uppercase tracking-wide">PDF downloads</span>
            </div>
            <div className="p-6">
              {generatedReports.length === 0 ? (
                <p className="text-sm text-slate-500">
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
                        onClick={() => handleDeleteReport(report.id)}
                        className="absolute top-3 right-3 p-1.5 text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-rose-500/10"
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
                        <div className="text-xs text-slate-500">
                          Summary entries: {Object.keys(report.summary || {}).length}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDownloadPdf(report)}
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

  // ─── Loading / error states ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-screen items-center justify-center p-6 bg-slate-950">
        <div className="bg-rose-500/10 border border-rose-400/30 rounded-xl px-6 py-4 text-rose-300 text-sm mb-4 max-w-md text-center">
          {error}
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-rose-500/90 text-white rounded-full hover:bg-rose-400 text-sm font-medium transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-['Space_Grotesk']">
      <div className="max-w-6xl mx-auto px-6 py-10 md:px-10">
        <h1 className="text-2xl font-bold mb-10 text-slate-100">Reports & Analytics</h1>

      {/* Controls */}
      <div className="bg-slate-900/70 rounded-2xl shadow-md p-5 mb-6 border border-slate-800/70">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
              Report Type
            </label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-700/70 bg-slate-800/60 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/50 focus:border-rose-500/70 transition-colors"
            >
              <option value="tasks">Task Reports</option>
              <option value="github">GitHub Activity</option>
              <option value="developers">Developer Performance</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
              Date Range
            </label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="w-full px-3 py-2 border border-slate-700/70 bg-slate-800/60 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/50 focus:border-rose-500/70 transition-colors"
            >
              <option value="week">Last Week</option>
              <option value="month">Last Month</option>
              <option value="quarter">Last Quarter</option>
              <option value="year">Last Year</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-[1.25rem] text-xs text-slate-500">
            {reportType === 'github' && (
              <span>{refreshing ? 'Refreshing GitHub stats...' : getGithubUpdatedLabel()}</span>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {reportType === 'github' && (
              <button
                type="button"
                onClick={handleRefreshReport}
                disabled={refreshing}
                className="px-4 py-2 border border-slate-700/70 text-slate-200 text-sm font-medium rounded-full hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500/50"
              >
                Refresh GitHub Stats
              </button>
            )}
            <button
              onClick={handleGenerateReport}
              className="px-5 py-2 bg-rose-500/90 text-white text-sm font-medium rounded-full hover:bg-rose-400 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-400/60"
            >
              Generate Report
            </button>
          </div>
        </div>
      </div>

      {renderCharts()}
      </div>
    </div>
  );
};

export default Reports;
