import {
  fetchReportViewData,
  fetchSavedReportsList,
} from '../../services/reportViewService';

// utils/api deliberately omits reportService so getServices exercises the
// fallback to the split reports module, and options is omitted so the default
// `options = {}` arm executes.
jest.mock('../../services/utils/api', () => ({
  dashboardService: { getReportData: jest.fn() },
}));

jest.mock('../../services/api/reports', () => ({
  reportService: { getSavedReports: jest.fn() },
}));

const { dashboardService } = require('../../services/utils/api');
const { reportService } = require('../../services/api/reports');

describe('reportViewService fallbacks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('defaults options to an empty object', async () => {
    dashboardService.getReportData.mockResolvedValue({ summary: {} });

    await expect(fetchReportViewData('tasks', 'week')).resolves.toEqual({ summary: {} });
    expect(dashboardService.getReportData).toHaveBeenCalledWith('tasks', 'week', {});
  });

  test('falls back to the reports module when utils/api lacks reportService', async () => {
    reportService.getSavedReports.mockResolvedValue({ reports: [{ id: 1 }] });

    await expect(fetchSavedReportsList()).resolves.toEqual({ reports: [{ id: 1 }] });
    expect(reportService.getSavedReports).toHaveBeenCalled();
  });

  test('maps error responses into an empty report list', async () => {
    reportService.getSavedReports.mockResolvedValue({ error: 'boom' });

    await expect(fetchSavedReportsList()).resolves.toEqual({ error: 'boom', reports: [] });
  });
});
