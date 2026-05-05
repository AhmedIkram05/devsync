import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import Login from '../../pages/Login';
import { useAuth } from '../../context/AuthContext';

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

const mockLogin = jest.fn();

const renderLogin = () => {
  return render(
    <MemoryRouter
      initialEntries={['/login']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<div>Admin Dashboard</div>} />
        <Route path="/BasicDashboard" element={<div>Client Dashboard</div>} />
      </Routes>
    </MemoryRouter>
  );
};

describe('Login page', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    localStorage.clear();
    mockLogin.mockReset();

    useAuth.mockReturnValue({
      login: mockLogin,
      loading: false,
      error: '',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  test('shows validation error when required credentials are missing', async () => {
    renderLogin();

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/Please enter both email and password/i)).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  test('submits credentials via auth context login', async () => {
    mockLogin.mockResolvedValue({ success: true });

    renderLogin();

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { name: 'email', value: 'dev@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('********'), {
      target: { name: 'password', value: 'password123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'dev@example.com',
        password: 'password123',
      });
    });
  });

  test('renders auth context error when present', () => {
    useAuth.mockReturnValue({
      login: mockLogin,
      loading: false,
      error: 'Authentication service unavailable',
    });

    renderLogin();

    expect(screen.getByText(/Authentication service unavailable/i)).toBeInTheDocument();
  });

  test('shows login error returned by failed login call', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid credentials'));

    renderLogin();

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { name: 'email', value: 'dev@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('********'), {
      target: { name: 'password', value: 'wrong-password' },
    });

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/Invalid credentials/i)).toBeInTheDocument();
  });

  test('redirects existing admin user from login to admin dashboard', () => {
    localStorage.setItem('user', JSON.stringify({ id: 1, role: 'admin' }));

    renderLogin();

    expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
  });

  test('redirects existing developer user from login to member dashboard', () => {
    localStorage.setItem('user', JSON.stringify({ id: 2, role: 'developer' }));

    renderLogin();

    expect(screen.getByText('Client Dashboard')).toBeInTheDocument();
  });
});
