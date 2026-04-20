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
    todo: 'bg-gray-100 text-gray-800',
    backlog: 'bg-gray-100 text-gray-800',
    in_progress: 'bg-yellow-100 text-yellow-800',
    review: 'bg-blue-100 text-blue-800',
    done: 'bg-green-100 text-green-800',
    completed: 'bg-green-100 text-green-800'
  };

  return statusMap[status] || 'bg-gray-100 text-gray-800';
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

const ProjectDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fallbackRoute = currentUser?.role === 'admin' ? '/admin/projects' : '/clientdashboard';

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
    <div className="bg-gray-50 min-h-screen p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
              <p className="text-gray-600 mt-2">{project.description || 'No description provided.'}</p>
            </div>
            <button
              onClick={() => navigate(fallbackRoute)}
              className="inline-flex items-center px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-100"
            >
              Back
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <InfoCard label="Status" value={project.status || 'unknown'} />
            <InfoCard label="Created" value={formatDate(project.created_at)} />
            <InfoCard label="Updated" value={formatDate(project.updated_at)} />
            <InfoCard label="Completion" value={`${summary.completionPercentage}%`} />
          </div>

          <div className="mt-5 flex flex-wrap gap-3 text-sm text-gray-600">
            <span>Total Tasks: {summary.totalTasks}</span>
            <span>Completed: {summary.completedTasks}</span>
            {project.creator_name && <span>Created By: {project.creator_name}</span>}
            {project.github_repo && (
              <a
                href={project.github_repo}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800"
              >
                Open Repository
              </a>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Project Tasks</h2>

            {tasks.length === 0 ? (
              <div className="text-center py-8 border rounded bg-gray-50 text-gray-600">
                No tasks are currently associated with this project.
              </div>
            ) : (
              <div className="overflow-x-auto border rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Title</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Progress</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Deadline</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {tasks.map((task) => (
                      <tr key={task.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{task.title}</div>
                          <div className="text-sm text-gray-500 truncate max-w-md">{task.description || 'No description'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${statusBadgeClass(task.status)}`}>
                            {formatTaskStatus(task.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{task.progress || 0}%</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{formatDate(task.deadline)}</td>
                        <td className="px-4 py-3">
                          <Link
                            to={`/tasks/${task.id}`}
                            className="inline-flex px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
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

          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Team Members</h2>
            {Array.isArray(project.team_members) && project.team_members.length > 0 ? (
              <ul className="space-y-3">
                {project.team_members.map((member) => (
                  <li key={member.id} className="p-3 rounded border border-gray-200 bg-gray-50">
                    <p className="font-medium text-gray-900">{member.name}</p>
                    <p className="text-sm text-gray-600">{member.role}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-600">No team members assigned to this project.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const InfoCard = ({ label, value }) => (
  <div className="border rounded-lg p-4 bg-gray-50">
    <p className="text-sm text-gray-600">{label}</p>
    <p className="text-lg font-semibold text-gray-900 capitalize">{value}</p>
  </div>
);

export default ProjectDetails;
