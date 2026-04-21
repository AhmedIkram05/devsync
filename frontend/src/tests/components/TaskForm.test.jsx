import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import TaskForm from '../../components/TaskForm';

describe('TaskForm component', () => {
  test('renders default create form and submits entered values', () => {
    const onSubmit = jest.fn();

    render(
      <TaskForm
        onSubmit={onSubmit}
        users={[
          { id: 1, name: 'Alice' },
          { id: 2, email: 'bob@example.com' },
        ]}
        projects={[
          { id: 10, name: 'Platform' },
          { id: 11, name: 'Mobile' },
        ]}
      />
    );

    fireEvent.change(screen.getByLabelText(/Task Title/i), {
      target: { value: 'Implement report export' },
    });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: 'Support csv and json formats' },
    });
    fireEvent.change(screen.getByLabelText(/Assignee/i), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText(/Project/i), {
      target: { value: '11' },
    });
    fireEvent.change(screen.getByLabelText(/Status/i), {
      target: { value: 'in_progress' },
    });
    fireEvent.change(screen.getByLabelText(/Priority/i), {
      target: { value: 'high' },
    });
    fireEvent.change(screen.getByLabelText(/Deadline/i), {
      target: { value: '2099-01-15' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create task/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Implement report export',
      description: 'Support csv and json formats',
      assignee: '2',
      project: '11',
      deadline: '2099-01-15',
      status: 'in_progress',
      priority: 'high',
    });
  });

  test('hydrates initial data and shows update button label', () => {
    const onSubmit = jest.fn();

    render(
      <TaskForm
        onSubmit={onSubmit}
        initialData={{
          id: 9,
          title: 'Existing task',
          description: 'Existing description',
          assigned_to: 7,
          project_id: 3,
          deadline: '2099-03-20T00:00:00.000Z',
          status: 'review',
          priority: 'low',
        }}
        users={[{ id: 7, name: 'Current Dev' }]}
        projects={[{ id: 3, name: 'Core Project' }]}
      />
    );

    expect(screen.getByDisplayValue('Existing task')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Existing description')).toBeInTheDocument();
    expect(screen.getByLabelText(/Assignee/i)).toHaveValue('7');
    expect(screen.getByLabelText(/Project/i)).toHaveValue('3');
    expect(screen.getByLabelText(/Deadline/i)).toHaveValue('2099-03-20');
    expect(screen.getByLabelText(/Status/i)).toHaveValue('review');
    expect(screen.getByLabelText(/Priority/i)).toHaveValue('low');

    expect(screen.getByRole('button', { name: /update task/i })).toBeInTheDocument();
  });
});
