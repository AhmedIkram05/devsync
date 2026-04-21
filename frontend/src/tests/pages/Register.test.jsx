import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import Register from '../../pages/Register';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const fillRequiredFields = () => {
  fireEvent.change(screen.getByPlaceholderText('John Doe'), {
    target: { name: 'name', value: 'Dev User' },
  });
  fireEvent.change(screen.getByPlaceholderText('john@example.com'), {
    target: { name: 'email', value: 'dev@example.com' },
  });

  const passwordInputs = screen.getAllByPlaceholderText('********');
  fireEvent.change(passwordInputs[0], {
    target: { name: 'password', value: 'password123' },
  });
  fireEvent.change(passwordInputs[1], {
    target: { name: 'confirmPassword', value: 'password123' },
  });
};

const renderRegister = () => {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Register />
    </MemoryRouter>
  );
};

describe('Register page', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    mockNavigate.mockReset();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test('shows validation error when required fields are missing', async () => {
    renderRegister();

    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    expect(await screen.findByText(/Please fill all required fields/i)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('shows validation error when passwords do not match', async () => {
    renderRegister();

    fireEvent.change(screen.getByPlaceholderText('John Doe'), {
      target: { name: 'name', value: 'Dev User' },
    });
    fireEvent.change(screen.getByPlaceholderText('john@example.com'), {
      target: { name: 'email', value: 'dev@example.com' },
    });

    const passwordInputs = screen.getAllByPlaceholderText('********');
    fireEvent.change(passwordInputs[0], {
      target: { name: 'password', value: 'password123' },
    });
    fireEvent.change(passwordInputs[1], {
      target: { name: 'confirmPassword', value: 'different' },
    });

    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    expect(await screen.findByText(/Passwords don't match/i)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('shows validation error when password is shorter than 8 characters', async () => {
    renderRegister();

    fireEvent.change(screen.getByPlaceholderText('John Doe'), {
      target: { name: 'name', value: 'Dev User' },
    });
    fireEvent.change(screen.getByPlaceholderText('john@example.com'), {
      target: { name: 'email', value: 'dev@example.com' },
    });

    const passwordInputs = screen.getAllByPlaceholderText('********');
    fireEvent.change(passwordInputs[0], {
      target: { name: 'password', value: 'short' },
    });
    fireEvent.change(passwordInputs[1], {
      target: { name: 'confirmPassword', value: 'short' },
    });

    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    expect(await screen.findByText(/Password must be at least 8 characters/i)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('submits registration payload and redirects to login after success', async () => {
    jest.useFakeTimers();

    global.fetch.mockResolvedValue({
      ok: true,
      status: 201,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          message: 'Registration successful',
          user: { id: 1, email: 'dev@example.com' },
        })
      ),
    });

    renderRegister();

    fillRequiredFields();
    fireEvent.change(screen.getByRole('combobox'), {
      target: { name: 'role', value: 'admin' },
    });

    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/v1/auth/register');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({
      name: 'Dev User',
      email: 'dev@example.com',
      password: 'password123',
      role: 'admin',
    });

    expect(await screen.findByText(/Registration successful! Redirecting to login/i)).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });

  test('shows backend error message when registration request fails', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          message: 'Email already exists',
        })
      ),
    });

    renderRegister();

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    expect(await screen.findByText(/Email already exists/i)).toBeInTheDocument();
  });

  test('shows raw server text when non-JSON error response is returned', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 502,
      text: jest.fn().mockResolvedValue('Bad gateway from upstream'),
    });

    renderRegister();

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    expect(await screen.findByText(/Server error: Bad gateway from upstream/i)).toBeInTheDocument();
  });
});
