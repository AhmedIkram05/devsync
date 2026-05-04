import React, { useState, useEffect, useCallback } from 'react';
import { dashboardService } from '../services/utils/api';
import LoadingSpinner from '../components/LoadingSpinner';
import ReportTable from '../components/ReportTable';

const Reports = () => {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reportType, setReportType] = useState('tasks'); // tasks, github, developers
  const [dateRange, setDateRange] = useState('week'); // week, month, quarter, year
  const [generatedReports, setGeneratedReports] = useState([]);

  const getReportLabel = (type) => {
    switch (type) {
      case 'tasks':
        return 'Task Report';
      case 'github':
        return 'GitHub Activity';
      case 'developers':
        return 'Developer Performance';
      default:
        return 'Report';
    }
  };

  const getDateRangeLabel = (range) => {
    switch (range) {
      case 'week':
        return 'Last Week';
      case 'month':
        return 'Last Month';
      case 'quarter':
        return 'Last Quarter';
      case 'year':
        return 'Last Year';
      default:
        return 'Custom Range';
    }
  };

  const formatGeneratedAt = (value) => {
    if (!value) return 'Unknown date';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown date';
    return date.toLocaleString('en-US');
  };

  const sanitizePdfText = (value) => {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, '?');
};

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
        lines.push(`- ${repo.name || 'Repo'} (${repo.owner || 'owner'}) issues: ${repo.open_issues || 0} prs: ${repo.open_prs || 0}`);
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
      'BT',
      '/F1 12 Tf',
      '72 720 Td',
      ...lines.flatMap((line, index) => {
        if (index === 0) {
          return [`(${line}) Tj`];
        }
        return ['0 -16 Td', `(${line}) Tj`];
      }),
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

  const loadReportData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await dashboardService.getReportData(reportType, dateRange);
      setReportData(data);
      return data;
    } catch (err) {
      console.error('Failed to fetch report data:', err);
      setError('Failed to load report data. Please try again.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [reportType, dateRange]);
  
  useEffect(() => {
    loadReportData();
  }, [loadReportData]);

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

    setGeneratedReports((prev) => [reportEntry, ...prev]);
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
  
  // Render different charts based on the report type
  const renderCharts = () => {
    if (!reportData) return null;
    
    const { summary, details } = reportData;
    
    return (
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {reportType === 'tasks' && (
            <>
              <SummaryCard 
                title="Total Tasks" 
                value={summary.total || 0} 
                color="blue"
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                }
              />
              <SummaryCard 
                title="Completed" 
                value={summary.completed || 0} 
                color="green"
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                }
              />
              <SummaryCard 
                title="In Progress" 
                value={summary.in_progress || 0} 
                color="yellow"
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />
              <SummaryCard 
                title="Overdue" 
                value={summary.overdue || 0} 
                color="red"
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />
            </>
          )}
          
          {reportType === 'github' && (
            <>
              <SummaryCard 
                title="Connected Repos" 
                value={summary.repos || 0} 
                color="purple"
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                }
              />
              <SummaryCard 
                title="Open Issues" 
                value={summary.open_issues || 0} 
                color="blue"
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                }
              />
              <SummaryCard 
                title="Open PRs" 
                value={summary.open_prs || 0} 
                color="green"
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                }
              />
              <SummaryCard 
                title="Recent Commits" 
                value={summary.recent_commits || 0} 
                color="yellow"
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                }
              />
            </>
          )}
          
          {reportType === 'developers' && (
            <>
              <SummaryCard 
                title="Team Members" 
                value={summary.team_members || 0} 
                color="blue"
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                }
              />
              <SummaryCard 
                title="Avg. Tasks Per Dev" 
                value={summary.avg_tasks || 0} 
                color="purple"
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                }
              />
              <SummaryCard 
                title="Avg. Completion Rate" 
                value={`${summary.avg_completion || 0}%`} 
                color="green"
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                }
              />
              <SummaryCard 
                title="Active Developers" 
                value={summary.active_devs || 0} 
                color="yellow"
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />
            </>
          )}
        </div>
        
        {/* Visual Charts - In a real app, you would use a charting library like Chart.js or Recharts */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="h-64 flex items-center justify-center border border-dashed border-gray-300 rounded">
            <p className="text-gray-500 italic">
              Charts would be displayed here using a library like Chart.js or Recharts
            </p>
          </div>
        </div>
        
        {/* Detailed Report Table + Generated Reports */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800">Report Details</h2>
            </div>
            <ReportTable 
              data={details || []} 
              type={reportType}
            />
          </div>

          <div className="bg-white rounded-lg shadow-md">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">Generated Reports</h2>
              <span className="text-sm text-gray-500">PDF downloads</span>
            </div>
            <div className="p-6">
              {generatedReports.length === 0 ? (
                <div className="text-gray-500 text-sm">
                  No generated reports yet. Use Generate Report to create one.
                </div>
              ) : (
                <div className="space-y-4">
                  {generatedReports.map((report) => (
                    <div
                      key={report.id}
                      className="border border-gray-200 rounded-lg p-4 flex flex-col gap-3"
                    >
                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          {getReportLabel(report.type)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {getDateRangeLabel(report.dateRange)} · {formatGeneratedAt(report.generatedAt)}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-gray-500">
                          Summary entries: {Object.keys(report.summary || {}).length}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDownloadPdf(report)}
                          className="px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
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
  
  // Summary card component for data visualization
  const SummaryCard = ({ title, value, color, icon }) => {
    const colorClasses = {
      blue: 'bg-blue-100 text-blue-500 border-blue-200',
      green: 'bg-green-100 text-green-500 border-green-200',
      yellow: 'bg-yellow-100 text-yellow-500 border-yellow-200',
      red: 'bg-red-100 text-red-500 border-red-200',
      purple: 'bg-purple-100 text-purple-500 border-purple-200',
    };
    
    return (
      <div className={`border rounded-lg p-4 ${colorClasses[color] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
        <div className="flex items-center">
          <div className="mr-4">
            {icon}
          </div>
          <div>
            <p className="text-sm font-medium opacity-75">{title}</p>
            <p className="text-2xl font-semibold">{value}</p>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-screen items-center justify-center p-6">
        <div className="text-xl text-red-600 mb-4">{error}</div>
        <button 
          onClick={() => window.location.reload()} 
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Reports & Analytics</h1>
      
      {/* Report Controls */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="tasks">Task Reports</option>
              <option value="github">GitHub Activity</option>
              <option value="developers">Developer Performance</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="week">Last Week</option>
              <option value="month">Last Month</option>
              <option value="quarter">Last Quarter</option>
              <option value="year">Last Year</option>
            </select>
          </div>
        </div>
        
        <div className="mt-4 flex justify-end">
          <button 
            onClick={handleGenerateReport}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Generate Report
          </button>
        </div>
      </div>
      
      {/* Report Content */}
      {renderCharts()}
    </div>
  );
};

export default Reports;