import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import CommentSection from '../../components/CommentSection';
import { useAuth } from '../../context/AuthContext';
import { taskService } from '../../services/utils/api';

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../services/utils/api', () => ({
  taskService: {
    addTaskComment: jest.fn(),
  },
}));

describe('CommentSection component', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    useAuth.mockReturnValue({
      currentUser: {
        id: 7,
        name: 'Dev User',
        email: 'dev@example.com',
      },
    });

    taskService.addTaskComment.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders existing comments and empty state fallback', () => {
    const { rerender } = render(
      <CommentSection
        taskId={1}
        comments={[
          {
            id: 101,
            author_name: 'Alice',
            content: 'Looks good to me',
            created_at: '2099-01-01T12:00:00.000Z',
          },
          {
            id: 102,
            author_name: 'Bob',
            content: 'Need more tests',
            created_at: 'invalid-date',
          },
        ]}
      />
    );

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Looks good to me')).toBeInTheDocument();
    expect(screen.getByText('Need more tests')).toBeInTheDocument();
    expect(screen.getByText('Invalid date')).toBeInTheDocument();

    rerender(<CommentSection taskId={1} comments={[]} />);

    expect(screen.getByText(/No comments yet. Be the first to add one!/i)).toBeInTheDocument();
  });

  test('submits trimmed comment and notifies parent callback', async () => {
    const onCommentAdded = jest.fn();
    taskService.addTaskComment.mockResolvedValue({
      id: 500,
      content: 'New comment',
    });

    render(<CommentSection taskId={42} comments={[]} onCommentAdded={onCommentAdded} />);

    const submitButton = screen.getByRole('button', { name: /post comment/i });
    expect(submitButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/add your comment/i), {
      target: { value: '   New comment   ' },
    });

    expect(submitButton).not.toBeDisabled();

    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(taskService.addTaskComment).toHaveBeenCalledWith(42, {
        content: 'New comment',
        author_id: 7,
        author_name: 'Dev User',
      });
    });

    expect(onCommentAdded).toHaveBeenCalledWith({ id: 500, content: 'New comment' });
    expect(screen.getByPlaceholderText(/add your comment/i)).toHaveValue('');
  });

  test('shows error message when comment submission fails', async () => {
    taskService.addTaskComment.mockRejectedValue(new Error('network failure'));

    render(<CommentSection taskId={99} comments={[]} />);

    fireEvent.change(screen.getByPlaceholderText(/add your comment/i), {
      target: { value: 'Please review' },
    });

    fireEvent.click(screen.getByRole('button', { name: /post comment/i }));

    expect(await screen.findByText(/Failed to post comment. Please try again./i)).toBeInTheDocument();
    expect(console.error).toHaveBeenCalledWith('Failed to post comment:', expect.any(Error));
  });
});
