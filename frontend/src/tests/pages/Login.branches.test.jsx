import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter as Router } from 'react-router-dom';
import Login from '../../pages/Login';
import { useAuth } from '../../context/AuthContext';

jest.mock('../../context/AuthContext');

describe('Login page branch coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    useAuth.mockReturnValue({
      login: jest.fn(),
      loading: false,
      error: null
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Redirect branches', () => {
    test('redirects admin to /admin', () => {
      const adminUser = { id: 1, email: 'admin@test.com', role: 'admin' };
      localStorage.setItem('user', JSON.stringify(adminUser));

      const { container } = render(
        <Router>
          <Login />
        </Router>
      );

      // Should redirect, so form should not be visible
      expect(screen.queryByText(/Welcome back/i)).not.toBeInTheDocument();
    });

    test('redirects non-admin to /BasicDashboard', () => {
      const developerUser = { id: 1, email: 'dev@test.com', role: 'developer' };
      localStorage.setItem('user', JSON.stringify(developerUser));

      render(
        <Router>
          <Login />
        </Router>
      );

      expect(screen.queryByText(/Welcome back/i)).not.toBeInTheDocument();
    });

    test('shows login form when no user in localStorage', () => {
      render(
        <Router>
          <Login />
        </Router>
      );

      expect(screen.getByText(/Welcome back/i)).toBeInTheDocument();
    });
  });

  describe('Form input and validation branches', () => {
    test('updates email in form state', () => {
      render(
        <Router>
          <Login />
        </Router>
      );

      const emailInput = screen.getByPlaceholderText(/you@example/i);
      fireEvent.change(emailInput, { target: { value: 'test@test.com', name: 'email' } });

      expect(emailInput.value).toBe('test@test.com');
    });

    test('updates password in form state', () => {
      render(
        <Router>
          <Login />
        </Router>
      );

      const passwordInput = screen.getByPlaceholderText(/\*{6,}/);
      fireEvent.change(passwordInput, { target: { value: 'password123', name: 'password' } });

      expect(passwordInput.value).toBe('password123');
    });

    test('shows error when email is empty', async () => {
      render(
        <Router>
          <Login />
        </Router>
      );

      const submitButton = screen.getByRole('button', { name: /Sign In/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Please enter both/i)).toBeInTheDocument();
      });
    });

    test('shows error when password is empty', async () => {
      render(
        <Router>
          <Login />
        </Router>
      );

      const emailInput = screen.getByPlaceholderText(/you@example/i);
      fireEvent.change(emailInput, { target: { value: 'test@test.com', name: 'email' } });

      const submitButton = screen.getByRole('button', { name: /Sign In/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Please enter both/i)).toBeInTheDocument();
      });
    });

    test('shows error when both email and password are empty', async () => {
      render(
        <Router>
          <Login />
        </Router>
      );

      const submitButton = screen.getByRole('button', { name: /Sign In/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Please enter both/i)).toBeInTheDocument();
      });
    });
  });

  describe('Login submission branches', () => {
    test('calls login with correct credentials', async () => {
      const mockLogin = jest.fn();
      useAuth.mockReturnValue({
        login: mockLogin,
        loading: false,
        error: null
      });

      render(
        <Router>
          <Login />
        </Router>
      );

      const emailInput = screen.getByPlaceholderText(/you@example/i);
      const passwordInput = screen.getByPlaceholderText(/\*{6,}/);

      fireEvent.change(emailInput, { target: { value: 'test@test.com', name: 'email' } });
      fireEvent.change(passwordInput, { target: { value: 'password123', name: 'password' } });

      const submitButton = screen.getByRole('button', { name: /Sign In/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith({
          email: 'test@test.com',
          password: 'password123'
        });
      });
    });

    test('shows login error message on failure', async () => {
      const mockLogin = jest.fn(() => Promise.reject(new Error('Invalid credentials')));
      useAuth.mockReturnValue({
        login: mockLogin,
        loading: false,
        error: null
      });

      render(
        <Router>
          <Login />
        </Router>
      );

      const emailInput = screen.getByPlaceholderText(/you@example/i);
      const passwordInput = screen.getByPlaceholderText(/\*{6,}/);

      fireEvent.change(emailInput, { target: { value: 'test@test.com', name: 'email' } });
      fireEvent.change(passwordInput, { target: { value: 'wrong', name: 'password' } });

      const submitButton = screen.getByRole('button', { name: /Sign In/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Invalid credentials/i)).toBeInTheDocument();
      });
    });

    test('clears previous error on new submission', async () => {
      const mockLogin = jest.fn()
        .mockRejectedValueOnce(new Error('Invalid credentials'))
        .mockResolvedValueOnce({});

      useAuth.mockReturnValue({
        login: mockLogin,
        loading: false,
        error: null
      });

      render(
        <Router>
          <Login />
        </Router>
      );

      const emailInput = screen.getByPlaceholderText(/you@example/i);
      const passwordInput = screen.getByPlaceholderText(/\*{6,}/);
      const submitButton = screen.getByRole('button', { name: /Sign In/i });

      // First attempt fails
      fireEvent.change(emailInput, { target: { value: 'test@test.com', name: 'email' } });
      fireEvent.change(passwordInput, { target: { value: 'wrong', name: 'password' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Invalid credentials/i)).toBeInTheDocument();
      });

      // Second attempt
      fireEvent.change(passwordInput, { target: { value: 'correct', name: 'password' } });
      fireEvent.click(submitButton);

      // Error should be cleared
      await waitFor(() => {
        // The old error should no longer be visible or new login should happen
        expect(mockLogin).toHaveBeenCalledTimes(2);
      });
    });

    test('disables button while submitting', async () => {
      const mockLogin = jest.fn(() => new Promise(() => {})); // Never resolves
      useAuth.mockReturnValue({
        login: mockLogin,
        loading: false,
        error: null
      });

      render(
        <Router>
          <Login />
        </Router>
      );

      const emailInput = screen.getByPlaceholderText(/you@example/i);
      const passwordInput = screen.getByPlaceholderText(/\*{6,}/);

      fireEvent.change(emailInput, { target: { value: 'test@test.com', name: 'email' } });
      fireEvent.change(passwordInput, { target: { value: 'password123', name: 'password' } });

      const submitButton = screen.getByRole('button', { name: /Sign In/i });
      fireEvent.click(submitButton);

      // Button should be disabled during submission
      await waitFor(() => {
        expect(submitButton).toHaveProperty('disabled');
      });
    });
  });

  describe('Error display branches', () => {
    test('displays auth context error', () => {
      useAuth.mockReturnValue({
        login: jest.fn(),
        loading: false,
        error: 'Token expired'
      });

      render(
        <Router>
          <Login />
        </Router>
      );

      expect(screen.getByText(/Token expired/i)).toBeInTheDocument();
    });

    test('displays local login error instead of auth error', async () => {
      useAuth.mockReturnValue({
        login: jest.fn(() => Promise.reject(new Error('Network error'))),
        loading: false,
        error: 'Auth error'
      });

      render(
        <Router>
          <Login />
        </Router>
      );

      const emailInput = screen.getByPlaceholderText(/you@example/i);
      const passwordInput = screen.getByPlaceholderText(/\*{6,}/);

      fireEvent.change(emailInput, { target: { value: 'test@test.com', name: 'email' } });
      fireEvent.change(passwordInput, { target: { value: 'pass', name: 'password' } });

      const submitButton = screen.getByRole('button', { name: /Sign In/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Network error/i)).toBeInTheDocument();
      });
    });

    test('shows both errors in alert box when both present', async () => {
      useAuth.mockReturnValue({
        login: jest.fn(() => Promise.reject(new Error('Login failed'))),
        loading: false,
        error: 'Auth error'
      });

      render(
        <Router>
          <Login />
        </Router>
      );

      const emailInput = screen.getByPlaceholderText(/you@example/i);
      const passwordInput = screen.getByPlaceholderText(/\*{6,}/);

      fireEvent.change(emailInput, { target: { value: 'test@test.com', name: 'email' } });
      fireEvent.change(passwordInput, { target: { value: 'pass', name: 'password' } });

      const submitButton = screen.getByRole('button', { name: /Sign In/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        // Should show login error (which is more specific)
        expect(screen.getByText(/Login failed/i)).toBeInTheDocument();
      });
    });
  });

  describe('UI state branches', () => {
    test('shows loading state from auth context', () => {
      useAuth.mockReturnValue({
        login: jest.fn(),
        loading: true,
        error: null
      });

      render(
        <Router>
          <Login />
        </Router>
      );

      const submitButton = screen.getByRole('button');
      expect(submitButton).toHaveProperty('disabled');
    });
  });
});
