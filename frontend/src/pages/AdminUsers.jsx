import { useState, useEffect, useCallback } from 'react';
import { adminUserService } from '../services/utils/api';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../utils/rbac';

const AdminUsers = () => {
  const { currentUser, is } = useAuth();
  const isAdmin = is('admin');
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '' });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', email: '', password: '', role: 'developer' });
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminUserService.getAllUsers();
      setUsers(data);
      setFilteredUsers(data);
    } catch (err) {
      setError('Failed to fetch users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    let result = users;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (u) => u.name?.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term)
      );
    }
    if (roleFilter !== 'all') {
      result = result.filter((u) => u.role === roleFilter);
    }
    setFilteredUsers(result);
  }, [searchTerm, roleFilter, users]);

  const handleRoleChange = async (userId, newRole) => {
    if (!isAdmin) return;
    try {
      setError('');
      await adminUserService.updateUserRole(userId, newRole);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
      setSuccessMsg('Role updated successfully');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to update role');
    }
  };

  const handleCreateUser = async () => {
    try {
      setError('');
      const response = await adminUserService.createUser(createForm);
      setUsers((prev) => [...prev, response.user]);
      setShowCreateModal(false);
      setCreateForm({ name: '', email: '', password: '', role: 'developer' });
      setSuccessMsg('User created successfully');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to create user');
    }
  };

  const handleEditSave = async () => {
    if (!editingUser || !isAdmin) return;
    try {
      setError('');
      await adminUserService.updateUser(editingUser.id, editForm);
      setUsers((prev) =>
        prev.map((u) => (u.id === editingUser.id ? { ...u, ...editForm } : u))
      );
      setEditingUser(null);
      setSuccessMsg('User updated successfully');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to update user');
    }
  };

  const handleDelete = async (userId) => {
    if (!isAdmin) return;
    try {
      setError('');
      await adminUserService.deleteUser(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setDeleteConfirm(null);
      setSuccessMsg('User deleted successfully');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to delete user');
    }
  };

  const roleBadge = (role) => {
    const colors = {
      admin: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
      team_lead: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      developer: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    };
    return colors[role] || 'bg-slate-500/20 text-slate-300 border-slate-500/30';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-['Space_Grotesk']">
      <div className="max-w-6xl mx-auto px-6 py-10 md:px-10">
        <div className="flex justify-between items-center mb-10">
          <h1 className="text-2xl font-bold text-slate-100">User Management</h1>
          {isAdmin && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 rounded-lg bg-rose-500/90 text-white font-semibold hover:bg-rose-400 transition"
            >
              + Create User
            </button>
          )}
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-400/40 text-rose-200 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-500/10 border border-emerald-400/40 text-emerald-200 px-4 py-3 rounded mb-4">
            {successMsg}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 rounded-lg border border-slate-700/60 bg-slate-900/80 py-2 px-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-lg border border-slate-700/60 bg-slate-900/80 py-2 px-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
          >
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="team_lead">Team Lead</option>
            <option value="developer">Developer</option>
          </select>
        </div>

        {/* Users Table */}
        {loading ? (
          <div className="text-center py-12 text-slate-400">Loading users...</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800/80">
            <table className="w-full text-left">
              <thead className="bg-slate-900/80 text-slate-400 text-sm uppercase">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  {isAdmin && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-800/30 transition">
                    <td className="px-4 py-3 text-sm text-slate-400">{user.id}</td>
                    <td className="px-4 py-3">{user.name}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{user.email}</td>
                    <td className="px-4 py-3">
                      {!isAdmin || user.id === currentUser?.id ? (
                        <span className={`text-xs px-2 py-1 rounded border ${roleBadge(user.role)}`}>
                          {user.role}
                        </span>
                      ) : (
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user.id, e.target.value)}
                          className="text-xs rounded border border-slate-700/60 bg-slate-900/80 py-1 px-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-rose-400/60"
                        >
                          <option value={ROLES.DEVELOPER}>Developer</option>
                          <option value={ROLES.TEAM_LEAD}>Team Lead</option>
                          <option value={ROLES.ADMIN}>Admin</option>
                        </select>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          onClick={() => {
                            setEditingUser(user);
                            setEditForm({ name: user.name, email: user.email });
                          }}
                          className="text-xs px-3 py-1 rounded bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 transition"
                        >
                          Edit
                        </button>
                        {user.id !== currentUser?.id && (
                          <button
                            onClick={() => setDeleteConfirm(user)}
                            className="text-xs px-3 py-1 rounded bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 transition"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 5 : 4} className="px-4 py-8 text-center text-slate-500">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
              <h2 className="text-xl font-bold mb-4 text-slate-100">Create New User</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    className="w-full rounded-lg border border-slate-700/60 bg-slate-950/60 py-2 px-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
                    placeholder="Full Name"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Email</label>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    className="w-full rounded-lg border border-slate-700/60 bg-slate-950/60 py-2 px-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
                    placeholder="email@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Password</label>
                  <input
                    type="password"
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    className="w-full rounded-lg border border-slate-700/60 bg-slate-950/60 py-2 px-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Initial Role</label>
                  <select
                    value={createForm.role}
                    onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                    className="w-full rounded-lg border border-slate-700/60 bg-slate-950/60 py-2 px-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
                  >
                    <option value={ROLES.DEVELOPER}>Developer</option>
                    <option value={ROLES.TEAM_LEAD}>Team Lead</option>
                    <option value={ROLES.ADMIN}>Admin</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-8">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateUser}
                  className="px-4 py-2 rounded-lg bg-rose-500/90 text-white font-semibold hover:bg-rose-400 transition"
                >
                  Create User
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editingUser && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md">
              <h2 className="text-lg font-semibold mb-4">Edit User</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full rounded-lg border border-slate-700/60 bg-slate-950/60 py-2 px-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Email</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full rounded-lg border border-slate-700/60 bg-slate-950/60 py-2 px-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-8">
                <button
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditSave}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-sm">
              <h2 className="text-lg font-semibold mb-2 text-rose-300">Confirm Delete</h2>
              <p className="text-slate-400 mb-6">
                Are you sure you want to delete <strong className="text-slate-200">{deleteConfirm.name}</strong>? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm.id)}
                  className="px-4 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-500 transition"
                >
                  Delete User
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminUsers;
