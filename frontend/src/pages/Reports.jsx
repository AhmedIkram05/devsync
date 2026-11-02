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
import { reportService } from '../services/utils/api';
import { fetchReportViewData, fetchSavedReportsList } from '../services/reportViewService';
import LoadingSpinner from '../components/LoadingSpinner';
import ReportCharts from '../components/ReportCharts';
import {
  getReportLabel,
  getDateRangeLabel,
  formatGeneratedAt,
  sanitizePdfText,
  createPdfBlob,
  buildPdfLines,
} from '../utils/reportPdf';
import { buildTimeBuckets } from '../utils/reportStats';

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
  // The type the currently-loaded reportData actually belongs to. Kept separate
  // from reportType so switching type/range can leave the previous chart mounted
  // until the new payload lands, instead of blanking the page.
  const [loadedReportType, setLoadedReportType] = useState('tasks');
  const [dateRange, setDateRange] = useState('week');
  const [generatedReports, setGeneratedReports] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [pdfError, setPdfError] = useState(null);
  const reportCacheRef = useRef({});
  const latestRequestRef = useRef(0);

  const loadReportData = useCallback(async ({ forceRefresh = false } = {}) => {
    const cacheKey = `${reportType}:${dateRange}`;
    const cachedReport = reportCacheRef.current[cacheKey];
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;

    if (cachedReport && reportType !== 'github' && !forceRefresh) {
      setReportData(cachedReport);
      setLoadedReportType(reportType);
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
      const data = await fetchReportViewData(reportType, dateRange, { forceRefresh });
      // Ignore stale responses from previous report/date selections.
      if (requestId !== latestRequestRef.current) {
        return null;
      }
      reportCacheRef.current[cacheKey] = data;
      setReportData(data);
      setLoadedReportType(reportType);
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
        const response = await fetchSavedReportsList();
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
    try {
      setPdfError(null);
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
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      setPdfError('Failed to generate the PDF. Please try again.');
    }
  };

  const getGithubUpdatedLabel = () => {
    if (reportType !== 'github') {
      return null;
    }

    const fetchedAt = reportData?.meta?.fetched_at;
    return fetchedAt ? `GitHub stats updated ${formatGeneratedAt(fetchedAt)}` : 'GitHub stats ready for live refresh';
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
            <label htmlFor="reports-type" className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
              Report Type
            </label>
            <select
              id="reports-type"
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
            <label htmlFor="reports-range" className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
              Date Range
            </label>
            <select
              id="reports-range"
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
          <div className="min-h-[1.25rem] text-xs text-slate-400">
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

      <ReportCharts
        reportData={reportData}
        reportType={loadedReportType}
        dateRange={dateRange}
        generatedReports={generatedReports}
        pdfError={pdfError}
        onDeleteReport={handleDeleteReport}
        onDownloadPdf={handleDownloadPdf}
      />
      </div>
    </div>
  );
};

export default Reports;

// Export helpers for testing
export {
  getReportLabel,
  getDateRangeLabel,
  formatGeneratedAt,
  sanitizePdfText,
  createPdfBlob,
  buildPdfLines,
  buildTimeBuckets,
};
