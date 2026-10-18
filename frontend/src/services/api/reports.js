import { fetchWithAuth } from './client';

// Report service (moved from services/utils/api.js, no behavior change)
const reportService = {
  saveReport: async (reportType, dateRange, summary, details) => {
    try {
      const response = await fetchWithAuth('reports', {
        method: 'POST',
        body: JSON.stringify({
          report_type: reportType,
          date_range: dateRange,
          summary,
          details
        })
      });
      return response;
    } catch (error) {
      console.error('Failed to save report:', error);
      return { error: error.message };
    }
  },

  getSavedReports: async (filter = {}) => {
    try {
      let endpoint = 'reports';
      const params = new URLSearchParams();

      if (filter.type) params.append('type', filter.type);
      if (filter.dateRange) params.append('dateRange', filter.dateRange);
      if (filter.page) params.append('page', filter.page);
      if (filter.per_page) params.append('per_page', filter.per_page);

      const queryString = params.toString();
      if (queryString) {
        endpoint = `${endpoint}?${queryString}`;
      }

      const response = await fetchWithAuth(endpoint);
      return response;
    } catch (error) {
      console.error('Failed to fetch saved reports:', error);
      return { error: error.message, reports: [] };
    }
  },

  // Pagination-aware view of the saved-reports list: returns { items, pagination }
  // from the same response getSavedReports already returns (kept intact for
  // existing callers that read `.reports` / `.message` / `.error`).
  getSavedReportsPaginated: async (filter = {}) => {
    const response = await reportService.getSavedReports(filter);
    const reports = response?.reports;
    return {
      items: Array.isArray(reports) ? reports : [],
      pagination: response?.pagination ?? null,
    };
  },

  getReportById: async (reportId) => {
    try {
      const response = await fetchWithAuth(`reports/${reportId}`);
      return response;
    } catch (error) {
      console.error('Failed to fetch report', reportId, error);
      return { error: error.message };
    }
  },

  deleteReport: async (reportId) => {
    try {
      const response = await fetchWithAuth(`reports/${reportId}`, {
        method: 'DELETE'
      });
      return response;
    } catch (error) {
      console.error('Failed to delete report', reportId, error);
      return { error: error.message };
    }
  }
};

export { reportService };
export default reportService;
