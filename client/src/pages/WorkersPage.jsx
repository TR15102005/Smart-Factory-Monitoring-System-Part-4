import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import './WorkersPage.css';

const STATUS_TONE = { active: 'ok', break: 'warn', training: 'info', offline: 'bad' };
const CERT_TONE = { valid: 'ok', 'expiring-soon': 'warn', expired: 'bad' };

const emptyForm = {
  employeeId: '',
  name: '',
  role: '',
  department: '',
  shift: 'morning',
  status: 'active',
  workspace: '',
  cobotSafetyTrained: false
};

export default function WorkersPage({ user, workspaces, onToast, onRefresh }) {
  const isAdmin = user?.role === 'admin';

  const [workers, setWorkers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [q, setQ] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('');

  const [expandedId, setExpandedId] = useState(null);
  const [details, setDetails] = useState({}); // id -> { loading, activity, error }

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (filters) => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (filters.q.trim()) params.q = filters.q.trim();
      if (filters.department) params.department = filters.department;
      if (filters.status) params.status = filters.status;
      const [list, deps] = await Promise.all([api.workers(params), api.workerDepartments()]);
      setWorkers(list);
      setDepartments(deps);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load({ q: '', department: '', status: '' });
  }, [load]);

  const applyFilters = () => load({ q, department, status });

  const resetFilters = () => {
    setQ('');
    setDepartment('');
    setStatus('');
    load({ q: '', department: '', status: '' });
  };

  const toggleRow = async (id) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (details[id]) return;
    setDetails(d => ({ ...d, [id]: { loading: true, activity: [], error: '' } }));
    try {
      const activity = await api.workerActivity(id);
      setDetails(d => ({ ...d, [id]: { loading: false, activity, error: '' } }));
    } catch (e) {
      setDetails(d => ({ ...d, [id]: { loading: false, activity: [], error: e.message } }));
    }
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (w) => {
    setEditingId(w._id);
    setForm({
      employeeId: w.employeeId || '',
      name: w.name || '',
      role: w.role || '',
      department: w.department || '',
      shift: w.shift || 'morning',
      status: w.status || 'active',
      workspace: w.workspace?._id || '',
      cobotSafetyTrained: !!w.cobotSafetyTrained
    });
    setFormError('');
    setShowForm(true);
  };

  const setField = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const submitForm = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    const body = { ...form, cobotSafetyTrained: !!form.cobotSafetyTrained };
    if (!body.workspace) delete body.workspace;
    try {
      if (editingId) {
        await api.updateWorker(editingId, body);
        onToast(`Worker ${body.name || body.employeeId} updated`);
      } else {
        await api.createWorker(body);
        onToast(`Worker ${body.name || body.employeeId} created`);
      }
      setShowForm(false);
      setEditingId(null);
      await load({ q, department, status });
      onRefresh();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const removeWorker = async (w) => {
    if (!window.confirm(`Delete worker ${w.name} (${w.employeeId})?`)) return;
    try {
      await api.deleteWorker(w._id);
      onToast(`Worker ${w.name} deleted`);
      if (expandedId === w._id) setExpandedId(null);
      await load({ q, department, status });
      onRefresh();
    } catch (err) {
      setFormError(err.message);
      setShowForm(true);
    }
  };

  return (
    <div className="wp-page">
      <section className="panel">
        <div className="wp-head">
          <h2>Workers ({workers.length})</h2>
          {isAdmin && (
            <button className="btn btn-primary btn-sm" onClick={openAdd}>Add Worker</button>
          )}
        </div>

        <div className="wp-filters">
          <label className="field">
            <span>Search (name / ID)</span>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') applyFilters(); }}
              placeholder="e.g. Raj or EMP-001"
            />
          </label>
          <label className="field">
            <span>Department</span>
            <select value={department} onChange={e => setDepartment(e.target.value)}>
              <option value="">All departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="break">Break</option>
              <option value="offline">Offline</option>
              <option value="training">Training</option>
            </select>
          </label>
          <div className="wp-filter-actions">
            <button className="btn btn-primary btn-sm" onClick={applyFilters}>Search</button>
            <button className="btn btn-sm" onClick={resetFilters}>Reset</button>
          </div>
        </div>

        {loading && <div className="empty">Loading workers…</div>}
        {!loading && error && <div className="form-error">{error}</div>}

        {!loading && !error && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee ID</th><th>Name</th><th>Role</th><th>Department</th>
                  <th>Workstation</th><th>Status</th><th>Safety trained</th><th>Last activity</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {workers.length === 0 && (
                  <tr><td colSpan={isAdmin ? 9 : 8} className="empty">No workers match the filters.</td></tr>
                )}
                {workers.map(w => {
                  const expanded = expandedId === w._id;
                  const detail = details[w._id];
                  return (
                    <WorkerRows
                      key={w._id}
                      w={w}
                      expanded={expanded}
                      detail={detail}
                      isAdmin={isAdmin}
                      onToggle={() => toggleRow(w._id)}
                      onEdit={() => openEdit(w)}
                      onDelete={() => removeWorker(w)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isAdmin && showForm && (
        <section className="panel">
          <h2>{editingId ? 'Edit Worker' : 'Add Worker'}</h2>
          {formError && <div className="form-error">{formError}</div>}
          <form className="wp-form" onSubmit={submitForm}>
            <label className="field">
              <span>Employee ID</span>
              <input
                value={form.employeeId}
                onChange={e => setField('employeeId', e.target.value)}
                required
                disabled={!!editingId}
              />
            </label>
            <label className="field">
              <span>Name</span>
              <input value={form.name} onChange={e => setField('name', e.target.value)} required />
            </label>
            <label className="field">
              <span>Role</span>
              <input value={form.role} onChange={e => setField('role', e.target.value)} required />
            </label>
            <label className="field">
              <span>Department</span>
              <input
                value={form.department}
                onChange={e => setField('department', e.target.value)}
                list="wp-departments"
                placeholder="e.g. Production"
              />
              <datalist id="wp-departments">
                {departments.map(d => <option key={d} value={d} />)}
              </datalist>
            </label>
            <label className="field">
              <span>Shift</span>
              <select value={form.shift} onChange={e => setField('shift', e.target.value)}>
                <option value="morning">Morning</option>
                <option value="evening">Evening</option>
                <option value="night">Night</option>
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select value={form.status} onChange={e => setField('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="break">Break</option>
                <option value="offline">Offline</option>
                <option value="training">Training</option>
              </select>
            </label>
            <label className="field">
              <span>Workstation</span>
              <select value={form.workspace} onChange={e => setField('workspace', e.target.value)}>
                <option value="">— None —</option>
                {(workspaces || []).map(ws => (
                  <option key={ws._id} value={ws._id}>{ws.zoneCode}</option>
                ))}
              </select>
            </label>
            <label className="wp-check">
              <input
                type="checkbox"
                checked={form.cobotSafetyTrained}
                onChange={e => setField('cobotSafetyTrained', e.target.checked)}
              />
              <span>Cobot safety trained</span>
            </label>
            <div className="wp-form-actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create worker'}
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => { setShowForm(false); setEditingId(null); setFormError(''); }}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

function WorkerRows({ w, expanded, detail, isAdmin, onToggle, onEdit, onDelete }) {
  const colSpan = isAdmin ? 9 : 8;
  return (
    <>
      <tr className={expanded ? 'wp-row wp-row-open' : 'wp-row'} onClick={onToggle}>
        <td><b>{w.employeeId}</b></td>
        <td>{w.name}</td>
        <td>{w.role}</td>
        <td>{w.department || '—'}</td>
        <td>{w.workspace?.zoneCode || '—'}</td>
        <td>
          <span className={`pill pill-${STATUS_TONE[w.status] || 'info'}`}>{w.status}</span>
        </td>
        <td>{w.cobotSafetyTrained ? 'Yes' : 'No'}</td>
        <td>
          {w.lastActivityAt
            ? new Date(w.lastActivityAt).toLocaleString()
            : '—'}
        </td>
        {isAdmin && (
          <td className="actions" onClick={e => e.stopPropagation()}>
            <button className="btn btn-sm" onClick={onEdit}>Edit</button>
            <button className="btn btn-sm btn-danger" onClick={onDelete}>Delete</button>
          </td>
        )}
      </tr>
      {expanded && (
        <tr className="wp-detail-row">
          <td colSpan={colSpan}>
            <div className="wp-detail">
              <div className="wp-detail-col">
                <h4>Certifications</h4>
                {(w.certifications || []).length === 0 && <small>None on record.</small>}
                <ul className="wp-list">
                  {(w.certifications || []).map((c, i) => (
                    <li key={`${c.name}-${i}`}>
                      <span>{c.name}</span>
                      <small>expires {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : '—'}</small>
                      <span className={`pill pill-${CERT_TONE[c.status] || 'info'}`}>{c.status}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="wp-detail-col">
                <h4>Activity history</h4>
                {(!detail || detail.loading) && <small>Loading activity…</small>}
                {detail && !detail.loading && detail.error && <div className="form-error">{detail.error}</div>}
                {detail && !detail.loading && !detail.error && detail.activity.length === 0 && (
                  <small>No activity recorded.</small>
                )}
                {detail && !detail.loading && !detail.error && detail.activity.length > 0 && (
                  <ul className="wp-list wp-list-scroll">
                    {detail.activity.map((ev, i) => (
                      <li key={i}>
                        <span className="wp-ev-type">{ev.type}</span>
                        <small>{ev.zoneCode || '—'}</small>
                        <small>{ev.at ? new Date(ev.at).toLocaleString() : '—'}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
