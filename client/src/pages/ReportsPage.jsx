import { useState } from 'react';
import { api } from '../api.js';
import './ReportsPage.css';

const REPORT_TYPES = [
  { id: 'occupancy', label: 'Worker occupancy', slug: 'worker-occupancy' },
  { id: 'utilization', label: 'Robot utilization', slug: 'robot-utilization' },
  { id: 'incidents', label: 'Safety incidents', slug: 'safety-incidents' },
  { id: 'faults', label: 'Robot faults', slug: 'robot-faults' },
  { id: 'maintenance', label: 'Maintenance history', slug: 'maintenance-history' },
  { id: 'activity', label: 'Workstation activity', slug: 'workstation-activity' }
];

const isoDate = d => d.toISOString().slice(0, 10);
const fmtDate = v => (v ? new Date(v).toLocaleString() : '');

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildRows(type, result) {
  switch (type) {
    case 'occupancy':
      return {
        columns: [
          { key: 'zoneCode', label: 'Zone' },
          { key: 'name', label: 'Name' },
          { key: 'occupancy', label: 'Occupancy' },
          { key: 'maxOccupancy', label: 'Max occupancy' },
          { key: 'status', label: 'Status' },
          { key: 'safetyScore', label: 'Safety score' }
        ],
        rows: (result || []).map(z => ({
          zoneCode: z.zoneCode, name: z.name, occupancy: z.occupancy,
          maxOccupancy: z.maxOccupancy, status: z.status, safetyScore: z.safetyScore
        }))
      };
    case 'utilization': {
      const perRobot = result?.perRobot || [];
      return {
        columns: [
          { key: 'robotId', label: 'Robot' },
          { key: 'utilization', label: 'Avg utilization %' }
        ],
        rows: perRobot.map(r => ({ robotId: r.robotId, utilization: r.utilization }))
      };
    }
    case 'incidents':
      return {
        columns: [
          { key: 'incidentId', label: 'Incident ID' },
          { key: 'occurredAt', label: 'Occurred at' },
          { key: 'type', label: 'Type' },
          { key: 'severity', label: 'Severity' },
          { key: 'status', label: 'Status' },
          { key: 'workspace', label: 'Workspace' },
          { key: 'robot', label: 'Robot' },
          { key: 'worker', label: 'Worker' },
          { key: 'description', label: 'Description' }
        ],
        rows: (result || []).map(i => ({
          incidentId: i.incidentId,
          occurredAt: fmtDate(i.occurredAt),
          type: i.type,
          severity: i.severity,
          status: i.status,
          workspace: i.workspace?.zoneCode || i.workspace?.name || '',
          robot: i.robot?.robotId || '',
          worker: i.worker?.name || '',
          description: i.description || ''
        }))
      };
    case 'faults':
      return {
        columns: [
          { key: 'robotId', label: 'Robot' },
          { key: 'faults', label: 'Fault count' }
        ],
        rows: (result || []).map(f => ({ robotId: f.robotId, faults: f.faults }))
      };
    case 'maintenance':
      return {
        columns: [
          { key: 'robot', label: 'Robot' },
          { key: 'type', label: 'Type' },
          { key: 'status', label: 'Status' },
          { key: 'performedAt', label: 'Performed at' },
          { key: 'dueAt', label: 'Due at' },
          { key: 'technician', label: 'Technician' },
          { key: 'notes', label: 'Notes' }
        ],
        rows: (result || []).map(m => ({
          robot: m.robot?.robotId || m.robot || '',
          type: m.type,
          status: m.status,
          performedAt: fmtDate(m.performedAt),
          dueAt: fmtDate(m.dueAt),
          technician: m.technician || '',
          notes: m.notes || ''
        }))
      };
    case 'activity':
      return {
        columns: [
          { key: 'zoneCode', label: 'Zone' },
          { key: 'name', label: 'Name' },
          { key: 'status', label: 'Status' },
          { key: 'safetyScore', label: 'Safety score' },
          { key: 'incidents7d', label: 'Incidents (7d)' }
        ],
        rows: (result || []).map(w => ({
          zoneCode: w.zoneCode, name: w.name, status: w.status,
          safetyScore: w.safetyScore, incidents7d: w.incidents7d
        }))
      };
    default:
      return { columns: [], rows: [] };
  }
}

export default function ReportsPage({ workspaces: _workspaces }) {
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 3600 * 1000);
  const [type, setType] = useState('incidents');
  const [from, setFrom] = useState(isoDate(weekAgo));
  const [to, setTo] = useState(isoDate(today));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null); // { type, label, generatedAt, from, to, columns, rows }

  const typeMeta = REPORT_TYPES.find(t => t.id === type);

  const generate = async () => {
    setError('');
    if (from > to) {
      setError('Start date must be on or before the end date.');
      return;
    }
    setLoading(true);
    try {
      let result;
      switch (type) {
        case 'occupancy': result = await api.analytics.occupancy(); break;
        case 'utilization': result = await api.analytics.robotUtilization({ from, to }); break;
        case 'incidents': result = await api.incidents({ from, to, limit: 500 }); break;
        case 'faults': result = await api.analytics.faultFrequency({ from, to }); break;
        case 'maintenance': result = await api.maintenance.list(); break;
        case 'activity': result = await api.analytics.workspaceSafety(); break;
        default: throw new Error('Unknown report type');
      }
      const { columns, rows } = buildRows(type, result);
      setReport({
        type,
        label: typeMeta.label,
        slug: typeMeta.slug,
        generatedAt: new Date().toLocaleString(),
        from,
        to,
        columns,
        rows
      });
    } catch (e) {
      setError(e.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const download = () => {
    if (!report || !report.rows.length) return;
    const lines = [
      report.columns.map(c => csvEscape(c.label)).join(','),
      ...report.rows.map(r => report.columns.map(c => csvEscape(r[c.key])).join(','))
    ];
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.slug}_${report.from}_${report.to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const preview = report ? report.rows.slice(0, 50) : [];

  return (
    <div className="rp-page">
      <section className="panel">
        <h2>Report builder</h2>
        <div className="rp-controls">
          <label className="field">
            <span>Report type</span>
            <select value={type} onChange={e => setType(e.target.value)}>
              {REPORT_TYPES.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>From</span>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </label>
          <div className="rp-actions">
            <button type="button" className="btn btn-primary" onClick={generate} disabled={loading}>
              {loading ? 'Generating…' : 'Generate'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={download}
              disabled={!report || !report.rows.length}
            >
              Download CSV
            </button>
          </div>
        </div>
        {error && <div className="form-error rp-error">{error}</div>}
      </section>

      {loading && <div className="panel rp-loading">Generating report…</div>}

      {report && !loading && (
        <section className="panel">
          <div className="rp-header">
            <div>
              <h2>{report.label}</h2>
              <p className="rp-meta">
                Generated at {report.generatedAt} &middot; Range: {report.from} to {report.to}
              </p>
            </div>
            <span className="pill pill-info rp-count">{report.rows.length} row{report.rows.length === 1 ? '' : 's'}</span>
          </div>

          {report.rows.length === 0 ? (
            <div className="rp-empty">No records in the selected range</div>
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>{report.columns.map(c => <th key={c.key}>{c.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i}>
                        {report.columns.map(c => <td key={c.key}>{String(r[c.key] ?? '')}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="rp-preview-note">
                Showing first {preview.length} of {report.rows.length} rows. Download CSV for the full report.
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
