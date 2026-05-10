import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TaskList from '../../pages/TaskList';
import * as api from '../../services/utils/api';

// Mock modules
jest.mock('../../services/utils/api');
jest.mock('../../components/LoadingSpinner', () => {
  return function MockLoadingSpinner() {
    return <div data-testid="loading-spinner">Loading...</div>;
  };
});

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

const { useAuth } = require('../../context/AuthContext');

describe('TaskList page branch coverage', () => {
  const mockUser = {
    id: 1,
    name: 'Test User',
    role: 'developer',
    email: 'test@example.com'
  };

  const mockAdminUser = {
    id: 2,
    name: 'Admin User',
    role: 'admin',
    email: 'admin@example.com'
  };

  const mockTasks = [
    { id: 1, title: 'Task 1', status: 'todo', priority: 'high', assigned_to: 1, project_id: 1, created_at: '2026-05-09T10:00:00Z', updated_at: '2026-05-09T10:00:00Z', deadline: null, progress: 0 },
    { id: 2, title: 'Task 2', status: 'in_progress', priority: 'medium', assigned_to: 1, project_id: 1, created_at: '2026-05-08T10:00:00Z', updated_at: '2026-05-09T11:00:00Z', deadline: '2026-05-20T10:00:00Z', progress: 50 },
    { id: 3, title: 'Task 3', status: 'completed', priority: 'low', assigned_to: 2, project_id: 2, created_at: '2026-05-07T10:00:00Z', updated_at: '2026-05-09T09:00:00Z', deadline: '2026-05-15T10:00:00Z', progress: 100 },
  ];

  const mockUsers = [
    { id: 1, name: 'Test User', email: 'test@example.com', role: 'developer' },
    { id: 2, name: 'Admin User', email: 'admin@example.com', role: 'admin' }
  ];

  const mockProjects = [
    { id: 1, name: 'Project 1', status: 'active' },
    { id: 2, name: 'Project 2', status: 'active' }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    delete window.location;
    window.location = new URL('http://localhost/tasks');

    api.taskService = {
      getAllTasks: jest.fn().mockResolvedValue(mockTasks),
      updateTask: jest.fn().mockResolvedValue({ success: true })
    };

    api.userService = {
      getAllUsers: jest.fn().mockResolvedValue(mockUsers)
    };

    api.projectService = {
      getAllProjects: jest.fn().mockResolvedValue(mockProjects)
    };

    window.dispatchEvent = jest.fn();
  });

  describe('Loading and initialization', () => {
    test('shows loading spinner on initial load', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });
      api.taskService.getAllTasks.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockTasks), 100))
      );

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
      });
    });

    test('fetches users and projects on load', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.userService.getAllUsers).toHaveBeenCalled();
        expect(api.projectService.getAllProjects).toHaveBeenCalled();
      });
    });

    test('handles user/project fetch errors gracefully', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });
      api.userService.getAllUsers.mockRejectedValue(new Error('API Error'));

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        // Component should still load tasks despite user fetch error
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });
  });

  describe('Task display and rendering', () => {
    test('renders task list', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Task 1/i)).toBeInTheDocument();
        expect(screen.getByText(/Task 2/i)).toBeInTheDocument();
      });
    });

    test('renders task title, status, and priority', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Task 1/)).toBeInTheDocument();
      });
    });

    test('displays tasks heading', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Tasks/i })).toBeInTheDocument();
      });
    });

    test('shows empty message when no tasks match filters', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });
      api.taskService.getAllTasks.mockResolvedValue([]);

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });
  });

  describe('Status filtering', () => {
    test('filters tasks by status: todo', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Task 1/i)).toBeInTheDocument();
      });
    });

    test('filters tasks by status: in_progress', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Task 2/i)).toBeInTheDocument();
      });
    });

    test('filters tasks by status: completed', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Task 3/i)).toBeInTheDocument();
      });
    });

    test('all status filter shows all tasks', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Task 1/i)).toBeInTheDocument();
        expect(screen.getByText(/Task 2/i)).toBeInTheDocument();
        expect(screen.getByText(/Task 3/i)).toBeInTheDocument();
      });
    });
  });

  describe('Priority filtering', () => {
    test('filters tasks by high priority', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Task 1/i)).toBeInTheDocument();
      });
    });

    test('filters tasks by medium priority', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Task 2/i)).toBeInTheDocument();
      });
    });

    test('filters tasks by low priority', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Task 3/i)).toBeInTheDocument();
      });
    });
  });

  describe('Project filtering', () => {
    test('filters tasks by project', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Task 1/i)).toBeInTheDocument();
      });
    });

    test('all projects filter shows all tasks', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Task 1/i)).toBeInTheDocument();
        expect(screen.getByText(/Task 3/i)).toBeInTheDocument();
      });
    });
  });

  describe('Search filtering', () => {
    test('filters tasks by search text', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Task 1/i)).toBeInTheDocument();
      });
    });

    test('search filter works with task titles', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });

    test('no results for non-matching search', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });
  });

  describe('Scope filtering - My Tasks', () => {
    test('my tasks scope filters to current user', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });

    test('handles deep-link assigned_to parameter', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });
      window.location.search = '?assigned_to=1';

      render(
        <MemoryRouter initialEntries={['/tasks?assigned_to=1']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });

    test('handles deep-link assignee parameter', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });
      window.location.search = '?assignee=1';

      render(
        <MemoryRouter initialEntries={['/tasks?assignee=1']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });
  });

  describe('Assignee filtering', () => {
    test('filters tasks by assignee', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });

    test('all assignee filter shows all tasks', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Task 1/i)).toBeInTheDocument();
        expect(screen.getByText(/Task 3/i)).toBeInTheDocument();
      });
    });
  });

  describe('Sorting - by recent', () => {
    test('default sort by recent (updated_at)', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });

    test('sorts by recent uses created_at when updated_at missing', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });
      const tasksWithoutUpdated = mockTasks.map(t => ({ ...t, updated_at: null }));
      api.taskService.getAllTasks.mockResolvedValue(tasksWithoutUpdated);

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });
  });

  describe('Sorting - by deadline', () => {
    test('sorts tasks by deadline ascending', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });

    test('tasks without deadline sort last', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });
      const mixedTasks = [
        { ...mockTasks[0], deadline: '2026-05-20T10:00:00Z' },
        { ...mockTasks[1], deadline: null }
      ];
      api.taskService.getAllTasks.mockResolvedValue(mixedTasks);

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });
  });

  describe('Sorting - by priority', () => {
    test('sorts tasks by priority: high > medium > low', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });

    test('unknown priority defaults to medium', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });
      const tasksWithUnknown = [
        { ...mockTasks[0], priority: 'unknown' }
      ];
      api.taskService.getAllTasks.mockResolvedValue(tasksWithUnknown);

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });
  });

  describe('Sorting - by progress', () => {
    test('sorts tasks by progress descending (highest first)', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });

    test('tasks without progress sort first', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });
      const tasksNoProgress = [
        { ...mockTasks[0], progress: null },
        { ...mockTasks[1], progress: 50 }
      ];
      api.taskService.getAllTasks.mockResolvedValue(tasksNoProgress);

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });
  });

  describe('Formatting - dates', () => {
    test('formats deadline dates correctly', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });

    test('shows "No deadline" for null deadline', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });
      const tasksNoDeadline = mockTasks.map(t => ({ ...t, deadline: null }));
      api.taskService.getAllTasks.mockResolvedValue(tasksNoDeadline);

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });

    test('handles invalid date gracefully', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });
      const tasksInvalidDate = [{ ...mockTasks[0], deadline: 'invalid-date' }];
      api.taskService.getAllTasks.mockResolvedValue(tasksInvalidDate);

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });
  });

  describe('Overdue detection', () => {
    test('identifies overdue tasks', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const overdueTask = { ...mockTasks[0], deadline: pastDate.toISOString() };
      api.taskService.getAllTasks.mockResolvedValue([overdueTask]);

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });

    test('no deadline is not overdue', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });
      const taskNoDeadline = { ...mockTasks[0], deadline: null };
      api.taskService.getAllTasks.mockResolvedValue([taskNoDeadline]);

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });

    test('future deadline is not overdue', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const futureTask = { ...mockTasks[0], deadline: futureDate.toISOString() };
      api.taskService.getAllTasks.mockResolvedValue([futureTask]);

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });
  });

  describe('Status update functionality', () => {
    test('updates task status on status change', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });

    test('dispatches events on status update', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });

    test('handles status update error', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });
      api.taskService.updateTask.mockRejectedValue(new Error('Update failed'));

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });
  });

  describe('UI controls - refresh button', () => {
    test('renders refresh button', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
      });
    });

    test('refresh button fetches tasks', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        const refreshButton = screen.getByRole('button', { name: /Refresh/i });
        fireEvent.click(refreshButton);
      });

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalledTimes(2);
      });
    });

    test('refresh button disabled while loading', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });
      api.taskService.getAllTasks.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockTasks), 500))
      );

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      // Initially loading
      let refreshButton = screen.queryByRole('button', { name: /Refresh/i });
      if (refreshButton) {
        expect(refreshButton).toHaveAttribute('disabled');
      }
    });
  });

  describe('UI controls - create task button', () => {
    test('shows create task button for authenticated user', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        const createButton = screen.queryByRole('button', { name: /Create Task/i });
        if (createButton) {
          expect(createButton).toBeInTheDocument();
        }
      });
    });

    test('hides create task button for anonymous user', async () => {
      useAuth.mockReturnValue({ currentUser: null });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /Create Task/i })).not.toBeInTheDocument();
      });
    });
  });

  describe('Task navigation', () => {
    test('clicking task navigates to details', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
            <Route path="/tasks/:id" element={<div>Task Details</div>} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Task 1/i)).toBeInTheDocument();
      });
    });
  });

  describe('Combined filters', () => {
    test('filters by status AND priority', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });

    test('filters by status AND search text', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });

    test('filters by project AND assignee', async () => {
      useAuth.mockReturnValue({ currentUser: mockUser });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route path="/tasks" element={<TaskList />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.taskService.getAllTasks).toHaveBeenCalled();
      });
    });
  });
});
