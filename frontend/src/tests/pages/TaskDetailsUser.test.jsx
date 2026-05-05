import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import TaskDetailsUser from '../../pages/TaskDetailsUser';
import { taskService, githubService } from '../../services/utils/api';
import { useAuth } from '../../context/AuthContext';

const mockNavigate = jest.fn();
const mockUseParams = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useParams: () => mockUseParams(),
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../services/utils/api', () => ({
  taskService: {
    getTaskById: jest.fn(),
    getTaskComments: jest.fn(),
    updateTask: jest.fn(),
    addTaskComment: jest.fn(),
    getUsers: jest.fn(),
    getProjects: jest.fn(),
  },
  githubService: {
    getUserRepos: jest.fn(),
    getIssues: jest.fn(),
    linkTaskToGithub: jest.fn(),
    unlinkTaskFromGithub: jest.fn(),
  },
}));

jest.mock('../../components/LoadingSpinner', () => () => <div>Loading task</div>);

jest.mock('../../components/ProgressBar', () => (props) => (
  <div>
    <span>Progress Value: {props.progress}</span>
    <button onClick={() => props.onChange(100)} disabled={props.disabled}>
      Set Progress Complete
    </button>
  </div>
));

describe('TaskDetailsUser page', () => {
  const baseTask = {
    id: 1,
    title: 'Implement notifications',
    description: 'Implement and verify notification flows',
    status: 'in_progress',
    progress: 40,
    priority: 'high',
    assignee_name: 'Dev User',
    created_at: '2099-01-01T00:00:00.000Z',
    deadline: '2099-02-01T00:00:00.000Z',
    github_links: [],
  };

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    mockNavigate.mockReset();
    mockUseParams.mockReturnValue({ id: '1' });
    useAuth.mockReturnValue({ currentUser: { id: 5, name: 'Dev User', email: 'dev@example.com' } });

    taskService.getTaskById.mockReset();
    taskService.getTaskComments.mockReset();
    taskService.updateTask.mockReset();
    taskService.addTaskComment.mockReset();
    taskService.getUsers.mockReset();
    taskService.getProjects.mockReset();

    githubService.getUserRepos.mockReset();
    githubService.getIssues.mockReset();
    githubService.linkTaskToGithub.mockReset();
    githubService.unlinkTaskFromGithub.mockReset();

    taskService.getTaskById.mockResolvedValue(baseTask);
    taskService.getTaskComments.mockResolvedValue([
      {
        id: 1,
        author_name: 'Teammate',
        content: 'Looks good',
        created_at: '2099-01-02T00:00:00.000Z',
      },
    ]);
    taskService.updateTask.mockResolvedValue({ success: true });
    taskService.addTaskComment.mockResolvedValue({
      id: 2,
      author_name: 'Dev User',
      content: 'Ready for review',
      created_at: '2099-01-03T00:00:00.000Z',
    });
    taskService.getUsers.mockResolvedValue([{ id: 5, name: 'Dev User', email: 'dev@example.com' }]);
    taskService.getProjects.mockResolvedValue([{ id: 10, name: 'Core Platform' }]);

    githubService.getUserRepos.mockResolvedValue([]);
    githubService.getIssues.mockResolvedValue([]);
    githubService.linkTaskToGithub.mockResolvedValue({ success: true });
    githubService.unlinkTaskFromGithub.mockResolvedValue({ success: true });

    window.confirm = jest.fn(() => false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('loads task details, updates progress, and posts comments', async () => {
    render(<TaskDetailsUser />);

    expect(await screen.findByText('Implement notifications')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Set Progress Complete' }));

    await waitFor(() => {
      expect(taskService.updateTask).toHaveBeenCalledWith('1', { progress: 100 });
    });

    fireEvent.change(screen.getByPlaceholderText(/add a comment/i), {
      target: { value: 'Ready for review' },
    });
    fireEvent.click(screen.getByRole('button', { name: /post comment/i }));

    await waitFor(() => {
      expect(taskService.addTaskComment).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({
          content: 'Ready for review',
          author_id: 5,
          author_name: 'Dev User',
        })
      );
    });

    expect(await screen.findByText('Ready for review')).toBeInTheDocument();
  });

  test('links selected GitHub issue to the task', async () => {
    githubService.getUserRepos.mockResolvedValue([{ id: 10, full_name: 'org/repo' }]);
    githubService.getIssues.mockResolvedValue([{ id: 100, number: 12, title: 'Fix OAuth callback' }]);

    render(<TaskDetailsUser />);

    expect(await screen.findByText('Link GitHub Issue:')).toBeInTheDocument();

    let selects = await screen.findAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: '10' } });

    await waitFor(() => {
      expect(githubService.getIssues).toHaveBeenCalledWith('10');
    });

    await screen.findByRole('option', { name: /Fix OAuth callback/i });
    selects = screen.getAllByRole('combobox');

    fireEvent.change(selects[1], { target: { value: '100' } });

    await waitFor(() => {
      expect(githubService.linkTaskToGithub).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({
          repo_id: 10,
          issue_id: 100,
          issue_number: 12,
          repo_name: 'org/repo',
        })
      );
    });
  });

  test('shows error view and supports navigation back when task loading fails', async () => {
    taskService.getTaskById.mockRejectedValue(new Error('failed to load task'));

    render(<TaskDetailsUser />);

    expect(await screen.findByText(/Failed to fetch task details/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /back to tasks/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/tasks');
  });

  test('shows "Task not found" when getTaskById returns null', async () => {
    taskService.getTaskById.mockResolvedValue(null);
    taskService.getTaskComments.mockResolvedValue([]);
    githubService.getUserRepos.mockResolvedValue([]);

    render(<TaskDetailsUser />);

    expect(await screen.findByText('Task not found')).toBeInTheDocument();
  });

  test('completed task hides the progress update section', async () => {
    taskService.getTaskById.mockResolvedValue({ ...baseTask, status: 'done', github_links: [] });
    taskService.getTaskComments.mockResolvedValue([]);
    githubService.getUserRepos.mockResolvedValue([]);

    render(<TaskDetailsUser />);

    await screen.findByText('Implement notifications');
    expect(screen.queryByText('Update Progress')).not.toBeInTheDocument();
  });

  test('"completed" status also hides progress section', async () => {
    taskService.getTaskById.mockResolvedValue({ ...baseTask, status: 'completed', github_links: [] });
    taskService.getTaskComments.mockResolvedValue([]);
    githubService.getUserRepos.mockResolvedValue([]);

    render(<TaskDetailsUser />);

    await screen.findByText('Implement notifications');
    expect(screen.queryByText('Update Progress')).not.toBeInTheDocument();
  });

  test('shows existing github links and unlinks them', async () => {
    const linkedTask = {
      ...baseTask,
      status: 'in_progress',
      github_links: [{ id: 42, repo_name: 'org/repo', issue_number: 7, issue_title: 'Fix bug' }],
    };
    taskService.getTaskById.mockResolvedValue(linkedTask);
    taskService.getTaskComments.mockResolvedValue([]);
    githubService.getUserRepos.mockResolvedValue([]);
    githubService.unlinkTaskFromGithub.mockResolvedValue({ success: true });

    render(<TaskDetailsUser />);

    expect(await screen.findByText(/Fix bug/i)).toBeInTheDocument();
    expect(screen.getByText('#7 - Fix bug')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /unlink/i }));

    await waitFor(() => {
      expect(githubService.unlinkTaskFromGithub).toHaveBeenCalledWith('1', 42);
    });
    await waitFor(() => {
      expect(screen.queryByText('#7 - Fix bug')).not.toBeInTheDocument();
    });
  });

  test('clears issues when empty repo value is selected', async () => {
    githubService.getUserRepos.mockResolvedValue([{ id: 10, full_name: 'org/r' }]);
    githubService.getIssues.mockResolvedValue([{ id: 50, number: 1, title: 'Issue one' }]);

    render(<TaskDetailsUser />);
    await screen.findByText('Implement notifications');

    const selects = await screen.findAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: '10' } });
    await waitFor(() => expect(githubService.getIssues).toHaveBeenCalledWith('10'));

    // Select empty again
    fireEvent.change(selects[0], { target: { value: '' } });
    await waitFor(() => expect(screen.queryByText(/Issue one/i)).not.toBeInTheDocument());
  });

  test('post comment button disabled when textarea is empty', async () => {
    taskService.getTaskComments.mockResolvedValue([]);
    githubService.getUserRepos.mockResolvedValue([]);

    render(<TaskDetailsUser />);
    await screen.findByText('Implement notifications');

    const submitBtn = screen.getByRole('button', { name: /post comment/i });
    expect(submitBtn).toBeDisabled();
  });

  test('progress sets to 100 and confirms completion', async () => {
    window.confirm = jest.fn(() => true);
    taskService.getTaskComments.mockResolvedValue([]);
    githubService.getUserRepos.mockResolvedValue([]);

    render(<TaskDetailsUser />);
    await screen.findByText('Implement notifications');

    fireEvent.click(screen.getByRole('button', { name: 'Set Progress Complete' }));

    await waitFor(() => {
      expect(taskService.updateTask).toHaveBeenCalledWith('1', { progress: 100 });
    });
    await waitFor(() => {
      expect(taskService.updateTask).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({ status: 'done' })
      );
    });
  });

  test('renders high and low priority labels', async () => {
    taskService.getTaskComments.mockResolvedValue([]);
    githubService.getUserRepos.mockResolvedValue([]);

    // High priority
    taskService.getTaskById.mockResolvedValueOnce({ ...baseTask, priority: 'high', github_links: [] });
    const { unmount } = render(<TaskDetailsUser />);
    expect(await screen.findByText('High')).toBeInTheDocument();
    unmount();

    // Low priority
    taskService.getTaskById.mockResolvedValueOnce({ ...baseTask, priority: 'low', github_links: [] });
    taskService.getTaskComments.mockResolvedValue([]);
    githubService.getUserRepos.mockResolvedValue([]);
    render(<TaskDetailsUser />);
    expect(await screen.findByText('Low')).toBeInTheDocument();
  });

  test('renders status badges for todo and backlog tasks', async () => {
    taskService.getTaskComments.mockResolvedValue([]);
    githubService.getUserRepos.mockResolvedValue([]);

    taskService.getTaskById.mockResolvedValueOnce({ ...baseTask, status: 'todo', github_links: [] });
    const { unmount } = render(<TaskDetailsUser />);
    expect(await screen.findByText('To Do')).toBeInTheDocument();
    unmount();

    taskService.getTaskById.mockResolvedValueOnce({ ...baseTask, status: 'backlog', github_links: [] });
    taskService.getTaskComments.mockResolvedValue([]);
    githubService.getUserRepos.mockResolvedValue([]);
    render(<TaskDetailsUser />);
    expect(await screen.findByText('Backlog')).toBeInTheDocument();
  });

  test('formatDate handles null created_at and renders Invalid Date for bad deadline', async () => {
    taskService.getTaskById.mockResolvedValue({
      ...baseTask,
      created_at: null,
      deadline: 'not-a-date', // truthy string → deadline span renders, but with "Invalid Date"
      github_links: [],
    });
    taskService.getTaskComments.mockResolvedValue([]);
    githubService.getUserRepos.mockResolvedValue([]);

    render(<TaskDetailsUser />);
    await screen.findByText('Implement notifications');
    // The deadline span is shown because 'not-a-date' is truthy; it contains "Invalid Date"
    expect(screen.getByText(/Invalid Date/i)).toBeInTheDocument();
  });

  test('shows No comments yet when task has no comments', async () => {
    taskService.getTaskComments.mockResolvedValue([]);
    githubService.getUserRepos.mockResolvedValue([]);

    render(<TaskDetailsUser />);
    expect(await screen.findByText('No comments yet')).toBeInTheDocument();
  });

  test('Connect GitHub account link shown when no repos available', async () => {
    taskService.getTaskComments.mockResolvedValue([]);
    githubService.getUserRepos.mockResolvedValue([]);

    render(<TaskDetailsUser />);
    expect(await screen.findByText(/Connect GitHub Account/i)).toBeInTheDocument();
  });

  test('allows admin to edit and save task details', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 1, role: 'admin', name: 'Admin User', email: 'admin@example.com' } });
    taskService.getTaskById
      .mockResolvedValueOnce(baseTask)
      .mockResolvedValueOnce({
        ...baseTask,
        title: 'Updated notifications task',
        description: 'Updated description',
        priority: 'medium',
      });

    render(<TaskDetailsUser />);

    expect(await screen.findByText('Implement notifications')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /edit task/i }));

    expect(await screen.findByRole('button', { name: /update task/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/task title/i), {
      target: { value: 'Updated notifications task' },
    });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: 'Updated description' },
    });
    fireEvent.change(screen.getByLabelText(/priority/i), {
      target: { value: 'medium' },
    });

    fireEvent.click(screen.getByRole('button', { name: /update task/i }));

    await waitFor(() => {
      expect(taskService.updateTask).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({
          title: 'Updated notifications task',
          description: 'Updated description',
          priority: 'medium',
        })
      );
    });

    expect(await screen.findByText('Updated notifications task')).toBeInTheDocument();
  });

  test('hides edit task button for non-admin and non-team-lead users', async () => {
    useAuth.mockReturnValue({ currentUser: { id: 5, role: 'developer', name: 'Dev User', email: 'dev@example.com' } });

    render(<TaskDetailsUser />);

    expect(await screen.findByText('Implement notifications')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit task/i })).not.toBeInTheDocument();
  });
});
