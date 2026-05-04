import React, { useEffect, useMemo, useState } from 'react';

const normalizeStatus = (status) => {
  if (!status) {
    return 'active';
  }

  if (status === 'on-hold') {
    return 'on_hold';
  }

  return status;
};

const getMemberId = (member) => {
  if (!member) {
    return null;
  }

  if (typeof member === 'object') {
    return member.id ?? member.user_id ?? null;
  }

  return member;
};

const buildInitialState = (initialData) => {
  const members = Array.isArray(initialData?.team_members)
    ? initialData.team_members.map(getMemberId).filter((id) => id !== null)
    : [];

  return {
    name: initialData?.name || '',
    description: initialData?.description || '',
    status: normalizeStatus(initialData?.status) || 'active',
    github_repo: initialData?.github_repo || '',
    team_members: members.map((id) => String(id))
  };
};

const ProjectForm = ({
  initialData = null,
  users = [],
  onSubmit,
  onCancel,
  submitting = false,
  submitLabel = 'Save Project',
  requireDescription = false
}) => {
  const [formState, setFormState] = useState(() => buildInitialState(initialData));
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    setFormState(buildInitialState(initialData));
  }, [initialData]);

  const statusOptions = useMemo(() => ([
    { value: 'active', label: 'Active' },
    { value: 'completed', label: 'Completed' },
    { value: 'on_hold', label: 'On Hold' },
    { value: 'cancelled', label: 'Cancelled' }
  ]), []);

  const handleChange = (field, value) => {
    setFormState((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleToggleMember = (memberId) => {
    setFormState((prev) => {
      const exists = prev.team_members.includes(memberId);
      const nextMembers = exists
        ? prev.team_members.filter((id) => id !== memberId)
        : [...prev.team_members, memberId];

      return {
        ...prev,
        team_members: nextMembers
      };
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const name = formState.name.trim();
    const description = formState.description.trim();

    if (!name) {
      setFormError('Project name is required.');
      return;
    }

    if (requireDescription && !description) {
      setFormError('Project description is required.');
      return;
    }

    setFormError(null);

    const teamMembers = formState.team_members
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id));

    onSubmit({
      name,
      description,
      status: normalizeStatus(formState.status),
      github_repo: formState.github_repo.trim(),
      team_members: teamMembers
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {(formError) && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {formError}
        </div>
      )}

      <div>
        <label htmlFor="project-name" className="block text-sm font-medium text-gray-700 mb-1">
          Project Name
        </label>
        <input
          id="project-name"
          type="text"
          value={formState.name}
          onChange={(event) => handleChange('name', event.target.value)}
          className="w-full rounded border border-gray-300 p-2 focus:border-blue-500 focus:ring-blue-500"
          placeholder="e.g. Mobile Release"
          required
        />
      </div>

      <div>
        <label htmlFor="project-description" className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          id="project-description"
          value={formState.description}
          onChange={(event) => handleChange('description', event.target.value)}
          className="w-full rounded border border-gray-300 p-2 focus:border-blue-500 focus:ring-blue-500"
          placeholder="Describe the scope, goals, or deliverables"
          rows={4}
          required={requireDescription}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="project-status" className="block text-sm font-medium text-gray-700 mb-1">
            Status
          </label>
          <select
            id="project-status"
            value={formState.status}
            onChange={(event) => handleChange('status', event.target.value)}
            className="w-full rounded border border-gray-300 p-2 focus:border-blue-500 focus:ring-blue-500"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="project-github" className="block text-sm font-medium text-gray-700 mb-1">
            GitHub Repository URL
          </label>
          <input
            id="project-github"
            type="url"
            value={formState.github_repo}
            onChange={(event) => handleChange('github_repo', event.target.value)}
            className="w-full rounded border border-gray-300 p-2 focus:border-blue-500 focus:ring-blue-500"
            placeholder="https://github.com/org/repo"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">Team Members</label>
          <span className="text-xs text-gray-500">Optional</span>
        </div>
        <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-3">
          {users.length === 0 ? (
            <p className="text-sm text-gray-500">No users available for assignment.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {users.map((user) => {
                const memberId = String(user.id);
                const checked = formState.team_members.includes(memberId);

                return (
                  <label key={user.id} className="flex items-center gap-2 rounded bg-white p-2 shadow-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggleMember(memberId)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-800">
                      {user.name || user.email}
                      {user.role ? <span className="ml-2 text-xs text-gray-500">({user.role})</span> : null}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center rounded border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-100"
            disabled={submitting}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          disabled={submitting}
        >
          {submitting ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
};

export default ProjectForm;
