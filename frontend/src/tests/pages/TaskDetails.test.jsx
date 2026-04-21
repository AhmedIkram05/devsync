import React from 'react';
import { render, screen } from '@testing-library/react';

import TaskDetails from '../../pages/TaskDetails';

jest.mock('../../components/ProgressBar', () => ({ progress }) => (
  <div>Progress Value: {progress}</div>
));

jest.mock('../../components/CommentSection', () => ({ comments }) => (
  <div>Comments count: {comments.length}</div>
));

describe('TaskDetails page', () => {
  test('renders task content and child component props', () => {
    render(<TaskDetails />);

    expect(screen.getByText('Task Details')).toBeInTheDocument();
    expect(screen.getByText('Fix API Bug')).toBeInTheDocument();
    expect(screen.getByText('Resolve authentication issues')).toBeInTheDocument();
    expect(screen.getByText('Deadline: 2025-02-25')).toBeInTheDocument();
    expect(screen.getByText('Progress Value: 50')).toBeInTheDocument();
    expect(screen.getByText('Comments count: 2')).toBeInTheDocument();
  });
});
