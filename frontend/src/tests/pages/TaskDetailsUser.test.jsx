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
});
