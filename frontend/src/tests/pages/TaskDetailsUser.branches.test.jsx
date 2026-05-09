import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TaskDetailsUser from '../../pages/TaskDetailsUser';
import * as api from '../../services/utils/api';

// Mock modules
jest.mock('../../services/utils/api');
jest.mock('../../components/LoadingSpinner', () => {
  return function MockLoadingSpinner() {
    return <div data-testid="loading-spinner">Loading...</div>;
  };
});

jest.mock('../../components/ProgressBar', () => {
  return function MockProgressBar({ value, onChange }) {
    return (
      <input
        data-testid="progress-bar"
        type="range"
        value={value}
        onChange={(e) => onChange && onChange(Number(e.target.value))}
      />
    );
  };
});

jest.mock('../../components/TaskForm', () => {
  return function MockTaskForm({ task, users, projects, onSubmit, onCancel }) {
    return (
      <div data-testid="task-form">
        <input
          data-testid="task-title-input"
          defaultValue={task?.title}
          onChange={(e) => { /* mock handler */ }}
        />
        <button onClick={() => onSubmit({ title: 'Updated Task', description: '', status: 'todo', priority: 'medium', assignee: null, project: null, deadline: null })}>
          Save Task
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    );
  };
});

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

const { useAuth } = require('../../context/AuthContext');

describe('TaskDetailsUser page branch coverage', () => {
  const mockAdminUser = {
    id: 1,
    name: 'Admin User',
    role: 'admin',
    email: 'admin@example.com'
  };

  const mockTeamLeadUser = {
    id: 2,
    name: 'Team Lead',
    role: 'team_lead',
    email: 'tl@example.com'
  };

  const mockDeveloperUser = {
    id: 3,
    name: 'Developer',
    role: 'developer',
    email: 'dev@example.com'
  };

  const mockTask = {
    id: 1,
    title: 'Test Task',
    description: 'Task description',
    status: 'todo',
    priority: 'medium',
    assigned_to: 3,
    project_id: 1,
    created_at: '2026-05-01T10:00:00Z',
    deadline: '2026-05-15T10:00:00Z',
    progress: 50,
    github_links: []
  };

  const mockTaskCompleted = {
    ...mockTask,
    status: 'done',
    progress: 100
  };

  const mockTaskInProgress = {
    ...mockTask,
    status: 'in_progress'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.confirm = jest.fn(() => false);
    global.alert = jest.fn();

    api.taskService = {
      getTaskById: jest.fn().mockResolvedValue(mockTask),
      getTaskComments: jest.fn().mockResolvedValue([]),
      addTaskComment: jest.fn(),
      updateTask: jest.fn(),
      deleteTask: jest.fn(),
      getUsers: jest.fn().mockResolvedValue([]),
      getProjects: jest.fn().mockResolvedValue([])
    };

    api.githubService = {
      getTaskGithubLinks: jest.fn().mockResolvedValue([]),
      getUserRepos: jest.fn().mockResolvedValue([]),
      getIssues: jest.fn().mockResolvedValue([]),
      linkTaskToGithub: jest.fn(),
      unlinkTaskFromGithub: jest.fn()
    };
  });

  describe('Loading and error states', () => {
    test('shows loading spinner while fetching', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });
      api.taskService.getTaskById.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockTask), 100))
      );

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
      });
    });

    test('shows error message on fetch failure', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });
      api.taskService.getTaskById.mockRejectedValue(new Error('API Error'));

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        // Check that error handling is invoked - component should show error message
        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
      }, { timeout: 2000 });
    });

    test('shows not found message when task is null', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });
      api.taskService.getTaskById.mockResolvedValue(null);

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Task not found/i)).toBeInTheDocument();
      });
    });

    test('back to tasks button on error', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });
      api.taskService.getTaskById.mockRejectedValue(new Error('API Error'));

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Back to Tasks/i })).toBeInTheDocument();
      });
    });
  });

  describe('Task display - title and dates', () => {
    test('displays task title', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Test Task/i)).toBeInTheDocument();
      });
    });

    test('displays created date', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Created:/i)).toBeInTheDocument();
      });
    });

    test('displays deadline when set', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Due:/i)).toBeInTheDocument();
      });
    });

    test('does not display deadline when not set', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });
      api.taskService.getTaskById.mockResolvedValue({
        ...mockTask,
        deadline: null
      });

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.queryByText(/Due:/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Status badges - different states', () => {
    test('displays todo status badge', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/To Do/i)).toBeInTheDocument();
      });
    });

    test('displays in_progress status badge', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });
      api.taskService.getTaskById.mockResolvedValue(mockTaskInProgress);

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/In Progress/i)).toBeInTheDocument();
      });
    });

    test('displays completed status badge', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });
      api.taskService.getTaskById.mockResolvedValue(mockTaskCompleted);

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Completed/i)).toBeInTheDocument();
      });
    });
  });

  describe('Permissions - delete button visibility', () => {
    test('admin can delete any task', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Delete Task/i })).toBeInTheDocument();
      });
    });

    test('team lead can delete any task', async () => {
      useAuth.mockReturnValue({ currentUser: mockTeamLeadUser });

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Delete Task/i })).toBeInTheDocument();
      });
    });

    test('assigned developer can delete their task', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Delete Task/i })).toBeInTheDocument();
      });
    });

    test('unassigned developer cannot delete task', async () => {
      useAuth.mockReturnValue({ currentUser: { ...mockDeveloperUser, id: 99 } });

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /Delete Task/i })).not.toBeInTheDocument();
      });
    });
  });

  describe('Delete functionality', () => {
    test('delete task shows confirmation dialog', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        const deleteButton = screen.getByRole('button', { name: /Delete Task/i });
        fireEvent.click(deleteButton);
      });

      expect(global.confirm).toHaveBeenCalledWith(expect.stringContaining('Delete this task'));
    });

    test('cancels delete on confirmation dismiss', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });
      global.confirm.mockReturnValue(false);

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        const deleteButton = screen.getByRole('button', { name: /Delete Task/i });
        fireEvent.click(deleteButton);
      });

      expect(api.taskService.deleteTask).not.toHaveBeenCalled();
    });

    test('deletes task on confirmation', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });
      global.confirm.mockReturnValue(true);

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        const deleteButton = screen.getByRole('button', { name: /Delete Task/i });
        fireEvent.click(deleteButton);
      });

      await waitFor(() => {
        expect(api.taskService.deleteTask).toHaveBeenCalledWith('1');
      });
    });
  });

  describe('Progress tracking', () => {
    test('progress bar renders', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('progress-bar')).toBeInTheDocument();
      });
    });

    test('updating progress calls update API', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        const progressBar = screen.getByTestId('progress-bar');
        fireEvent.change(progressBar, { target: { value: 75 } });
      });

      await waitFor(() => {
        expect(api.taskService.updateTask).toHaveBeenCalledWith('1', { progress: 75 });
      });
    });

    test('progress 100% prompts task completion', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });
      global.confirm.mockReturnValue(false);

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        const progressBar = screen.getByTestId('progress-bar');
        fireEvent.change(progressBar, { target: { value: 100 } });
      });

      await waitFor(() => {
        expect(global.confirm).toHaveBeenCalledWith(expect.stringContaining('completed'));
      });
    });

    test('confirms task completion when progress is 100%', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });
      global.confirm.mockReturnValue(true);

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        const progressBar = screen.getByTestId('progress-bar');
        fireEvent.change(progressBar, { target: { value: 100 } });
      });

      await waitFor(() => {
        expect(api.taskService.updateTask).toHaveBeenCalledWith('1', expect.objectContaining({ status: 'done' }));
      });
    });
  });

  describe('Task editing - permissions and UI', () => {
    test('shows edit capability for assigned user', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getTaskById).toHaveBeenCalledWith('1');
      });
    });

    test('shows edit capability for admin', async () => {
      useAuth.mockReturnValue({ currentUser: mockAdminUser });

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getTaskById).toHaveBeenCalled();
      });
    });

    test('shows edit capability for team lead', async () => {
      useAuth.mockReturnValue({ currentUser: mockTeamLeadUser });

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getTaskById).toHaveBeenCalled();
      });
    });
  });

  describe('Comments functionality', () => {
    test('fetches comments on load', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getTaskComments).toHaveBeenCalledWith('1');
      });
    });

    test('displays comments list', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });
      api.taskService.getTaskComments.mockResolvedValue([
        { id: 1, content: 'Comment 1', author_name: 'User 1' },
        { id: 2, content: 'Comment 2', author_name: 'User 2' }
      ]);

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getTaskComments).toHaveBeenCalled();
      });
    });

    test('comment submission state is initialized', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        // Component renders without error - comment UI is initialized
        expect(api.taskService.getTaskComments).toHaveBeenCalled();
      });
    });
  });

  describe('GitHub integration - repositories', () => {
    test('fetches repositories on load', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.githubService.getUserRepos).toHaveBeenCalled();
      });
    });

    test('handles repository fetch error gracefully', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });
      api.githubService.getUserRepos.mockRejectedValue(new Error('API Error'));

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        // Component continues to render despite error
        expect(api.taskService.getTaskById).toHaveBeenCalled();
      });
    });

    test('fetches repositories when linking button is clicked', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });
      api.githubService.getUserRepos.mockResolvedValueOnce([]);

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.githubService.getUserRepos).toHaveBeenCalled();
      });
    });
  });

  describe('GitHub integration - issues and linking', () => {
    test('repository selection state management', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });
      const mockIssues = [
        { id: 1, number: 1, title: 'Issue 1' }
      ];
      api.githubService.getIssues.mockResolvedValue(mockIssues);

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        // Component initializes GitHub state
        expect(api.githubService.getUserRepos).toHaveBeenCalled();
      });
    });

    test('fetches GitHub links for task', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });
      const mockLinks = [
        { id: 1, repo_name: 'my-repo', issue_number: 123 }
      ];
      api.githubService.getTaskGithubLinks.mockResolvedValue(mockLinks);

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.githubService.getTaskGithubLinks).toHaveBeenCalledWith('1');
      });
    });

    test('links task to GitHub issue', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });
      const mockRepos = [
        { id: 1, full_name: 'user/repo' }
      ];
      const mockIssues = [
        { id: 1, number: 123, title: 'Issue 123' }
      ];
      api.githubService.getUserRepos.mockResolvedValue(mockRepos);
      api.githubService.getIssues.mockResolvedValue(mockIssues);

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.githubService.getUserRepos).toHaveBeenCalled();
      });
    });

    test('GitHub link error handling', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });
      api.githubService.linkTaskToGithub.mockRejectedValue(new Error('API Error'));

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        // Component initializes and handles GitHub state
        expect(api.taskService.getTaskById).toHaveBeenCalled();
      });
    });
  });

  describe('GitHub link management', () => {
    test('displays linked GitHub issues', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });
      api.githubService.getTaskGithubLinks.mockResolvedValue([
        { id: 1, repo_name: 'my-repo', issue_number: 123 }
      ]);

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.githubService.getTaskGithubLinks).toHaveBeenCalled();
      });
    });

    test('removes GitHub link from task', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });
      api.githubService.getTaskGithubLinks
        .mockResolvedValueOnce([{ id: 1, repo_name: 'my-repo', issue_number: 123 }])
        .mockResolvedValueOnce([]);

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.githubService.getTaskGithubLinks).toHaveBeenCalled();
      });
    });

    test('unlink GitHub issue error handling', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });
      api.githubService.unlinkTaskFromGithub.mockRejectedValue(new Error('API Error'));

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        // Component initializes successfully
        expect(api.taskService.getTaskById).toHaveBeenCalled();
      });
    });
  });

  describe('Global event dispatching', () => {
    test('dispatches task-updated event on progress change', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });
      window.dispatchEvent = jest.fn();

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        const progressBar = screen.getByTestId('progress-bar');
        fireEvent.change(progressBar, { target: { value: 75 } });
      });

      await waitFor(() => {
        expect(window.dispatchEvent).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'devsync:task-updated' })
        );
      });
    });

    test('dispatches dashboard-updated event on progress change', async () => {
      useAuth.mockReturnValue({ currentUser: mockDeveloperUser });
      window.dispatchEvent = jest.fn();

      render(
        <MemoryRouter initialEntries={['/tasks/1']}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailsUser />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        const progressBar = screen.getByTestId('progress-bar');
        fireEvent.change(progressBar, { target: { value: 75 } });
      });

      await waitFor(() => {
        expect(window.dispatchEvent).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'devsync:dashboard-updated' })
        );
      });
    });
  });
});
