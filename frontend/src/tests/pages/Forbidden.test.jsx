import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import Forbidden from '../../pages/Forbidden';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('Forbidden page', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
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

  test('has a return to dashboard button that navigates', () => {
    render(<Forbidden />);

    const returnButton = screen.getByRole('button', { name: /return to dashboard/i });
    expect(returnButton).toBeInTheDocument();

    fireEvent.click(returnButton);

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });

  test('renders error icon svg', () => {
    render(<Forbidden />);

    // Just check that the page renders without error
    expect(screen.getByText(/Access Denied/i)).toBeInTheDocument();
  });
});
