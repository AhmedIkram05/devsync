import { useState, useEffect } from 'react';
import { settingsService } from '../services/utils/api';

const AdminSystemSettings = () => {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await settingsService.getSettings();
        setSettings(data);
      } catch (err) {
        setError('Failed to load settings');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleChange = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await settingsService.updateSettings(settings);
      setSuccessMsg('Settings saved successfully');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleRunRetentionNow = async () => {
    setSaving(true);
    setError('');
    try {
      const response = await settingsService.runRetentionCleanup();
      const auditDeleted = response?.result?.audit_logs_deleted ?? 0;
      const projectsDeleted = response?.result?.projects_deleted ?? 0;
      setSuccessMsg(`Retention cleanup completed. Deleted ${auditDeleted} audit logs and ${projectsDeleted} projects.`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to run retention cleanup');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        Loading settings...
      </div>
    );
  }

  const retentionOptions = [1, 7, 14, 30, 90, 365];
  const isEnabled = (key, fallback = false) => (settings[key] ?? fallback) === true;

  const Toggle = ({ active, onToggle }) => (
    <button
      onClick={onToggle}
      className={`relative w-12 h-6 rounded-full transition ${active ? 'bg-emerald-500' : 'bg-slate-600'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${active ? 'translate-x-6' : ''}`} />
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-['Space_Grotesk']">
      <div className="max-w-6xl mx-auto px-6 py-10 md:px-10">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-10 text-slate-100">System Settings</h1>

        {error && <div className="bg-rose-500/10 border border-rose-400/40 text-rose-200 px-4 py-3 rounded mb-4">{error}</div>}
        {successMsg && <div className="bg-emerald-500/10 border border-emerald-400/40 text-emerald-200 px-4 py-3 rounded mb-4">{successMsg}</div>}

        <div className="space-y-6 bg-slate-900/80 border border-slate-800/80 rounded-xl p-6">
          <section className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Default User Role</label>
              <select
                value={settings.default_user_role || 'developer'}
                onChange={(e) => handleChange('default_user_role', e.target.value)}
                className="w-full rounded-lg border border-slate-700/60 bg-slate-950/60 py-2 px-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
              >
                <option value="developer">Developer</option>
                <option value="team_lead">Lead</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </section>

          <section className="border-t border-slate-800 pt-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-300">Access & Registration</h3>
              <p className="mt-1 text-xs text-slate-500">Controls whether new users can sign up without admin approval.</p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-slate-100">Allow self-registration</span>
                <p className="text-xs text-slate-500">When off, only admins can create accounts.</p>
              </div>
              <Toggle active={isEnabled('allow_self_registration', true)} onToggle={() => handleChange('allow_self_registration', !isEnabled('allow_self_registration', true))} />
            </div>
          </section>

          <section className="border-t border-slate-800 pt-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-300">Retention & Cleanup</h3>
              <p className="mt-1 text-xs text-slate-500">Audit logs use their own retention period. Completed projects use a separate retention period and are deleted with their tasks, comments, and GitHub links when they expire.</p>
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1">Audit log retention period</label>
              <select
                value={settings.audit_log_retention_days ?? 30}
                onChange={(e) => handleChange('audit_log_retention_days', Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700/60 bg-slate-950/60 py-2 px-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
              >
                {retentionOptions.map((days) => (
                  <option key={days} value={days}>{days} day{days === 1 ? '' : 's'}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-slate-100">Auto-delete completed projects</span>
                <p className="text-xs text-slate-500">Deletes completed projects and their related data after the project retention period expires.</p>
              </div>
              <Toggle active={isEnabled('auto_archive_completed_projects', true)} onToggle={() => handleChange('auto_archive_completed_projects', !isEnabled('auto_archive_completed_projects', true))} />
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1">Completed project retention period</label>
              <select
                value={settings.project_retention_days ?? 30}
                onChange={(e) => handleChange('project_retention_days', Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700/60 bg-slate-950/60 py-2 px-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
              >
                {retentionOptions.map((days) => (
                  <option key={days} value={days}>{days} day{days === 1 ? '' : 's'}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleRunRetentionNow}
              disabled={saving}
              className="w-full rounded-lg border border-slate-700/70 bg-slate-950/60 py-2 px-4 text-sm font-semibold text-slate-100 hover:border-slate-500 hover:bg-slate-900 disabled:opacity-50 transition"
            >
              {saving ? 'Running retention...' : 'Run retention now'}
            </button>
          </section>

          {/* Task Alerts removed — notifications are not toggleable */}

          <div className="pt-4">
            <button onClick={handleSave} disabled={saving}
              className="w-full rounded-lg bg-rose-500/90 py-2 px-4 text-white font-semibold hover:bg-rose-400 disabled:opacity-50 transition">
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
};

export default AdminSystemSettings;
