import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import { projectService } from '../services/utils/api';

const statusClasses = {
  active: 'bg-green-100 text-green-800',
  completed: 'bg-blue-100 text-blue-800',
  on_hold: 'bg-yellow-100 text-yellow-800',
  'on-hold': 'bg-yellow-100 text-yellow-800',
  planning: 'bg-purple-100 text-purple-800',
  cancelled: 'bg-red-100 text-red-800'
};

const statusLabels = {
  active: 'Active',
  completed: 'Completed',
  on_hold: 'On Hold',
  'on-hold': 'On Hold',
  planning: 'Planning',
  cancelled: 'Cancelled'
};

const formatDate = (value) => {
  if (!value) {
    return 'N/A';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'N/A';
  }

  return parsed.toLocaleDateString();
};

const AdminProjects = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const loadProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await projectService.getAllProjects();
      setProjects(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load projects:', err);
      setError('Failed to load projects. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const filteredProjects = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) {
      return projects;
    }

    return projects.filter((project) => {
      const name = (project.name || '').toLowerCase();
      const description = (project.description || '').toLowerCase();
      const status = (project.status || '').toLowerCase();
      return name.includes(normalized) || description.includes(normalized) || status.includes(normalized);
    });
  }, [projects, search]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner size="large" message="Loading projects..." />
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
              <p className="text-sm text-gray-600 mt-1">Browse all projects and open project details.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={loadProjects}
                className="inline-flex items-center px-4 py-2 rounded bg-gray-700 text-white hover:bg-gray-800"
              >
                Refresh
              </button>
              <Link
                to="/admin/projects/new"
                className="inline-flex items-center px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
              >
                Create Project
              </Link>
              <Link
                to="/admin"
                className="inline-flex items-center px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-100"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>

          <div className="mb-5">
            <label htmlFor="project-search" className="block text-sm font-medium text-gray-700 mb-1">
              Search Projects
            </label>
            <input
              id="project-search"
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, status, or description"
              className="w-full md:w-96 p-2 border border-gray-300 rounded-md"
            />
          </div>

          {error && (
            <div className="mb-5 p-3 rounded border border-red-300 bg-red-50 text-red-700">
              {error}
            </div>
          )}

          {filteredProjects.length === 0 ? (
            <div className="text-center py-10 border rounded bg-gray-50 text-gray-600">
              No projects found.
            </div>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Created</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Updated</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">GitHub Repo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredProjects.map((project) => {
                    const statusClass = statusClasses[project.status] || 'bg-gray-100 text-gray-800';
                    const statusLabel = statusLabels[project.status] || project.status || 'unknown';

                    return (
                      <tr key={project.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{project.name}</div>
                          <div className="text-sm text-gray-500 truncate max-w-md">
                            {project.description || 'No description'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${statusClass}`}>
                            {statusLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{formatDate(project.created_at)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{formatDate(project.updated_at)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {project.github_repo ? (
                            <a
                              href={project.github_repo}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800"
                            >
                              Open Repository
                            </a>
                          ) : (
                            'Not linked'
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              to={`/projects/${project.id}`}
                              className="inline-flex px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
                            >
                              View Details
                            </Link>
                            <Link
                              to={`/admin/projects/${project.id}/edit`}
                              className="inline-flex px-3 py-1.5 rounded border border-gray-300 text-gray-700 text-sm hover:bg-gray-100"
                            >
                              Edit
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminProjects;
