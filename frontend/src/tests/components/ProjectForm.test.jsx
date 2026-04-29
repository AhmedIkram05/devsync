import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import ProjectForm from '../../components/ProjectForm';

describe('ProjectForm component', () => {
  test('submits normalized payload with team members', () => {
    const onSubmit = jest.fn();

    render(
      <ProjectForm
        onSubmit={onSubmit}
        users={[
          { id: 1, name: 'Alex', role: 'developer' },
          { id: 2, name: 'Jordan', role: 'qa' },
        ]}
      />
    );

    fireEvent.change(screen.getByLabelText(/Project Name/i), {
      target: { value: '  Platform Refresh  ' },
    });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: 'Refresh core APIs' },
    });
    fireEvent.change(screen.getByLabelText(/Status/i), {
      target: { value: 'on_hold' },
    });
    fireEvent.change(screen.getByLabelText(/GitHub Repository URL/i), {
      target: { value: 'https://github.com/org/platform' },
    });

    fireEvent.click(screen.getByLabelText(/Alex/i));
    fireEvent.click(screen.getByLabelText(/Jordan/i));

    fireEvent.click(screen.getByRole('button', { name: /save project/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Platform Refresh',
      description: 'Refresh core APIs',
      status: 'on_hold',
      github_repo: 'https://github.com/org/platform',
      team_members: [1, 2],
    });
  });

  test('requires description when configured', () => {
    const onSubmit = jest.fn();

    render(
      <ProjectForm
        onSubmit={onSubmit}
        requireDescription={true}
      />
    );

    fireEvent.change(screen.getByLabelText(/Project Name/i), {
      target: { value: 'Ops revamp' },
    });

    fireEvent.click(screen.getByRole('button', { name: /save project/i }));

    expect(screen.getByText(/Project description is required/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('hydrates initial data and selected members', () => {
    const onSubmit = jest.fn();

    render(
      <ProjectForm
        onSubmit={onSubmit}
        initialData={{
          name: 'Shipping Lane',
          description: 'Logistics rework',
          status: 'on-hold',
          github_repo: 'https://github.com/org/logistics',
          team_members: [{ id: 4 }, 5],
        }}
        users={[
          { id: 4, name: 'Sam', role: 'developer' },
          { id: 5, name: 'Taylor', role: 'qa' },
        ]}
      />
    );

    expect(screen.getByDisplayValue('Shipping Lane')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Logistics rework')).toBeInTheDocument();
    expect(screen.getByLabelText(/Status/i)).toHaveValue('on_hold');
    expect(screen.getByDisplayValue('https://github.com/org/logistics')).toBeInTheDocument();

    expect(screen.getByLabelText(/Sam/i)).toBeChecked();
    expect(screen.getByLabelText(/Taylor/i)).toBeChecked();
  });
});
