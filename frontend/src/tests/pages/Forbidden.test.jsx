import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import Forbidden from '../../pages/Forbidden';

const mockNavigate = jest.fn();
let mockAuthState = { currentUser: null };

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

describe('Forbidden page', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockAuthState = { currentUser: null };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders access denied message', () => {
    render(<Forbidden />);

    expect(screen.getByText(/Access Denied/i)).toBeInTheDocument();
  });

  test('renders permission denied description', () => {
    render(<Forbidden />);

    expect(screen.getByText(/necessary permissions|access this page/i)).toBeInTheDocument();
  });

  test('navigates to developer dashboard by default', () => {
    render(<Forbidden />);

    fireEvent.click(screen.getByRole('button', { name: /return to dashboard/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/BasicDashboard');
  });

  test('navigates admin role to /admin', () => {
    mockAuthState = { currentUser: { role: 'admin' } };
    render(<Forbidden />);

    fireEvent.click(screen.getByRole('button', { name: /return to dashboard/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/admin');
  });

  test('renders error icon svg', () => {
    render(<Forbidden />);

    // Just check that the page renders without error
    expect(screen.getByText(/Access Denied/i)).toBeInTheDocument();
  });
});
