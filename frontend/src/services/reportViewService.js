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

const reportViewService = { fetchReportViewData, fetchSavedReportsList };
export { fetchReportViewData, fetchSavedReportsList };
export default reportViewService;
