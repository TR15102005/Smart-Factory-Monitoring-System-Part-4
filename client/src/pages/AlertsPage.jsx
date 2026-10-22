import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import './AlertsPage.css';

const ACTION_ROLES = ['admin', 'safety_officer'];
const EMPTY_FILTERS = { q: '', severity: '', status: '', workspace: '', from: '', to: '' };

const SEV_PILL = {
  low: 'pill-info',
  medium: 'pill-warn',
  high: 'pill-bad',
  critical: 'pill-critical'
};
const STATUS_PILL = {
  open: 'pill-bad',
  acknowledged: 'pill-warn',
  investigating: 'pill-info',
  resolved: 'pill-ok'
};

const fmt = d => (d ? new Date(d).toLocaleString() : '—');
const prettyType = t => (t ? String(t).replace(/-/g, ' ') : '—');

export default function AlertsPage({ user, incidents, workspaces, onToast, onRefresh }) {
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async f => {
    setLoading(true);
    setError('');
    try {
      const params = { limit: 200 };
      for (const key of ['q', 'severity', 'status', 'workspace', 'from', 'to']) {
        if (f[key]) params[key] = f[key];
      }
      const data = await api.incidents(params);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || 'Failed to load alerts');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(filters);
  }, [filters, load]);

  // Live merge: prepend socket-delivered incidents not present in the fetched list.
  const merged = useMemo(() => {
    const ids = new Set(rows.map(r => r._id));
    const extra = (incidents || []).filter(i => i && i._id && !ids.has(i._id));
    return extra.length ? [...extra, ...rows] : rows;
  }, [rows, incidents]);

  const summary = useMemo(() => {
    const active = merged.filter(i => i.status === 'open' || i.status === 'acknowledged');
    const bySev = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const a of active) {
      if (bySev[a.severity] !== undefined) bySev[a.severity] += 1;
    }
    return { total: active.length, bySev };
  }, [merged]);

  const canAct = Boolean(user) && ACTION_ROLES.includes(user.role);

  const setField = (key, value) => setDraft(d => ({ ...d, [key]: value }));
  const applyFilters = () => setFilters({ ...draft });
  const resetFilters = () => {
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
  };

  const afterMutation = async () => {
    await Promise.all([load(filters), Promise.resolve(onRefresh && onRefresh())]);
  };

  const handleAcknowledge = async (inc, e) => {
    e.stopPropagation();
    setBusyId(inc._id);
    try {
      await api.acknowledgeIncident(inc._id);
      onToast(`Alert ${inc.incidentId} acknowledged`);
      await afterMutation();
    } catch (err) {
      onToast(`Acknowledge failed: ${err.message}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleResolve = async (inc, e) => {
    e.stopPropagation();
    const notes = window.prompt(`Resolution notes for ${inc.incidentId}:`, '');
    if (notes === null) return;
    setBusyId(inc._id);
    try {
      await api.resolveIncident(inc._id, notes || 'Resolved from alerts page');
      onToast(`Alert ${inc.incidentId} resolved`);
      await afterMutation();
    } catch (err) {
      onToast(`Resolve failed: ${err.message}`);
    } finally {
      setBusyId(null);
    }
  };

  const renderDetails = inc => (
    <div className="al-details">
      <div className="al-detail-grid">
        <div>
          <span>Description</span>
          <p>{inc.description || '—'}</p>
        </div>
        <div>
          <span>Recommended response</span>
          <p>{inc.recommendedResponse || '—'}</p>
        </div>
        <div>
          <span>Reported by</span>
          <p>{inc.reportedBy || 'system'}</p>
        </div>
        {inc.robot && (
          <div>
            <span>Robot</span>
            <p>{inc.robot.robotId}{inc.robot.name ? ` — ${inc.robot.name}` : ''}</p>
          </div>
        )}
        {inc.worker && (
          <div>
            <span>Worker</span>
            <p>{inc.worker.name || '—'}</p>
          </div>
        )}
        <div>
          <span>Acknowledged</span>
          <p>
            {inc.acknowledgedBy
              ? `${inc.acknowledgedBy} at ${fmt(inc.acknowledgedAt)}`
              : '—'}
          </p>
        </div>
        <div>
          <span>Resolution notes</span>
          <p>{inc.resolutionNotes || '—'}</p>
        </div>
        <div>
          <span>Resolved at</span>
          <p>{fmt(inc.resolvedAt)}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="al-page">
      <section className="panel">
        <h2>Alert Filters</h2>
        <div className="al-filter-grid">
          <label className="field">
            <span>Search</span>
            <input
              type="text"
              placeholder="ID, type or description…"
              value={draft.q}
              onChange={e => setField('q', e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') applyFilters(); }}
            />
          </label>
          <label className="field">
            <span>Severity</span>
            <select value={draft.severity} onChange={e => setField('severity', e.target.value)}>
              <option value="">All severities</option>
              {['low', 'medium', 'high', 'critical'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select value={draft.status} onChange={e => setField('status', e.target.value)}>
              <option value="">All statuses</option>
              {['open', 'acknowledged', 'investigating', 'resolved'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Workstation</span>
            <select value={draft.workspace} onChange={e => setField('workspace', e.target.value)}>
              <option value="">All workstations</option>
              {(workspaces || []).map(w => (
                <option key={w._id} value={w._id}>
                  {w.zoneCode}{w.name ? ` — ${w.name}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>From</span>
            <input type="date" value={draft.from} onChange={e => setField('from', e.target.value)} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" value={draft.to} onChange={e => setField('to', e.target.value)} />
          </label>
          <div className="al-filter-actions">
            <button className="btn btn-primary" onClick={applyFilters}>Apply</button>
            <button className="btn" onClick={resetFilters}>Reset</button>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Alerts</h2>
        <div className="al-summary">
          <span className="pill pill-info al-summary-total">{summary.total} active</span>
          {['low', 'medium', 'high', 'critical'].map(s => (
            <span key={s} className={`pill ${SEV_PILL[s]}`}>
              {s}: {summary.bySev[s]}
            </span>
          ))}
        </div>

        {error && <div className="form-error">{error}</div>}

        {loading ? (
          <div className="empty">Loading alerts…</div>
        ) : !error && merged.length === 0 ? (
          <div className="empty">No alerts match the current filters</div>
        ) : (
          <div className="table-wrap">
            <table className="al-table">
              <thead>
                <tr>
                  <th>Event ID</th>
                  <th>Timestamp</th>
                  <th>Workstation</th>
                  <th>Type</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Acknowledged</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {merged.map(inc => (
                  <Fragment key={inc._id}>
                    <tr
                      className={expanded === inc._id ? 'al-row al-row-open' : 'al-row'}
                      onClick={() => setExpanded(expanded === inc._id ? null : inc._id)}
                    >
                      <td className="al-id">{inc.incidentId}</td>
                      <td>{fmt(inc.occurredAt)}</td>
                      <td>{inc.workspace?.zoneCode || '—'}</td>
                      <td className="al-type">{prettyType(inc.type)}</td>
                      <td>
                        <span className={`pill ${SEV_PILL[inc.severity] || 'pill-info'}`}>
                          {inc.severity}
                        </span>
                      </td>
                      <td>
                        <span className={`pill ${STATUS_PILL[inc.status] || 'pill-info'}`}>
                          {inc.status}
                        </span>
                      </td>
                      <td>
                        <span className={inc.simulated ? 'al-source al-source-sim' : 'al-source al-source-manual'}>
                          {inc.simulated ? 'SIMULATED' : 'MANUAL'}
                        </span>
                      </td>
                      <td className="al-ack">
                        {inc.acknowledgedBy
                          ? `${inc.acknowledgedBy} · ${fmt(inc.acknowledgedAt)}`
                          : '—'}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        {canAct ? (
                          <div className="actions">
                            {inc.status === 'open' && (
                              <button
                                className="btn btn-sm"
                                disabled={busyId === inc._id}
                                onClick={e => handleAcknowledge(inc, e)}
                              >
                                Acknowledge
                              </button>
                            )}
                            {inc.status !== 'resolved' && (
                              <button
                                className="btn btn-sm btn-primary"
                                disabled={busyId === inc._id}
                                onClick={e => handleResolve(inc, e)}
                              >
                                Resolve
                              </button>
                            )}
                          </div>
                        ) : (
                          <small>—</small>
                        )}
                      </td>
                    </tr>
                    {expanded === inc._id && (
                      <tr className="al-details-row">
                        <td colSpan={9}>{renderDetails(inc)}</td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
