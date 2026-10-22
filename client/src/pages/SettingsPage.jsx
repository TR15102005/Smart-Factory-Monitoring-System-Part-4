import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import './SettingsPage.css';

const SPEED_OPTIONS = [1000, 2000, 3000, 5000, 10000];

const STATE_PILL = {
  running: 'pill pill-ok',
  paused: 'pill pill-warn',
  stopped: 'pill pill-bad'
};

const fmt = v => (v ? new Date(v).toLocaleString() : '');

export default function SettingsPage({ user, onToast, simStatus, onSimStatus }) {
  const [settings, setSettings] = useState(null);
  const [thresholds, setThresholds] = useState({
    proximityM: '',
    lowBatteryPct: '',
    commTimeoutS: '',
    tempLimitC: '',
    overCapacityEnabled: true,
    restrictedAreaEnabled: true
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [simBusy, setSimBusy] = useState(false);
  const [simError, setSimError] = useState('');
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState('');

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const s = await api.settings();
      setSettings(s);
      setThresholds({
        proximityM: s.thresholds?.proximityM ?? '',
        lowBatteryPct: s.thresholds?.lowBatteryPct ?? '',
        commTimeoutS: s.thresholds?.commTimeoutS ?? '',
        tempLimitC: s.thresholds?.tempLimitC ?? '',
        overCapacityEnabled: Boolean(s.thresholds?.overCapacityEnabled),
        restrictedAreaEnabled: Boolean(s.thresholds?.restrictedAreaEnabled)
      });
    } catch (e) {
      setError(e.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    setLogsError('');
    try {
      setLogs(await api.auditLogs(100));
    } catch (e) {
      setLogsError(e.message || 'Failed to load audit logs');
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);
  useEffect(() => { loadLogs(); }, [loadLogs]);

  const saveThresholds = async e => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const updated = await api.saveSettings({
        thresholds: {
          proximityM: Number(thresholds.proximityM),
          lowBatteryPct: Number(thresholds.lowBatteryPct),
          commTimeoutS: Number(thresholds.commTimeoutS),
          tempLimitC: Number(thresholds.tempLimitC),
          overCapacityEnabled: thresholds.overCapacityEnabled,
          restrictedAreaEnabled: thresholds.restrictedAreaEnabled
        }
      });
      setSettings(updated);
      onToast('Settings saved');
    } catch (err) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const runSimAction = async (label, fn) => {
    setSimBusy(true);
    setSimError('');
    try {
      const result = await fn();
      onSimStatus(result);
      onToast(`${label} — simulation ${result?.state || 'updated'} (tick ${result?.tickMs}ms)`);
    } catch (err) {
      setSimError(err.message || 'Simulation action failed');
    } finally {
      setSimBusy(false);
    }
  };

  const handleReset = () => {
    if (!window.confirm('Reset the factory simulation? Simulated telemetry data will be re-seeded.')) return;
    runSimAction('Simulation reset', api.simulation.reset);
  };

  const handleSpeed = e => {
    const tickMs = Number(e.target.value);
    runSimAction(`Speed set to ${tickMs}ms`, () => api.simulation.speed(tickMs));
  };

  const state = simStatus?.state || 'stopped';
  const numericField = (key, label, step) => (
    <label className="field st-field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        min="0"
        value={thresholds[key]}
        onChange={e => setThresholds(t => ({ ...t, [key]: e.target.value }))}
      />
    </label>
  );

  if (loading) {
    return <div className="st-page"><div className="panel st-loading">Loading settings…</div></div>;
  }

  return (
    <div className="st-page">
      <section className="panel">
        <h2>Safety Rule Thresholds</h2>
        {error && <div className="form-error">{error}</div>}
        <form className="st-form" onSubmit={saveThresholds}>
          <div className="st-grid">
            {numericField('proximityM', 'Proximity limit (m)', '0.1')}
            {numericField('lowBatteryPct', 'Low battery (%)', '1')}
            {numericField('commTimeoutS', 'Comm timeout (s)', '1')}
            {numericField('tempLimitC', 'Temperature limit (°C)', '1')}
          </div>
          <label className="st-check">
            <input
              type="checkbox"
              checked={thresholds.overCapacityEnabled}
              onChange={e => setThresholds(t => ({ ...t, overCapacityEnabled: e.target.checked }))}
            />
            Over-capacity alerts enabled
          </label>
          <label className="st-check">
            <input
              type="checkbox"
              checked={thresholds.restrictedAreaEnabled}
              onChange={e => setThresholds(t => ({ ...t, restrictedAreaEnabled: e.target.checked }))}
            />
            Restricted-area alerts enabled
          </label>
          <div>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
        {settings?.note && <p className="st-note">{settings.note}</p>}
      </section>

      <section className="panel">
        <div className="st-sim-head">
          <h2>Factory Simulation</h2>
          <span className={STATE_PILL[state] || 'pill pill-bad'}>{state}</span>
        </div>
        <p className="st-sim-sub">
          Simulated data source{user ? ` — controlling as ${user.username || user.fullName || user.role}` : ''}.
          Current tick: {simStatus?.tickMs ?? '—'} ms.
        </p>
        {simError && <div className="form-error">{simError}</div>}
        <div className="st-sim-controls">
          <button
            type="button"
            className="btn btn-primary"
            disabled={simBusy}
            onClick={() => runSimAction('Simulation resumed', api.simulation.resume)}
          >
            Start / Resume
          </button>
          <button
            type="button"
            className="btn"
            disabled={simBusy}
            onClick={() => runSimAction('Simulation paused', api.simulation.pause)}
          >
            Pause
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={simBusy}
            onClick={() => runSimAction('Simulation stopped', api.simulation.stop)}
          >
            Stop
          </button>
          <button type="button" className="btn" disabled={simBusy} onClick={handleReset}>
            Reset
          </button>
          <label className="field st-speed">
            <span>Speed (tick ms)</span>
            <select value={simStatus?.tickMs ?? 2000} onChange={handleSpeed} disabled={simBusy}>
              {SPEED_OPTIONS.map(ms => (
                <option key={ms} value={ms}>{ms} ms</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="st-audit-head">
          <h2>Audit Log</h2>
          <button type="button" className="btn btn-sm" onClick={loadLogs} disabled={logsLoading}>
            {logsLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
        {logsError && <div className="form-error">{logsError}</div>}
        {logsLoading && !logs.length ? (
          <div className="st-loading">Loading audit logs…</div>
        ) : logs.length === 0 ? (
          <div className="st-loading">No audit log entries yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log._id}>
                    <td>{fmt(log.at)}</td>
                    <td>{log.username}</td>
                    <td>{log.role || '—'}</td>
                    <td>{log.action}</td>
                    <td>{log.target || '—'}</td>
                    <td className="st-details">{log.details || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
