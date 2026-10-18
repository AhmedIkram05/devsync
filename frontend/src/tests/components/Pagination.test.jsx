import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import Pagination from '../../components/Pagination';

describe('Pagination', () => {
  test('renders nothing without a pagination object', () => {
    const { container } = render(<Pagination pagination={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('shows total, current page, and enables both controls mid-list', () => {
    const onPageChange = jest.fn();
    render(
      <Pagination
        pagination={{ page: 2, per_page: 25, total: 60, pages: 3 }}
        onPageChange={onPageChange}
      />
    );

    expect(screen.getByText('Total: 60 items')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Prev' }));
    expect(onPageChange).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  test('disables Prev on the first page and Next on the last page', () => {
    const onPageChange = jest.fn();
    render(
      <Pagination
        pagination={{ page: 1, per_page: 25, total: 10, pages: 1 }}
        onPageChange={onPageChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Prev' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).not.toHaveBeenCalled();
  });

  test('accepts the audit-log alias field names', () => {
    render(
      <Pagination pagination={{ current_page: 3, total_pages: 5, total: 100, per_page: 20 }} />
    );

    expect(screen.getByText('Page 3 of 5')).toBeInTheDocument();
    expect(screen.getByText('Total: 100 items')).toBeInTheDocument();
  });
});
