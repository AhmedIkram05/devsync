import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import { projectService } from '../services/utils/api';
import { useAuth } from '../context/AuthContext';

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

const statusBadgeClass = (status) => {
  const statusMap = {
    todo: 'bg-amber-500/20 text-amber-300 border border-amber-400/40',
    backlog: 'bg-slate-700/50 text-slate-300 border border-slate-600/40',
    in_progress: 'bg-sky-500/20 text-sky-300 border border-sky-400/40',
    review: 'bg-rose-500/20 text-rose-300 border border-rose-400/40',
    done: 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40',
    completed: 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
  };

  return statusMap[status] || 'bg-slate-800/40 text-slate-300';
};

const formatTaskStatus = (status) => {
  if (!status) {
    return 'Unknown';
  }

  if (status === 'in_progress') {
    return 'In Progress';
  }

  if (status === 'todo') {
    return 'To Do';
  }

  if (status === 'done') {
    return 'Completed';
  }

  return status.replace('_', ' ');
};

const formatProjectStatus = (status) => {
  if (!status) {
    return 'unknown';
  }

  return status.replace(/[_-]/g, ' ');
};

const ProjectDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fallbackRoute = currentUser?.role === 'admin' ? '/admin/projects' : '/clientdashboard';
  const isAdmin = currentUser?.role === 'admin';

  const loadProjectDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [projectData, projectTasks] = await Promise.all([
        projectService.getProjectById(id),
        projectService.getProjectTasks(id)
      ]);

      if (!projectData) {
        setError('Project not found or you do not have access.');
        setProject(null);
        setTasks([]);
        return;
      }

      setProject(projectData);
      setTasks(Array.isArray(projectTasks) ? projectTasks : []);
    } catch (err) {
      console.error('Failed to load project details:', err);
      setError('Failed to load project details. Please try again.');
      setProject(null);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadProjectDetails();
  }, [loadProjectDetails]);

  const summary = useMemo(() => {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((task) => task.status === 'done' || task.status === 'completed').length;
    const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      totalTasks,
      completedTasks,
      completionPercentage
    };
  }, [tasks]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner size="large" message="Loading project details..." />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex flex-col h-screen items-center justify-center p-6">
        <div className="text-xl text-red-600 mb-4">{error || 'Project not found.'}</div>
        <button
          onClick={() => navigate(fallbackRoute)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-950 min-h-screen p-4 md:p-6 text-slate-100">
      <div className="max-w-6xl mx-auto">
        <div className="bg-slate-900/70 border border-slate-800/70 rounded-2xl shadow-md p-6 mb-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-100">{project.name}</h1>
              <p className="text-slate-400 mt-2">{project.description || 'No description provided.'}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {isAdmin && (
                <Link
                  to={`/admin/projects/${project.id}/edit`}
                  className="inline-flex items-center px-4 py-2 rounded-full bg-rose-500/90 text-white hover:bg-rose-400"
                >
                  Edit Project
                </Link>
              )}
              <button
                onClick={() => navigate(fallbackRoute)}
                className="inline-flex items-center px-4 py-2 rounded-full border border-slate-700/70 text-slate-300 hover:text-slate-100 hover:border-slate-500"
              >
                Back
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <InfoCard label="Status" value={formatProjectStatus(project.status)} />
            <InfoCard label="Created" value={formatDate(project.created_at)} />
            <InfoCard label="Updated" value={formatDate(project.updated_at)} />
            <InfoCard label="Completion" value={`${summary.completionPercentage}%`} />
          </div>

          <div className="mt-5 flex flex-wrap gap-3 text-sm text-slate-400">
            <span>Total Tasks: {summary.totalTasks}</span>
            <span>Completed: {summary.completedTasks}</span>
            {project.creator_name && <span>Created By: {project.creator_name}</span>}
            {project.github_repo && (
              <a
                href={project.github_repo}
                target="_blank"
                rel="noopener noreferrer"
                className="text-rose-400 hover:text-rose-300"
              >
                Open Repository
              </a>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-slate-900/70 border border-slate-800/70 rounded-2xl shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4 text-slate-100">Project Tasks</h2>

            {tasks.length === 0 ? (
              <div className="text-center py-8 border rounded-lg border-slate-700/70 bg-slate-800/30 text-slate-400">
                No tasks are currently associated with this project.
              </div>
            ) : (
              <div className="overflow-x-auto border rounded-lg border-slate-700/70">
                <table className="min-w-full divide-y divide-slate-700/70">
                  <thead className="bg-slate-800/60">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Title</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Progress</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Deadline</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-slate-900/40 divide-y divide-slate-700/70">
                    {tasks.map((task) => (
                      <tr key={task.id} className="hover:bg-slate-800/40">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-100">{task.title}</div>
                          <div className="text-sm text-slate-500 truncate max-w-md">{task.description || 'No description'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${statusBadgeClass(task.status)}`}>
                            {formatTaskStatus(task.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">{task.progress || 0}%</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{formatDate(task.deadline)}</td>
                        <td className="px-4 py-3">
                          <Link
                            to={`/tasks/${task.id}`}
                            className="inline-flex px-3 py-1.5 rounded-full bg-rose-500/80 text-white text-sm hover:bg-rose-400"
                          >
                            View Task
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-slate-900/70 border border-slate-800/70 rounded-2xl shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4 text-slate-100">Team Members</h2>
            {Array.isArray(project.team_members) && project.team_members.length > 0 ? (
              <ul className="space-y-3">
                {project.team_members.map((member) => (
                  <li key={member.id} className="p-3 rounded-lg border border-slate-700/70 bg-slate-800/30">
                    <p className="font-medium text-slate-100">{member.name}</p>
                    <p className="text-sm text-slate-400">{member.role}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-400">No team members assigned to this project.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const InfoCard = ({ label, value }) => (
  <div className="border border-slate-700/70 rounded-lg p-4 bg-slate-800/30">
    <p className="text-sm text-slate-400">{label}</p>
    <p className="text-lg font-semibold text-slate-100 capitalize">{value}</p>
  </div>
);

export default ProjectDetails;
