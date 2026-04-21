import React from 'react';
import { render, screen } from '@testing-library/react';

import TaskCard from '../../components/TaskCard';

describe('TaskCard component', () => {
  test('renders task summary fields and update action', () => {
    render(
      <TaskCard
        task={{
          title: 'Fix notification delivery',
          description: 'Handle reconnect and retry logic',
          deadline: '2099-03-15',
          progress: 65,
        }}
      />
    );

    expect(screen.getByText('Fix notification delivery')).toBeInTheDocument();
    expect(screen.getByText('Handle reconnect and retry logic')).toBeInTheDocument();
    expect(screen.getByText('Deadline: 2099-03-15')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Update Progress/i })).toBeInTheDocument();
  });
});
