import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

const EMPTY_FORM = { username: '', fullName: '', password: '', role: 'operator' };

export default function AdminPanel({ currentUser, summary, onToast }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setUsers(await api.users());
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }));

  const createUser = async e => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await api.createUser(form);
      onToast(`User "${created.username}" created with role ${created.role}`);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (user, role) => {
    setError('');
    try {
      await api.setUserRole(user.id, role);
      onToast(`${user.username} is now ${role}`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async user => {
    setError('');
    try {
      await api.deleteUser(user.id);
      onToast(`User "${user.username}" deleted`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const stats = summary ? [
    ['Workspaces', summary.workspaces?.total],
    ['Robots', summary.robots?.total],
    ['Workers', summary.workers?.total],
    ['Open incidents', summary.safety?.openIncidents]
  ] : [];

  return (
    <div className="admin-wrap">
      <div className="panel">
        <h2>User Management</h2>
        {error && <div className="form-error">{error}</div>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Full name</th>
                <th>Role</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.username}{u.id === currentUser.id && <small> (you)</small>}</td>
                  <td>{u.fullName || <small>&mdash;</small>}</td>
                  <td>
                    <span className={u.role === 'admin' ? 'role-badge role-admin' : 'role-badge role-operator'}>
                      {u.role}
                    </span>
                  </td>
                  <td><small>{new Date(u.createdAt).toLocaleDateString()}</small></td>
                  <td>
                    {u.id !== currentUser.id ? (
                      <div className="actions">
                        <button
                          className="btn btn-sm"
                          onClick={() => changeRole(u, u.role === 'admin' ? 'operator' : 'admin')}
                        >
                          {u.role === 'admin' ? 'Demote to operator' : 'Promote to admin'}
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => remove(u)}>Delete</button>
                      </div>
                    ) : <small>&mdash;</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-side">
        <div className="panel">
          <h2>Create New User</h2>
          <form className="admin-form" onSubmit={createUser}>
            <label className="field">
              <span>Username</span>
              <input value={form.username} onChange={set('username')} required minLength={3} placeholder="e.g. jdoe" />
            </label>
            <label className="field">
              <span>Full name</span>
              <input value={form.fullName} onChange={set('fullName')} placeholder="Optional" />
            </label>
            <label className="field">
              <span>Password</span>
              <input type="password" value={form.password} onChange={set('password')} required minLength={6} placeholder="Min 6 characters" />
            </label>
            <label className="field">
              <span>Role</span>
              <select value={form.role} onChange={set('role')}>
                <option value="operator">operator</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Creating...' : 'Create User'}
            </button>
          </form>
        </div>

        <div className="panel">
          <h2>System Overview</h2>
          <div className="admin-stats">
            {stats.map(([label, value]) => (
              <div className="admin-stat" key={label}>
                <strong>{value ?? '—'}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <p className="admin-note">
            Only admins see this panel. Operators get the Dashboard and Core Feature views without
            user management.
          </p>
        </div>
      </div>
    </div>
  );
}
