import React from 'react';
import { render, screen } from '@testing-library/react';

import DeveloperProgressCard from '../../components/DeveloperProgressCard';

describe('DeveloperProgressCard component', () => {
  test('renders developer metrics', () => {
    render(
      <DeveloperProgressCard
        developer={{
          name: 'Avery',
          completedTasks: 8,
          pendingTasks: 3,
        }}
      />
    );

    expect(screen.getByText('Avery')).toBeInTheDocument();
    expect(screen.getByText('Completed Tasks: 8')).toBeInTheDocument();
    expect(screen.getByText('Pending Tasks: 3')).toBeInTheDocument();
  });
});
