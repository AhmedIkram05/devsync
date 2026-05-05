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
        <div className="rounded border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {formError}
        </div>
      )}

      <div>
        <label htmlFor="project-name" className="block text-sm font-medium text-slate-300 mb-1">
          Project Name
        </label>
        <input
          id="project-name"
          type="text"
          value={formState.name}
          onChange={(event) => handleChange('name', event.target.value)}
          className="w-full rounded border border-slate-700/60 bg-slate-950/60 p-2 text-slate-100 placeholder:text-slate-500 focus:border-rose-400/60 focus:ring-rose-400/60"
          placeholder="e.g. Mobile Release"
          required
        />
      </div>

      <div>
        <label htmlFor="project-description" className="block text-sm font-medium text-slate-300 mb-1">
          Description
        </label>
        <textarea
          id="project-description"
          value={formState.description}
          onChange={(event) => handleChange('description', event.target.value)}
          className="w-full rounded border border-slate-700/60 bg-slate-950/60 p-2 text-slate-100 placeholder:text-slate-500 focus:border-rose-400/60 focus:ring-rose-400/60"
          placeholder="Describe the scope, goals, or deliverables"
          rows={4}
          required={requireDescription}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="project-status" className="block text-sm font-medium text-slate-300 mb-1">
            Status
          </label>
          <select
            id="project-status"
            value={formState.status}
            onChange={(event) => handleChange('status', event.target.value)}
            className="w-full rounded border border-slate-700/60 bg-slate-950/60 p-2 text-slate-100 focus:border-rose-400/60 focus:ring-rose-400/60"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="project-github" className="block text-sm font-medium text-slate-300 mb-1">
            GitHub Repository URL
          </label>
          <input
            id="project-github"
            type="url"
            value={formState.github_repo}
            onChange={(event) => handleChange('github_repo', event.target.value)}
            className="w-full rounded border border-slate-700/60 bg-slate-950/60 p-2 text-slate-100 placeholder:text-slate-500 focus:border-rose-400/60 focus:ring-rose-400/60"
            placeholder="https://github.com/org/repo"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-slate-300">Team Members</label>
          <span className="text-xs text-slate-500">Optional</span>
        </div>
        <div className="mt-2 rounded border border-slate-800/70 bg-slate-950/60 p-3">
          {users.length === 0 ? (
            <p className="text-sm text-slate-500">No users available for assignment.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {users.map((user) => {
                const memberId = String(user.id);
                const checked = formState.team_members.includes(memberId);

                return (
                  <label key={user.id} className="flex items-center gap-2 rounded bg-slate-900/70 p-2 border border-slate-800/70">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggleMember(memberId)}
                      className="h-4 w-4 rounded border-slate-600 text-rose-400 focus:ring-rose-400/60"
                    />
                    <span className="text-sm text-slate-200">
                      {user.name || user.email}
                      {user.role ? <span className="ml-2 text-xs text-slate-500">({user.role})</span> : null}
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
            className="inline-flex items-center justify-center rounded border border-slate-700 px-4 py-2 text-slate-200 hover:border-slate-500"
            disabled={submitting}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-full bg-rose-500/90 px-4 py-2 text-white hover:bg-rose-400"
          disabled={submitting}
        >
          {submitting ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
};

export default ProjectForm;
