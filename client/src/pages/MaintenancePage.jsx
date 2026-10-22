import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import './MaintenancePage.css';

const SEV_PILL = { high: 'pill-bad', medium: 'pill-warn', low: 'pill-info', none: 'pill-ok' };
const REC_STATUS_PILL = { scheduled: 'pill-info', completed: 'pill-ok', overdue: 'pill-bad' };

const EMPTY_FORM = {
  robot: '',
  type: 'scheduled',
  status: 'scheduled',
  performedAt: '',
  dueAt: '',
  notes: ''
};

const fmt = d => (d ? new Date(d).toLocaleString() : '—');
const fmtDate = d => (d ? new Date(d).toLocaleDateString() : '—');
const toISO = v => (v ? new Date(v).toISOString() : undefined);

export default function MaintenancePage({ user, onToast }) {
  const [predictions, setPredictions] = useState([]);
  const [records, setRecords] = useState([]);
  const [robots, setRobots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const isAdmin = user?.role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [preds, recs, rbts] = await Promise.all([
        api.maintenance.predictions(),
        api.maintenance.list(),
        api.robots()
      ]);
      setPredictions(Array.isArray(preds) ? preds : []);
      setRecords(Array.isArray(recs) ? recs : []);
      setRobots(Array.isArray(rbts) ? rbts : []);
    } catch (e) {
      setError(e.message || 'Failed to load maintenance data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setField = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const handleCreate = async e => {
    e.preventDefault();
    setFormError('');
    if (!form.robot) {
      setFormError('Select a robot before creating a record.');
      return;
    }
    setSaving(true);
    try {
      await api.maintenance.create({
        robot: form.robot,
        type: form.type,
        status: form.status,
        performedAt: toISO(form.performedAt),
        dueAt: toISO(form.dueAt),
        notes: form.notes
      });
      onToast('Maintenance record created');
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setFormError(err.message || 'Failed to create maintenance record');
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async rec => {
    setBusyId(rec._id);
    try {
      await api.maintenance.update(rec._id, {
        status: 'completed',
        performedAt: new Date().toISOString()
      });
      onToast(`Maintenance for ${rec.robot?.robotId || 'robot'} marked completed`);
      await load();
    } catch (err) {
      onToast(`Update failed: ${err.message}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-page">
      <section className="panel">
        <h2>Predictive Maintenance (rule-based)</h2>
        <p className="mt-disclaimer">
          Rule-based recommendations from simulated telemetry — not certified failure predictions.
        </p>

        {loading ? (
          <div className="empty">Loading predictions…</div>
        ) : error ? (
          <div className="form-error">{error}</div>
        ) : predictions.length === 0 ? (
          <div className="empty">No robots available for prediction</div>
        ) : (
          <div className="table-wrap">
            <table className="mt-table">
              <thead>
                <tr>
                  <th>Robot ID</th>
                  <th>Name</th>
                  <th>Workstation</th>
                  <th>Op. hours</th>
                  <th>Battery</th>
                  <th>Faults (30d)</th>
                  <th>Condition</th>
                  <th>Conditions detected</th>
                  <th>Recommendation</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {predictions.map(p => (
                  <tr key={p.robot}>
                    <td className="mt-robot-id">{p.robotId}</td>
                    <td>{p.name || '—'}</td>
                    <td>{p.workspace?.zoneCode || '—'}</td>
                    <td>{p.operatingHours}h</td>
                    <td>{p.batteryPercent}%</td>
                    <td>{p.faults30d}</td>
                    <td>
                      <span className={`pill ${SEV_PILL[p.severity] || 'pill-info'}`}>{p.severity}</span>
                    </td>
                    <td className="mt-conditions">
                      {p.conditions && p.conditions.length ? (
                        <ul>
                          {p.conditions.map((c, i) => (
                            <li key={i}>
                              <span className={`mt-cond-sev mt-cond-${c.severity}`}>{c.severity}</span>
                              {c.rule} <small>({c.data})</small>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <small>None</small>
                      )}
                    </td>
                    <td className="mt-reco">{p.recommendation}</td>
                    <td>
                      <span className={`pill ${REC_STATUS_PILL[p.status] || 'pill-info'}`}>{p.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Maintenance Records</h2>

        {loading ? (
          <div className="empty">Loading records…</div>
        ) : error ? (
          <div className="form-error">{error}</div>
        ) : records.length === 0 ? (
          <div className="empty">No maintenance records yet</div>
        ) : (
          <div className="table-wrap">
            <table className="mt-table">
              <thead>
                <tr>
                  <th>Robot</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Performed</th>
                  <th>Due</th>
                  <th>Technician</th>
                  <th>Notes</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {records.map(rec => (
                  <tr key={rec._id}>
                    <td className="mt-robot-id">{rec.robot?.robotId || '—'}</td>
                    <td className="mt-type">{rec.type}</td>
                    <td>
                      <span className={`pill ${REC_STATUS_PILL[rec.status] || 'pill-info'}`}>
                        {rec.status}
                      </span>
                    </td>
                    <td>{fmt(rec.performedAt)}</td>
                    <td>{fmtDate(rec.dueAt)}</td>
                    <td>{rec.technician || 'system'}</td>
                    <td className="mt-notes">{rec.notes || '—'}</td>
                    {isAdmin && (
                      <td>
                        {(rec.status === 'scheduled' || rec.status === 'overdue') ? (
                          <div className="actions">
                            <button
                              className="btn btn-sm btn-primary"
                              disabled={busyId === rec._id}
                              onClick={() => handleComplete(rec)}
                            >
                              Mark completed
                            </button>
                          </div>
                        ) : (
                          <small>—</small>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {isAdmin && (
          <div className="mt-form-panel">
            <h3 className="sub-heading">New Record</h3>
            {formError && <div className="form-error">{formError}</div>}
            <form className="mt-form" onSubmit={handleCreate}>
              <label className="field">
                <span>Robot</span>
                <select value={form.robot} onChange={e => setField('robot', e.target.value)} required>
                  <option value="">Select robot…</option>
                  {robots.map(r => (
                    <option key={r._id} value={r._id}>
                      {r.robotId}{r.name ? ` — ${r.name}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Type</span>
                <select value={form.type} onChange={e => setField('type', e.target.value)}>
                  {['scheduled', 'corrective', 'inspection', 'battery'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Status</span>
                <select value={form.status} onChange={e => setField('status', e.target.value)}>
                  {['scheduled', 'completed', 'overdue'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Performed at</span>
                <input
                  type="datetime-local"
                  value={form.performedAt}
                  onChange={e => setField('performedAt', e.target.value)}
                />
              </label>
              <label className="field">
                <span>Due at</span>
                <input
                  type="datetime-local"
                  value={form.dueAt}
                  onChange={e => setField('dueAt', e.target.value)}
                />
              </label>
              <label className="field mt-form-notes">
                <span>Notes</span>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={e => setField('notes', e.target.value)}
                  placeholder="Optional notes…"
                />
              </label>
              <button className="btn btn-primary mt-form-submit" type="submit" disabled={saving}>
                {saving ? 'Creating…' : 'Create record'}
              </button>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}
