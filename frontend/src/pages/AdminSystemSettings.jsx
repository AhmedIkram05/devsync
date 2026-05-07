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

  const handleNestedToggle = (parent, key) => {
    setSettings((prev) => ({
      ...prev,
      [parent]: { ...(prev[parent] || {}), [key]: !(prev[parent] || {})[key] },
    }));
  };

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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        Loading settings...
      </div>
    );
  }

  const notifSettings = settings.notification_settings || {};

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
          <div>
            <label className="block text-sm text-slate-400 mb-1">Default User Role</label>
            <select value={settings.default_user_role || 'developer'} onChange={(e) => handleChange('default_user_role', e.target.value)}
              className="w-full rounded-lg border border-slate-700/60 bg-slate-950/60 py-2 px-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-400/60">
              <option value="developer">Developer</option>
              <option value="team_lead">Lead</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="border-t border-slate-800 pt-4">
            <h3 className="text-sm font-semibold mb-3 text-slate-300">Notification Settings</h3>
            <div className="space-y-3">
              {[{ key: 'email_notifications', label: 'Email Notifications' },
                { key: 'task_assignments', label: 'Task Assignment Alerts' },
                { key: 'project_updates', label: 'Project Update Alerts' }].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm">{label}</span>
                  <Toggle active={notifSettings[key]} onToggle={() => handleNestedToggle('notification_settings', key)} />
                </div>
              ))}
            </div>
          </div>

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
