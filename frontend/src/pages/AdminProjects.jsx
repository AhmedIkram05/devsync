import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import { projectService } from '../services/utils/api';

const statusClasses = {
  active: 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40',
  completed: 'bg-sky-500/20 text-sky-300 border border-sky-400/40',
  on_hold: 'bg-amber-500/20 text-amber-300 border border-amber-400/40',
  'on-hold': 'bg-amber-500/20 text-amber-300 border border-amber-400/40',
  planning: 'bg-rose-500/20 text-rose-300 border border-rose-400/40',
  cancelled: 'bg-slate-700/50 text-slate-300 border border-slate-600/40'
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
    <div className="min-h-screen bg-slate-950 text-slate-100 font-['Space_Grotesk']">
      <div className="max-w-6xl mx-auto px-6 py-10 md:px-10">
        <div className="bg-slate-900/70 border border-slate-800/70 rounded-2xl shadow-md p-6 backdrop-blur-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-100">Projects</h1>
              <p className="text-sm text-slate-400 mt-1">Browse all projects and open project details.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={loadProjects}
                className="inline-flex items-center px-4 py-2 rounded-full bg-slate-800/80 text-slate-200 hover:bg-slate-700/80 border border-slate-700/70"
              >
                Refresh
              </button>
              <Link
                to="/admin/projects/new"
                className="inline-flex items-center px-4 py-2 rounded-full bg-rose-500/90 text-white hover:bg-rose-400"
              >
                Create Project
              </Link>
              <Link
                to="/admin"
                className="inline-flex items-center px-4 py-2 rounded-full border border-slate-700/70 text-slate-300 hover:text-slate-100 hover:border-slate-500"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>

          <div className="mb-5">
            <label htmlFor="project-search" className="block text-sm font-medium text-slate-300 mb-1">
              Search Projects
            </label>
            <input
              id="project-search"
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, status, or description"
              className="w-full md:w-96 p-2 border border-slate-700/70 rounded-lg bg-slate-800/50 text-slate-100 placeholder-slate-500"
            />
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-lg border border-rose-400/40 bg-rose-500/10 text-rose-200">
              {error}
            </div>
          )}

          {filteredProjects.length === 0 ? (
            <div className="text-center py-10 border rounded-lg border-slate-700/70 bg-slate-800/30 text-slate-400">
              No projects found.
            </div>
          ) : (
            <div className="overflow-x-auto border rounded-lg border-slate-700/70">
              <table className="min-w-full divide-y divide-slate-700/70">
                <thead className="bg-slate-800/60">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Created</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Updated</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">GitHub Repo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-slate-900/40 divide-y divide-slate-700/70">
                  {filteredProjects.map((project) => {
                    const statusClass = statusClasses[project.status] || 'bg-slate-800/40 text-slate-300';
                    const statusLabel = statusLabels[project.status] || project.status || 'unknown';

                    return (
                      <tr key={project.id} className="hover:bg-slate-800/40">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-100">{project.name}</div>
                          <div className="text-sm text-slate-500 truncate max-w-md">
                            {project.description || 'No description'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${statusClass}`}>
                            {statusLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">{formatDate(project.created_at)}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{formatDate(project.updated_at)}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">
                          {project.github_repo ? (
                            <a
                              href={project.github_repo}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-rose-400 hover:text-rose-300"
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
                              className="inline-flex px-3 py-1.5 rounded-full bg-rose-500/80 text-white text-sm hover:bg-rose-400"
                            >
                              View Details
                            </Link>
                            <Link
                              to={`/admin/projects/${project.id}/edit`}
                              className="inline-flex px-3 py-1.5 rounded-full border border-slate-700/70 text-slate-300 text-sm hover:text-slate-100 hover:border-slate-500"
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
