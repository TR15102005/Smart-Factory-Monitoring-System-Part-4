import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import './RobotsPage.css';

const STATUS_LABELS = {
  running: 'Running',
  idle: 'Idle',
  charging: 'Charging',
  warning: 'Warning',
  maintenance: 'Maintenance',
  error: 'Fault',
  'e-stop': 'Emergency Stop'
};

const STATUS_TONE = {
  running: 'ok',
  idle: 'warn',
  charging: 'info',
  warning: 'warn',
  maintenance: 'info',
  error: 'bad',
  'e-stop': 'bad'
};

const STATUS_CHIPS = ['all', 'running', 'idle', 'charging', 'warning', 'maintenance', 'error', 'e-stop'];

const emptyForm = {
  robotId: '',
  name: '',
  model: '',
  vendor: '',
  kind: 'cobot',
  workspace: '',
  firmware: ''
};

export default function RobotsPage({ user, telemetry, workspaces, onToast, onRefresh }) {
  const isAdmin = user?.role === 'admin';
  const canControl = isAdmin || user?.role === 'operator';

  const [robots, setRobots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [kind, setKind] = useState('all');

  const [expandedId, setExpandedId] = useState(null);
  const [details, setDetails] = useState({}); // id -> { loading, history, maintenance, error }

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async (filters) => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (filters.q.trim()) params.q = filters.q.trim();
      if (filters.status && filters.status !== 'all') params.status = filters.status;
      if (filters.kind && filters.kind !== 'all') params.kind = filters.kind;
      const list = await api.robots(params);
      setRobots(list);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load({ q: '', status: 'all', kind: 'all' });
  }, [load]);

  const applyFilters = () => load({ q, status, kind });

  const selectChip = (value) => {
    setStatus(value);
    load({ q, status: value, kind });
  };

  const selectKind = (value) => {
    setKind(value);
    load({ q, status, kind: value });
  };

  const toggleRow = async (id) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (details[id]) return;
    setDetails(d => ({ ...d, [id]: { loading: true, history: [], maintenance: [], error: '' } }));
    try {
      const [history, maintenance] = await Promise.all([
        api.robotStatusHistory(id),
        api.robotMaintenance(id)
      ]);
      setDetails(d => ({ ...d, [id]: { loading: false, history, maintenance, error: '' } }));
    } catch (e) {
      setDetails(d => ({ ...d, [id]: { loading: false, history: [], maintenance: [], error: e.message } }));
    }
  };

  const setStatusFor = async (robot, nextStatus) => {
    setBusyId(robot._id);
    setFormError('');
    try {
      await api.setRobotStatus(robot._id, nextStatus);
      onToast(`Robot ${robot.robotId} set to ${STATUS_LABELS[nextStatus] || nextStatus}`);
      await load({ q, status, kind });
      onRefresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (r) => {
    setEditingId(r._id);
    setForm({
      robotId: r.robotId || '',
      name: r.name || '',
      model: r.model || '',
      vendor: r.vendor || '',
      kind: r.kind || 'cobot',
      workspace: r.workspace?._id || '',
      firmware: r.firmware || ''
    });
    setFormError('');
    setShowForm(true);
  };

  const setField = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const submitForm = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      if (editingId) {
        await api.updateRobot(editingId, form);
        onToast(`Robot ${form.robotId} updated`);
      } else {
        await api.createRobot(form);
        onToast(`Robot ${form.robotId} created`);
      }
      setShowForm(false);
      setEditingId(null);
      await load({ q, status, kind });
      onRefresh();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const removeRobot = async (r) => {
    if (!window.confirm(`Delete robot ${r.robotId}${r.name ? ` (${r.name})` : ''}?`)) return;
    try {
      await api.deleteRobot(r._id);
      onToast(`Robot ${r.robotId} deleted`);
      if (expandedId === r._id) setExpandedId(null);
      await load({ q, status, kind });
      onRefresh();
    } catch (err) {
      setFormError(err.message);
      setShowForm(true);
    }
  };

  return (
    <div className="rp-page">
      <section className="panel">
        <div className="rp-head">
          <h2>Robots ({robots.length})</h2>
          {isAdmin && (
            <button className="btn btn-primary btn-sm" onClick={openAdd}>Add Robot</button>
          )}
        </div>

        <div className="rp-filters">
          <label className="field rp-search">
            <span>Search (ID / name)</span>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') applyFilters(); }}
              placeholder="e.g. RBT-01"
            />
          </label>
          <label className="field">
            <span>Kind</span>
            <select value={kind} onChange={e => selectKind(e.target.value)}>
              <option value="all">All kinds</option>
              <option value="cobot">Cobot</option>
              <option value="agv">AGV</option>
              <option value="industrial-arm">Industrial arm</option>
            </select>
          </label>
          <div className="rp-filter-actions">
            <button className="btn btn-primary btn-sm" onClick={applyFilters}>Search</button>
          </div>
        </div>

        <div className="filter-row rp-chips">
          {STATUS_CHIPS.map(s => (
            <button
              key={s}
              className={status === s ? 'chip active' : 'chip'}
              onClick={() => selectChip(s)}
            >
              {s === 'all' ? 'all' : STATUS_LABELS[s] || s}
            </button>
          ))}
        </div>

        {loading && <div className="empty">Loading robots…</div>}
        {!loading && error && <div className="form-error">{error}</div>}

        {!loading && !error && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Robot ID</th><th>Name</th><th>Type</th><th>Workstation</th><th>Status</th>
                  <th>Battery %</th><th>Utilization %</th><th>Operating hours</th><th>Last comm.</th>
                  {(canControl || isAdmin) && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {robots.length === 0 && (
                  <tr>
                    <td colSpan={canControl || isAdmin ? 10 : 9} className="empty">
                      No robots match the filters.
                    </td>
                  </tr>
                )}
                {robots.map(r => {
                  const live = telemetry?.[r._id];
                  const status2 = live?.status ?? r.status;
                  const util = live?.utilizationRate ?? r.utilizationRate;
                  const battery = live?.batteryPercent ?? r.batteryPercent;
                  const expanded = expandedId === r._id;
                  const detail = details[r._id];
                  const commSecs = r.lastCommAt
                    ? Math.max(0, Math.round((now - new Date(r.lastCommAt).getTime()) / 1000))
                    : null;
                  const showActions = canControl || isAdmin;
                  return (
                    <RobotRows
                      key={r._id}
                      r={r}
                      status={status2}
                      util={util}
                      battery={battery}
                      commSecs={commSecs}
                      expanded={expanded}
                      detail={detail}
                      showActions={showActions}
                      isAdmin={isAdmin}
                      canControl={canControl}
                      busy={busyId === r._id}
                      onToggle={() => toggleRow(r._id)}
                      onSetStatus={s => setStatusFor(r, s)}
                      onEdit={() => openEdit(r)}
                      onDelete={() => removeRobot(r)}
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
          <h2>{editingId ? 'Edit Robot' : 'Add Robot'}</h2>
          {formError && <div className="form-error">{formError}</div>}
          <form className="rp-form" onSubmit={submitForm}>
            <label className="field">
              <span>Robot ID</span>
              <input
                value={form.robotId}
                onChange={e => setField('robotId', e.target.value)}
                required
                disabled={!!editingId}
              />
            </label>
            <label className="field">
              <span>Name</span>
              <input value={form.name} onChange={e => setField('name', e.target.value)} />
            </label>
            <label className="field">
              <span>Model</span>
              <input value={form.model} onChange={e => setField('model', e.target.value)} required />
            </label>
            <label className="field">
              <span>Vendor</span>
              <input value={form.vendor} onChange={e => setField('vendor', e.target.value)} required />
            </label>
            <label className="field">
              <span>Kind</span>
              <select value={form.kind} onChange={e => setField('kind', e.target.value)}>
                <option value="cobot">Cobot</option>
                <option value="agv">AGV</option>
                <option value="industrial-arm">Industrial arm</option>
              </select>
            </label>
            <label className="field">
              <span>Workstation</span>
              <select value={form.workspace} onChange={e => setField('workspace', e.target.value)} required>
                <option value="">— Select workspace —</option>
                {(workspaces || []).map(ws => (
                  <option key={ws._id} value={ws._id}>{ws.zoneCode}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Firmware</span>
              <input value={form.firmware} onChange={e => setField('firmware', e.target.value)} placeholder="1.0.0" />
            </label>
            <div className="rp-form-actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create robot'}
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

function RobotRows({
  r, status, util, battery, commSecs, expanded, detail,
  showActions, isAdmin, canControl, busy,
  onToggle, onSetStatus, onEdit, onDelete
}) {
  const colSpan = showActions ? 10 : 9;
  const faulty = status === 'error' || status === 'e-stop';
  return (
    <>
      <tr className={expanded ? 'rp-row rp-row-open' : 'rp-row'} onClick={onToggle}>
        <td><b>{r.robotId}</b></td>
        <td>{r.name || '—'}</td>
        <td className="rp-kind">{r.kind}</td>
        <td>{r.workspace?.zoneCode || '—'}</td>
        <td>
          <span className={`pill pill-${STATUS_TONE[status] || 'info'}`}>
            {STATUS_LABELS[status] || status}
          </span>
        </td>
        <td>{battery != null ? `${Math.round(battery)}%` : '—'}</td>
        <td>{util != null ? `${Math.round(util)}%` : '—'}</td>
        <td>{r.operatingHours != null ? `${Number(r.operatingHours).toFixed(1)} h` : '—'}</td>
        <td className={commSecs != null && commSecs > 15 ? 'rp-comm rp-comm-stale' : 'rp-comm'}>
          {commSecs != null ? `${commSecs}s ago` : '—'}
        </td>
        {showActions && (
          <td className="actions rp-actions" onClick={e => e.stopPropagation()}>
            {canControl && (
              <>
                {status !== 'running' && !faulty && (
                  <button className="btn btn-sm" disabled={busy} onClick={() => onSetStatus('running')}>Run</button>
                )}
                {status !== 'idle' && !faulty && (
                  <button className="btn btn-sm" disabled={busy} onClick={() => onSetStatus('idle')}>Idle</button>
                )}
                {status !== 'maintenance' && !faulty && (
                  <button className="btn btn-sm" disabled={busy} onClick={() => onSetStatus('maintenance')}>Maint.</button>
                )}
                {faulty && (
                  <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => onSetStatus('idle')}>
                    Reset fault
                  </button>
                )}
              </>
            )}
            {isAdmin && (
              <>
                <button className="btn btn-sm" onClick={onEdit}>Edit</button>
                <button className="btn btn-sm btn-danger" onClick={onDelete}>Delete</button>
              </>
            )}
          </td>
        )}
      </tr>
      {expanded && (
        <tr className="rp-detail-row">
          <td colSpan={colSpan}>
            <div className="rp-detail">
              <div className="rp-detail-col">
                <h4>Status history</h4>
                {(!detail || detail.loading) && <small>Loading history…</small>}
                {detail && !detail.loading && detail.error && <div className="form-error">{detail.error}</div>}
                {detail && !detail.loading && !detail.error && detail.history.length === 0 && (
                  <small>No status changes recorded.</small>
                )}
                {detail && !detail.loading && !detail.error && detail.history.length > 0 && (
                  <ul className="rp-list">
                    {detail.history.map((h, i) => (
                      <li key={i}>
                        <span className={`pill pill-${STATUS_TONE[h.status] || 'info'}`}>
                          {STATUS_LABELS[h.status] || h.status}
                        </span>
                        <small>{h.at ? new Date(h.at).toLocaleString() : '—'}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rp-detail-col">
                <h4>Maintenance records</h4>
                {(!detail || detail.loading) && <small>Loading records…</small>}
                {detail && !detail.loading && detail.error && <div className="form-error">{detail.error}</div>}
                {detail && !detail.loading && !detail.error && detail.maintenance.length === 0 && (
                  <small>No maintenance records.</small>
                )}
                {detail && !detail.loading && !detail.error && detail.maintenance.length > 0 && (
                  <ul className="rp-list">
                    {detail.maintenance.map(m => (
                      <li key={m._id}>
                        <span className="rp-maint-type">{m.type}</span>
                        <span className={`pill pill-${m.status === 'completed' ? 'ok' : m.status === 'overdue' ? 'bad' : 'info'}`}>
                          {m.status}
                        </span>
                        <small>
                          {m.performedAt ? `done ${new Date(m.performedAt).toLocaleDateString()}` : ''}
                          {m.dueAt ? ` · due ${new Date(m.dueAt).toLocaleDateString()}` : ''}
                        </small>
                        {m.notes && <small className="rp-maint-notes">{m.notes}</small>}
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
