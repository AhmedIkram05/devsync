import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import ProgressBar from '../../components/ProgressBar';

describe('ProgressBar component', () => {
  test('renders non-interactive progress display across common ranges', () => {
    const { rerender } = render(<ProgressBar progress={20} />);

    expect(screen.getByText('Progress: 20%')).toBeInTheDocument();

    rerender(<ProgressBar progress={55} />);
    expect(screen.getByText('Progress: 55%')).toBeInTheDocument();

    rerender(<ProgressBar progress={90} />);
    expect(screen.getByText('Progress: 90%')).toBeInTheDocument();
  });

  test('updates slider value and calls onChange when drag completes', () => {
    const onChange = jest.fn();

    render(<ProgressBar progress={40} onChange={onChange} />);

    const slider = screen.getByRole('slider');

    fireEvent.change(slider, { target: { value: '85' } });
    fireEvent.mouseDown(slider);
    fireEvent.mouseEnter(slider);

    expect(screen.getAllByText('85%').length).toBeGreaterThan(0);

    fireEvent.mouseUp(slider);

    expect(onChange).toHaveBeenCalledWith(85);
    expect(screen.getByText('Not Started')).toBeInTheDocument();
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });

  test('prevents progress changes when disabled', () => {
    const onChange = jest.fn();

    render(<ProgressBar progress={60} onChange={onChange} disabled />);

    const slider = screen.getByRole('slider');

    fireEvent.change(slider, { target: { value: '75' } });
    fireEvent.mouseDown(slider);
    fireEvent.mouseUp(slider);

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText('Not Started')).not.toBeInTheDocument();
  });
});
