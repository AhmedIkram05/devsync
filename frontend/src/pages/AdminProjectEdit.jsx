import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import ProjectForm from '../components/ProjectForm';
import { projectService, taskService } from '../services/utils/api';

const AdminProjectEdit = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [projectData, usersData] = await Promise.all([
          projectService.getProjectById(id),
          taskService.getUsers()
        ]);

        if (!projectData) {
          setError('Project not found or you do not have access.');
          setProject(null);
          setUsers(usersData || []);
          return;
        }

        setProject(projectData);
        setUsers(usersData || []);
      } catch (err) {
        console.error('Failed to load project data:', err);
        setError('Failed to load project details. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id]);

  const handleSubmit = async (formData) => {
    try {
      setSubmitting(true);
      setError(null);

      const payload = {
        name: formData.name,
        description: formData.description,
        status: formData.status,
        github_repo: formData.github_repo,
        team_members: formData.team_members
      };

      await projectService.updateProject(id, payload);
      navigate(`/projects/${id}`);
    } catch (err) {
      console.error('Failed to update project:', err);
      setError(err?.message || 'Failed to update project. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    navigate(`/projects/${id}`);
  };

  const handleDelete = async () => {
    if (deleting) {
      return;
    }

    const projectName = project?.name || 'this project';
    const confirmed = window.confirm(`Delete "${projectName}"? This cannot be undone.`);

    if (!confirmed) {
      return;
    }

    try {
      setDeleting(true);
      setError(null);
      await projectService.deleteProject(id);
      navigate('/admin/projects');
    } catch (err) {
      console.error('Failed to delete project:', err);
      setError(err?.message || 'Failed to delete project. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner size="large" message="Loading project..." />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col h-screen items-center justify-center p-6">
        <div className="text-xl text-red-600 mb-4">{error || 'Project not found.'}</div>
        <button
          onClick={() => navigate('/admin/projects')}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Back to Projects
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-950 min-h-screen p-4 md:p-6 text-slate-100">
      <div className="max-w-4xl mx-auto">
        <div className="bg-slate-900/70 border border-slate-800/70 rounded-2xl shadow-md p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-100">Edit Project</h1>
            <p className="mt-1 text-sm text-slate-400">Update project details and team assignments.</p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          <ProjectForm
            key={project?.id || id}
            initialData={project}
            users={users}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            submitting={submitting}
            submitLabel="Save Changes"
          />

          <div className="mt-8 border-t border-slate-700/70 pt-6">
            <h2 className="text-sm font-semibold text-rose-400 uppercase tracking-wide">Danger Zone</h2>
            <p className="mt-2 text-sm text-slate-400">
              Deleting a project is permanent and cannot be undone.
            </p>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || submitting}
              className="mt-4 inline-flex items-center rounded-full border border-rose-400/40 px-4 py-2 text-rose-300 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting ? 'Deleting...' : 'Delete Project'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminProjectEdit;
