// Lazy require keeps existing jest.mock('../../services/utils/api') tests working.
const getServices = () => {
  // eslint-disable-next-line global-require
  const utilsApi = require('./utils/api');
  // eslint-disable-next-line global-require
  const reportsApi = require('./api/reports');
  return {
    dashboardService: utilsApi.dashboardService,
    reportService: utilsApi.reportService || reportsApi.reportService,
  };
};

// Data-fetch extracted from Reports.jsx; charts/render stay in the page.
const fetchReportViewData = async (reportType, dateRange, options = {}) => {
  const { dashboardService } = getServices();
  return dashboardService.getReportData(reportType, dateRange, options);
};

const fetchSavedReportsList = async () => {
  const { reportService } = getServices();
  const response = await reportService.getSavedReports();
  if (response?.error) return { error: response.error, reports: [] };
  return response;
};

// Pagination-aware saved-reports fetch: returns { items, pagination }. Reports.jsx
// is intentionally untouched, so this is exposed for consumers that opt in.
const fetchSavedReportsPage = async (params = {}) => {
  const { reportService } = getServices();
  const result = await reportService.getSavedReportsPaginated(params);
  const items = Array.isArray(result?.items) ? result.items : [];
  return { items, pagination: result?.pagination ?? null };
};

const reportViewService = { fetchReportViewData, fetchSavedReportsList, fetchSavedReportsPage };
export { fetchReportViewData, fetchSavedReportsList, fetchSavedReportsPage };
export default reportViewService;
