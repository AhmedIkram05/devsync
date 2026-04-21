import React from 'react';
import { render, screen } from '@testing-library/react';

import LoadingSpinner from '../../components/LoadingSpinner';

describe('LoadingSpinner component', () => {
  test('renders default message', () => {
    render(<LoadingSpinner />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  test('renders custom message and supports hidden message state', () => {
    const { rerender } = render(<LoadingSpinner size="small" message="Syncing data" />);

    expect(screen.getByText('Syncing data')).toBeInTheDocument();

    rerender(<LoadingSpinner size="large" message="" />);
    expect(screen.queryByText('Syncing data')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });
});
