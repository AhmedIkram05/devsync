import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock AuthContext to return an admin user
jest.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({ currentUser: { id: 7, role: 'admin' } })
}));

// Mock services
const mockDashboard = { tasks: { review: 1 }, projects: { total: 1 } };
const mockProjects = [
  { id: 10, name: 'P', status: 'active', team_members: [{ id: 7 }], created_by: 7 }
];
const mockTasks = [
  { id: 100, project_id: 10, status: 'todo', deadline: '2000-01-01T00:00:00Z' }
];

jest.mock('../../../src/services/utils/api', () => ({
  dashboardService: {
    getAdminDashboardStats: jest.fn(() => Promise.resolve(mockDashboard)),
  },
  userService: { getAllUsers: jest.fn(() => Promise.resolve([{ id: 7, name: 'Admin' }])) },
  auditLogService: { getLogs: jest.fn(() => Promise.resolve({ logs: [] })) },
  projectService: { getAllProjects: jest.fn(() => Promise.resolve(mockProjects)) },
  taskService: { getAllTasks: jest.fn(() => Promise.resolve(mockTasks)) },
  reportService: { getSavedReports: jest.fn(() => Promise.resolve({ reports: [] })) },
}));

import AdminDashboard from '../../../src/pages/AdminDashboard';

test('renders admin dashboard and management snapshot for admin user', async () => {
  render(
    <MemoryRouter>
      <AdminDashboard />
    </MemoryRouter>
  );

  // Header should show Admin Dashboard
  expect(screen.getByText(/Admin Dashboard/i)).toBeInTheDocument();

  // Wait for async dashboard fetch to complete and management snapshot to appear
  await waitFor(() => expect(screen.getByText(/Management Snapshot/i)).toBeInTheDocument());

  // Links present (use role queries to avoid duplicate text matches)
  expect(screen.getByRole('link', { name: /Audit logs/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Manage users/i })).toBeInTheDocument();
});
