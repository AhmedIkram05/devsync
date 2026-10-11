import * as legacyApi from '../../../services/utils/api';
import { taskService as tasksSplit } from '../../../services/api/tasks';
import { projectService as projectsSplit } from '../../../services/api/projects';
import { dashboardService as dashboardSplit } from '../../../services/api/dashboard';
import { reportService as reportsSplit } from '../../../services/api/reports';
import { adminUserService as adminSplit } from '../../../services/api/admin';
import { fetchWithAuth as clientFetch } from '../../../services/api/client';

describe('api split import parity', () => {
  test('old utils/api paths still resolve all services', () => {
    expect(legacyApi.taskService).toBeDefined();
    expect(legacyApi.projectService).toBeDefined();
    expect(legacyApi.dashboardService).toBeDefined();
    expect(legacyApi.githubService).toBeDefined();
    expect(legacyApi.reportService).toBeDefined();
    expect(legacyApi.adminUserService).toBeDefined();
    expect(legacyApi.fetchWithAuth).toBeDefined();
  });

  test('new domain modules export the same keys as legacy', () => {
    expect(tasksSplit).toBe(legacyApi.taskService);
    expect(projectsSplit).toBe(legacyApi.projectService);
    expect(dashboardSplit).toBe(legacyApi.dashboardService);
    expect(reportsSplit).toBe(legacyApi.reportService);
    expect(adminSplit).toBe(legacyApi.adminUserService);
    expect(clientFetch).toBe(legacyApi.fetchWithAuth);
  });

  test('new modules expose expected method keys', () => {
    expect(Object.keys(tasksSplit)).toEqual(expect.arrayContaining([
      'getAllTasks', 'getTaskById', 'createTask', 'updateTask', 'deleteTask',
    ]));
    expect(Object.keys(projectsSplit)).toEqual(expect.arrayContaining([
      'getAllProjects', 'getProjectById', 'createProject',
    ]));
    expect(Object.keys(dashboardSplit)).toEqual(expect.arrayContaining([
      'getAdminDashboardStats', 'getBasicDashboardStats', 'getReportData',
    ]));
    expect(Object.keys(reportsSplit)).toEqual(expect.arrayContaining([
      'saveReport', 'getSavedReports', 'deleteReport',
    ]));
    expect(Object.keys(adminSplit)).toEqual(expect.arrayContaining([
      'getAllUsers', 'createUser', 'deleteUser',
    ]));
  });
});
