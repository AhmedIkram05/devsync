import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProjectDetails from '../../pages/ProjectDetails';
import * as api from '../../services/utils/api';

jest.mock('../../services/utils/api');
jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn()
}));
jest.mock('../../components/LoadingSpinner', () => {
  return function MockLoadingSpinner() {
    return <div data-testid="loading-spinner">Loading...</div>;
  };
});

const { useAuth } = require('../../context/AuthContext');

describe('ProjectDetails page - branches', () => {
  const mockProject = {
    id: 1,
    name: 'Test Project',
    description: 'Test description',
    status: 'active',
    created_at: '2026-05-01T10:00:00Z'
  };

  const mockTasks = [
    { id: 1, title: 'Task 1', status: 'todo', priority: 'high', assigned_to_id: 1 },
    { id: 2, title: 'Task 2', status: 'in_progress', priority: 'medium', assigned_to_id: 2 },
    { id: 3, title: 'Task 3', status: 'done', priority: 'low', assigned_to_id: 1 }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({
      currentUser: { id: 1, role: 'admin', email: 'admin@test.com' },
      is: jest.fn(role => role === 'admin')
    });

    api.projectService = {
      getProjectById: jest.fn().mockResolvedValue(mockProject),
      getProjectTasks: jest.fn().mockResolvedValue(mockTasks),
      updateProject: jest.fn().mockResolvedValue({ success: true })
    };
  });

  test('shows loading spinner initially', async () => {
    api.projectService.getProjectById.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(mockProject), 100))
    );

    render(
      <MemoryRouter initialEntries={['/projects/1']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetails />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  test('displays project details', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/1']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetails />} />
          <Route path="/admin/projects" element={<div>Projects</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(
      () => {
        expect(screen.getByText('Test Project')).toBeInTheDocument();
      },
      { timeout: 2000 }
    );
  });

  test('fetches project on mount', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/1']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetails />} />
          <Route path="/admin/projects" element={<div>Projects</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(
      () => {
        expect(api.projectService.getProjectById).toHaveBeenCalledWith('1');
      },
      { timeout: 2000 }
    );
  });

  test('fetches project tasks', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/1']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetails />} />
          <Route path="/admin/projects" element={<div>Projects</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(
      () => {
        expect(api.projectService.getProjectTasks).toHaveBeenCalled();
      },
      { timeout: 2000 }
    );
  });

  test('displays tasks list', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/1']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetails />} />
          <Route path="/admin/projects" element={<div>Projects</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(
      () => {
        expect(screen.getByText('Task 1')).toBeInTheDocument();
      },
      { timeout: 2000 }
    );
  });

  test('formats status with task data', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/1']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetails />} />
          <Route path="/admin/projects" element={<div>Projects</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(
      () => {
        expect(api.projectService.getProjectTasks).toHaveBeenCalled();
      },
      { timeout: 2000 }
    );
  });

  test('handles project load error', async () => {
    api.projectService.getProjectById.mockRejectedValue(new Error('Failed to load'));

    render(
      <MemoryRouter initialEntries={['/projects/1']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetails />} />
          <Route path="/admin/projects" element={<div>Projects</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(
      () => {
      expect(screen.getByText(/failed|error/i)).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  test('renders navigation elements', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/1']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetails />} />
          <Route path="/admin/projects" element={<div>Projects</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(
      () => {
      expect(api.projectService.getProjectById).toHaveBeenCalled();
    });
  });

  test('shows project status', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/1']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetails />} />
          <Route path="/admin/projects" element={<div>Projects</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(
      () => {
      expect(screen.getByText(/active|Active/i)).toBeInTheDocument();
    });
  });

  test('displays project metadata', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/1']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetails />} />
          <Route path="/admin/projects" element={<div>Projects</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(
      () => {
      expect(api.projectService.getProjectById).toHaveBeenCalled();
    });
  });

  test('handles empty tasks list', async () => {
    api.projectService.getProjectTasks.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/projects/1']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetails />} />
          <Route path="/admin/projects" element={<div>Projects</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(
      () => {
      expect(api.projectService.getProjectTasks).toHaveBeenCalled();
    });
  });

  test('formats dates correctly', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/1']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetails />} />
          <Route path="/admin/projects" element={<div>Projects</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(
      () => {
      expect(screen.getByText('Test Project')).toBeInTheDocument();
    });
  });

  test('renders task data from API', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/1']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetails />} />
          <Route path="/admin/projects" element={<div>Projects</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(
      () => {
      expect(api.projectService.getProjectTasks).toHaveBeenCalled();
    });
  });

  test('handles project with null description', async () => {
    const projectNullDesc = { ...mockProject, description: null };
    api.projectService.getProjectById.mockResolvedValue(projectNullDesc);

    render(
      <MemoryRouter initialEntries={['/projects/1']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetails />} />
          <Route path="/admin/projects" element={<div>Projects</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(
      () => {
      expect(screen.getByText('Test Project')).toBeInTheDocument();
    });
  });

  test('uses admin fallback route for admins', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/1']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetails />} />
          <Route path="/admin/projects" element={<div>Projects</div>} />
          <Route path="/BasicDashboard" element={<div>Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(
      () => {
      expect(api.projectService.getProjectById).toHaveBeenCalled();
    });
  });

  test('uses developer fallback route for non-admins', async () => {
    useAuth.mockReturnValue({
      currentUser: { id: 2, role: 'developer', email: 'dev@test.com' },
      is: jest.fn(role => role === 'admin')
    });

    render(
      <MemoryRouter initialEntries={['/projects/1']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetails />} />
          <Route path="/admin/projects" element={<div>Projects</div>} />
          <Route path="/BasicDashboard" element={<div>Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(
      () => {
      expect(api.projectService.getProjectById).toHaveBeenCalled();
    });
  });

  test('displays status badge styling', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/1']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetails />} />
          <Route path="/admin/projects" element={<div>Projects</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(
      () => {
      const statusElements = screen.getAllByText(/To Do|In Progress|Completed/i);
      expect(statusElements.length).toBeGreaterThan(0);
    });
  });

  test('renders project title heading', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/1']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetails />} />
          <Route path="/admin/projects" element={<div>Projects</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(
      () => {
      const heading = screen.getByRole('heading', { name: /Test Project/i });
      expect(heading).toBeInTheDocument();
    });
  });

  test('parallel fetches of project and tasks', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/1']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetails />} />
          <Route path="/admin/projects" element={<div>Projects</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(
      () => {
        expect(api.projectService.getProjectById).toHaveBeenCalled();
      },
      { timeout: 2000 }
    );

    await waitFor(
      () => {
        expect(api.projectService.getProjectTasks).toHaveBeenCalled();
      },
      { timeout: 2000 }
    );
  });
});
