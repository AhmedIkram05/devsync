import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import ProjectForm from '../components/ProjectForm';
import { projectService, taskService } from '../services/utils/api';

const AdminProjectCreate = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const usersData = await taskService.getUsers();
        setUsers(usersData || []);
      } catch (err) {
        console.error('Failed to load users for project creation:', err);
        setError('Failed to load users. You can still create a project without assigning team members.');
      } finally {
        setLoadingUsers(false);
      }
    };

    loadUsers();
  }, []);

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

      if (!payload.github_repo) {
        delete payload.github_repo;
      }

      if (!payload.team_members || payload.team_members.length === 0) {
        delete payload.team_members;
      }

      const response = await projectService.createProject(payload);
      const createdId = response?.project?.id;

      if (createdId) {
        navigate(`/projects/${createdId}`);
      } else {
        navigate('/admin/projects');
      }
    } catch (err) {
      console.error('Failed to create project:', err);
      setError(err?.message || 'Failed to create project. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    navigate('/admin/projects');
  };

  return (
    <div className="bg-slate-950 min-h-screen p-4 md:p-6 text-slate-100">
      <div className="max-w-4xl mx-auto">
        <div className="bg-slate-900/70 border border-slate-800/70 rounded-2xl shadow-md p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-100">Create Project</h1>
            <p className="mt-1 text-sm text-slate-400">Set up a new project and assign team members.</p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          {loadingUsers ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner size="large" message="Loading team members..." />
            </div>
          ) : (
            <ProjectForm
              users={users}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              submitting={submitting}
              submitLabel="Create Project"
              requireDescription={true}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminProjectCreate;
