import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import AdminUsers from '../../pages/AdminUsers';
import { adminUserService } from '../../services/utils/api';
import { useAuth } from '../../context/AuthContext';

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../services/utils/api', () => ({
  adminUserService: {
    getAllUsers: jest.fn(),
    getUsersPaginated: jest.fn(),
    createUser: jest.fn(),
    updateUser: jest.fn(),
    updateUserRole: jest.fn(),
    deleteUser: jest.fn(),
  },
}));

// Mirrors the backend /admin/users filtering (role + search over name/email)
// so fixtures respond to server-side query params the way the endpoint does.
const applyServerUsers = (users) => async (params = {}) => users.filter((user) => {
  if (params.role && user.role !== params.role) return false;
  if (params.search) {
    const term = String(params.search).toLowerCase();
    if (!user.name?.toLowerCase().includes(term) && !user.email?.toLowerCase().includes(term)) {
      return false;
    }
  }
  return true;
});

const usersFixture = [
  { id: 1, name: 'Admin User', email: 'admin@example.com', role: 'admin' },
  { id: 2, name: 'Developer One', email: 'dev1@example.com', role: 'developer' },
  { id: 3, name: 'Team Lead One', email: 'lead@example.com', role: 'team_lead' },
];

describe('AdminUsers', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      currentUser: { id: 1, name: 'Admin User', role: 'admin' },
      is: (role) => role === 'admin',
    });

    adminUserService.getAllUsers.mockResolvedValue([
      { id: 1, name: 'Admin User', email: 'admin@example.com', role: 'admin' },
      { id: 2, name: 'Developer One', email: 'dev1@example.com', role: 'developer' },
      { id: 3, name: 'Team Lead One', email: 'lead@example.com', role: 'team_lead' },
    ]);
    adminUserService.getUsersPaginated.mockImplementation(async (params) => ({
      items: await adminUserService.getAllUsers(params),
      pagination: null,
    }));

    adminUserService.createUser.mockResolvedValue({
      user: {
        id: 4,
        name: 'New Hire',
        email: 'new@example.com',
        role: 'developer',
      },
    });
    adminUserService.updateUser.mockResolvedValue({ success: true });
    adminUserService.updateUserRole.mockResolvedValue({ success: true });
    adminUserService.deleteUser.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('covers search, role changes, edit, create, and delete flows', async () => {
    adminUserService.getAllUsers.mockImplementation(applyServerUsers(usersFixture));

    render(<AdminUsers />);

    expect(await screen.findByText('Developer One')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search by name or email...'), {
      target: { value: 'team lead' },
    });

    await waitFor(() => {
      expect(screen.getByText('Team Lead One')).toBeInTheDocument();
      expect(screen.queryByText('Developer One')).not.toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Search by name or email...'), {
      target: { value: '' },
    });

    await screen.findByText('Developer One');

    const developerRow = screen.getByText('Developer One').closest('tr');
    fireEvent.change(within(developerRow).getByRole('combobox'), {
      target: { value: 'team_lead' },
    });

    await waitFor(() => {
      expect(adminUserService.updateUserRole).toHaveBeenCalledWith(2, 'team_lead');
    });

    const editRow = screen.getByText('Developer One').closest('tr');
    fireEvent.click(within(editRow).getByRole('button', { name: 'Edit' }));

    fireEvent.change(screen.getByDisplayValue('Developer One'), {
      target: { value: 'Developer Prime' },
    });
    fireEvent.change(screen.getByDisplayValue('dev1@example.com'), {
      target: { value: 'prime@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(adminUserService.updateUser).toHaveBeenCalledWith(2, {
        name: 'Developer Prime',
        email: 'prime@example.com',
      });
    });

    expect(await screen.findByText('Developer Prime')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /create user/i }));
    fireEvent.change(screen.getByPlaceholderText('Full Name'), {
      target: { value: 'New Hire' },
    });
    fireEvent.change(screen.getByPlaceholderText('email@example.com'), {
      target: { value: 'new@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'Password123!' },
    });

    const createModalRoleSelect = screen
      .getAllByRole('combobox')
      .find((select) => select.closest('.fixed.inset-0'));
    fireEvent.change(createModalRoleSelect, {
      target: { value: 'developer' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create User' }));

    await waitFor(() => {
      expect(adminUserService.createUser).toHaveBeenCalledWith({
        name: 'New Hire',
        email: 'new@example.com',
        password: 'Password123!',
        role: 'developer',
      });
    });

    expect(await screen.findByText('New Hire')).toBeInTheDocument();

    const teamLeadRow = screen.getByText('Team Lead One').closest('tr');
    fireEvent.click(within(teamLeadRow).getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete User' }));

    await waitFor(() => {
      expect(adminUserService.deleteUser).toHaveBeenCalledWith(3);
    });

    await waitFor(() => {
      expect(screen.queryByText('Confirm Delete')).not.toBeInTheDocument();
    });

    await waitFor(() => {
      const table = screen.getByRole('table');
      expect(within(table).queryByText('Team Lead One')).not.toBeInTheDocument();
    });
  });

  test('shows an error when loading users fails', async () => {
    adminUserService.getAllUsers.mockRejectedValueOnce(new Error('boom'));

    render(<AdminUsers />);

    expect(await screen.findByText('Failed to fetch users')).toBeInTheDocument();
  });

  test('sends search and role filters to the server and resets to page 1 on filter change', async () => {
    adminUserService.getAllUsers.mockImplementation(applyServerUsers(usersFixture));
    adminUserService.getUsersPaginated.mockImplementation(async (params) => ({
      items: await adminUserService.getAllUsers(params),
      pagination: { page: params.page, per_page: 100, total: 250, pages: 3 },
    }));

    render(<AdminUsers />);
    expect(await screen.findByText('Developer One')).toBeInTheDocument();

    // Move to page 2, then change a filter — the request must go back to page 1
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(adminUserService.getUsersPaginated).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 })
      );
    });

    fireEvent.change(screen.getByLabelText('Filter by role'), { target: { value: 'developer' } });
    await waitFor(() => {
      expect(adminUserService.getUsersPaginated).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, role: 'developer' })
      );
    });
    expect(await screen.findByText('Developer One')).toBeInTheDocument();
    expect(screen.queryByText('Team Lead One')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search by name or email'), { target: { value: 'lead' } });
    await waitFor(() => {
      expect(adminUserService.getUsersPaginated).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'lead', role: 'developer' })
      );
    });
    // No developer matches "lead" — the server returns an empty page
    expect(await screen.findByText('No users found.')).toBeInTheDocument();
  });

  test('debounces search input into a single server request', async () => {
    adminUserService.getAllUsers.mockImplementation(applyServerUsers(usersFixture));

    render(<AdminUsers />);
    expect(await screen.findByText('Developer One')).toBeInTheDocument();
    const callsAfterLoad = adminUserService.getUsersPaginated.mock.calls.length;

    fireEvent.change(screen.getByPlaceholderText('Search by name or email...'), {
      target: { value: 'lead' },
    });
    // Debounce: no request fires while the user is still typing
    expect(adminUserService.getUsersPaginated.mock.calls.length).toBe(callsAfterLoad);

    await waitFor(() => {
      expect(adminUserService.getUsersPaginated).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'lead' })
      );
    });
    expect(adminUserService.getUsersPaginated.mock.calls.length).toBe(callsAfterLoad + 1);
  });
});