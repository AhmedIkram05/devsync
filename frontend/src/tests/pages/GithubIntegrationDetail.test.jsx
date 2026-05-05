import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import GitHubIntegrationDetail from '../../pages/GithubIntegrationDetail';
import { githubService } from '../../services/github';
import { taskService } from '../../services/utils/api';

const mockNavigate = jest.fn();
const mockUseParams = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  Link: ({ to, children, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => mockNavigate,
  useParams: () => mockUseParams(),
}));

jest.mock('../../services/github', () => ({
  githubService: {
    getUserRepos: jest.fn(),
    getIssues: jest.fn(),
    getPullRequests: jest.fn(),
    linkTaskToGithub: jest.fn(),
  },
}));

jest.mock('../../services/utils/api', () => ({
  taskService: {
    getAllTasks: jest.fn(),
  },
}));

jest.mock('../../components/LoadingSpinner', () => (props) => (
  <div>{props.size === 'small' ? 'Loading small' : 'Loading'}</div>
));

describe('GithubIntegrationDetail page', () => {
  const baseRepository = {
    id: 1,
    name: 'devsync',
    full_name: 'org/devsync',
    private: false,
    description: 'Repository description',
    language: 'JavaScript',
    updated_at: '2099-01-01T00:00:00.000Z',
    stargazers_count: 5,
    forks_count: 2,
    html_url: 'https://github.com/org/devsync',
  };

  const baseIssue = {
    id: 501,
    number: 42,
    title: 'Fix OAuth callback flow',
    html_url: 'https://github.com/org/devsync/issues/42',
    created_at: '2099-01-02T00:00:00.000Z',
    user: { login: 'octocat' },
    body: 'Issue body text',
    labels: [{ id: 1, name: 'bug' }],
  };

  const basePullRequest = {
    id: 701,
    number: 7,
    title: 'Add login redirect',
    html_url: 'https://github.com/org/devsync/pull/7',
    created_at: '2099-01-03T00:00:00.000Z',
    user: { login: 'octocat' },
    body: 'Pull request body text',
    labels: [{ id: 9, name: 'feature' }],
    draft: false,
    merged: false,
    state: 'open',
  };

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    mockNavigate.mockReset();
    mockUseParams.mockReset();
    mockUseParams.mockReturnValue({ repoId: '1' });

    githubService.getUserRepos.mockReset();
    githubService.getIssues.mockReset();
    githubService.getPullRequests.mockReset();
    githubService.linkTaskToGithub.mockReset();
    taskService.getAllTasks.mockReset();

    githubService.getUserRepos.mockResolvedValue([baseRepository]);
    githubService.getIssues.mockResolvedValue({ issues: [baseIssue] });
    githubService.getPullRequests.mockResolvedValue({ pull_requests: [] });
    githubService.linkTaskToGithub.mockResolvedValue({ success: true });
    taskService.getAllTasks.mockResolvedValue([
      { id: 11, title: 'Investigate webhook delays', status: 'in_progress' },
      { id: 12, title: 'Archive sprint report', status: 'completed' },
    ]);

    window.alert = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('navigates back to github page when repo id is missing', async () => {
    mockUseParams.mockReturnValue({});

    render(<GitHubIntegrationDetail />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/github');
    });
  });

  test('renders repository data, filters tasks, and links selected issue to a task', async () => {
    render(<GitHubIntegrationDetail />);

    expect(await screen.findByText('devsync')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Investigate webhook delays/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Archive sprint report/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: /link to task/i }));

    await waitFor(() => {
      expect(githubService.linkTaskToGithub).toHaveBeenCalledWith(
        '11',
        expect.objectContaining({
          repo_id: '1',
          repo_name: 'org/devsync',
          issue_id: 501,
          issue_number: 42,
          issue_title: 'Fix OAuth callback flow',
        })
      );
    });

    expect(await screen.findByText(/Successfully linked issue #42 to task!/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  test('shows empty states when no active tasks or issues are available', async () => {
    taskService.getAllTasks.mockResolvedValue([
      { id: 22, title: 'Done item', status: 'completed' },
    ]);
    githubService.getIssues.mockResolvedValue([]);
    githubService.getPullRequests.mockResolvedValue([]);

    render(<GitHubIntegrationDetail />);

    expect(await screen.findByText('devsync')).toBeInTheDocument();
    expect(screen.getByText(/No available tasks found. Please create a task first./i)).toBeInTheDocument();
    expect(screen.getByText(/No issues found in this repository./i)).toBeInTheDocument();
    expect(screen.getByText(/No pull requests found in this repository./i)).toBeInTheDocument();
  });

  test('shows repository fetch error view when repository cannot be found', async () => {
    githubService.getUserRepos.mockResolvedValue([{ ...baseRepository, id: 99 }]);

    render(<GitHubIntegrationDetail />);

    expect(
      await screen.findByText(/Failed to fetch repository data. Please try again./i)
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to GitHub Integration/i })).toHaveAttribute('href', '/github');
    expect(githubService.getIssues).not.toHaveBeenCalled();
    expect(githubService.getPullRequests).not.toHaveBeenCalled();
  });

  test('shows linking error when issue linking request fails', async () => {
    githubService.linkTaskToGithub.mockRejectedValue(new Error('linking failed'));

    render(<GitHubIntegrationDetail />);

    expect(await screen.findByText('devsync')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: /link to task/i }));

    expect(
      await screen.findByText(/Failed to link issue to task. Please try again./i)
    ).toBeInTheDocument();
  });

  test('alerts when selected issue id is missing from the issue payload', async () => {
    githubService.getIssues.mockResolvedValue([
      { ...baseIssue, id: null },
    ]);

    render(<GitHubIntegrationDetail />);

    expect(await screen.findByText('devsync')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: /link to task/i }));

    expect(window.alert).toHaveBeenCalledWith('Please select a task to link with this issue');
    expect(githubService.linkTaskToGithub).not.toHaveBeenCalled();
  });

  test('keeps repository view working when loading tasks fails', async () => {
    taskService.getAllTasks.mockRejectedValue(new Error('task API unavailable'));

    render(<GitHubIntegrationDetail />);

    expect(await screen.findByText('devsync')).toBeInTheDocument();
    expect(screen.getByText(/No available tasks found. Please create a task first./i)).toBeInTheDocument();
  });

  test('links selected pull request to a task', async () => {
    githubService.getIssues.mockResolvedValue([]);
    githubService.getPullRequests.mockResolvedValue({ pull_requests: [basePullRequest] });

    render(<GitHubIntegrationDetail />);

    await screen.findByRole('link', { name: /#7 Add login redirect/i });

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: /link to task/i }));

    await waitFor(() => {
      expect(githubService.linkTaskToGithub).toHaveBeenCalledWith(
        '11',
        expect.objectContaining({
          repo_id: '1',
          repo_name: 'org/devsync',
          pull_request_number: 7,
          pull_request_title: 'Add login redirect',
        })
      );
    });

    expect(await screen.findByText(/Successfully linked PR #7 to task!/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('');
  });
});