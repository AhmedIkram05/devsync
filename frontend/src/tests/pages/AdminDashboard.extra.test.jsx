import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn()
}));

const { useAuth } = require('../../context/AuthContext');

jest.mock('../../services/utils/api', () => ({
  dashboardService: {
    getAdminDashboardStats: jest.fn(() => Promise.resolve({ 
      tasks: { review: 1, done: 2, todo: 3 }, 
      projects: { total: 5, active: 3 },
      kpis: { in_review_tasks: 1, due_soon_tasks: 0 }
    })),
  },
  userService: { 
    getAllUsers: jest.fn(() => Promise.resolve([{ id: 7, name: 'Admin', role: 'admin', email: 'admin@test.com' }])) 
  },
  auditLogService: { 
    getLogs: jest.fn(() => Promise.resolve({ logs: [], total: 0 })) 
  },
  projectService: { 
    getAllProjects: jest.fn(() => Promise.resolve([
      { id: 10, name: 'P', status: 'active', team_members: [{ id: 7 }], created_by: 7 }
    ])) 
  },
  taskService: { 
    getAllTasks: jest.fn(() => Promise.resolve([
      { id: 100, project_id: 10, status: 'todo', deadline: '2000-01-01T00:00:00Z', assigned_to: 7 }
    ])) 
  },
  reportService: { 
    getSavedReports: jest.fn(() => Promise.resolve({ reports: [] })) 
  },
}));

import AdminDashboard from '../../pages/AdminDashboard';

describe('AdminDashboard extra tests', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      currentUser: { id: 7, role: 'admin', name: 'Admin' },
      is: jest.fn(role => role === 'admin')
    });
  });

  test('renders admin dashboard heading', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <AdminDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Admin Dashboard/i)).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  test('shows dashboard content after loading', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <AdminDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Admin Dashboard/i)).toBeInTheDocument();
    }, { timeout: 2000 });

    expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
  });

  test('renders create task button', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <AdminDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Create Task/i })).toBeInTheDocument();
    }, { timeout: 2000 });
  });
});
