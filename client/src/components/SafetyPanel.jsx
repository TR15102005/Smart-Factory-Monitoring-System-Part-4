import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { api } from '../api.js';

const SEV_TONE = { low: 'ok', medium: 'warn', high: 'bad', critical: 'bad' };
const SEV_COLORS = { low: '#37c98b', medium: '#f5b544', high: '#f26d6d', critical: '#e0447c' };

export default function SafetyPanel({ incidents, safetyByWs, workspaces, onResolve, onRefresh }) {
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState({ workspace: '', type: 'near-miss', severity: 'low', description: '' });

  const shown = filter === 'all' ? incidents : filter === 'open'
    ? incidents.filter(i => i.status !== 'resolved')
    : incidents.filter(i => i.severity === filter);

  const submit = async e => {
    e.preventDefault();
    if (!form.workspace) return;
    await api.reportIncident(form);
    setForm({ workspace: '', type: 'near-miss', severity: 'low', description: '' });
    onRefresh();
  };

  return (
    <div className="split">
      <div>
        <section className="panel">
          <h2>Incident Feed</h2>
          <div className="filter-row">
            {['all', 'open', 'critical', 'high', 'medium', 'low'].map(f => (
              <button key={f} className={filter === f ? 'chip active' : 'chip'} onClick={() => setFilter(f)}>{f}</button>
            ))}
          </div>
          <div className="incident-list">
            {shown.map(i => (
              <div key={i._id} className={`incident ${i.status === 'resolved' ? 'resolved' : ''}`}>
                <div className="incident-top">
                  <span className={`pill pill-${SEV_TONE[i.severity]}`}>{i.severity}</span>
                  <b>{i.type.replace(/-/g, ' ')}</b>
                  <span className="incident-id">{i.incidentId}</span>
                </div>
                <p>{i.description}</p>
                <div className="incident-meta">
                  <span>{i.workspace?.name || '—'} ({i.workspace?.zoneCode})</span>
                  <span>{new Date(i.occurredAt).toLocaleString()}</span>
                  <span>via {i.reportedBy}</span>
                  <span className={`status-tag status-${i.status}`}>{i.status}</span>
                </div>
                {i.status !== 'resolved' && (
                  <button className="btn btn-sm btn-primary" onClick={() => onResolve(i._id)}>Mark resolved</button>
                )}
              </div>
            ))}
            {shown.length === 0 && <p className="empty">No incidents match this filter.</p>}
          </div>
        </section>

        <section className="panel">
          <h2>Report Incident</h2>
          <form className="report-form" onSubmit={submit}>
            <select value={form.workspace} onChange={e => setForm({ ...form, workspace: e.target.value })} required>
              <option value="">Select workspace…</option>
              {workspaces.map(w => <option key={w._id} value={w._id}>{w.zoneCode} — {w.name}</option>)}
            </select>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              {['near-miss', 'zone-intrusion', 'e-stop-triggered', 'collision', 'force-limit-exceeded', 'equipment-fault', 'ergonomic-risk']
                .map(t => <option key={t} value={t}>{t.replace(/-/g, ' ')}</option>)}
            </select>
            <select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
              {['low', 'medium', 'high', 'critical'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input placeholder="Description…" value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })} />
            <button className="btn btn-primary" type="submit">Report</button>
          </form>
        </section>
      </div>

      <section className="panel">
        <h2>7-Day Incidents by Zone</h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={safetyByWs} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a3350" />
            <XAxis type="number" stroke="#8b96b8" fontSize={11} allowDecimals={false} />
            <YAxis type="category" dataKey="zoneCode" stroke="#8b96b8" fontSize={11} width={55} />
            <Tooltip contentStyle={{ background: '#141a2e', border: '1px solid #2a3350', borderRadius: 8 }} />
            <Bar dataKey="incidents7d" name="Incidents (7d)" radius={[0, 4, 4, 0]}>
              {safetyByWs.map((w, idx) => (
                <Cell key={idx} fill={w.safetyScore >= 90 ? SEV_COLORS.low : w.safetyScore >= 75 ? SEV_COLORS.medium : SEV_COLORS.high} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="score-list">
          {safetyByWs.map(w => (
            <div key={w.zoneCode} className="score-row">
              <span>{w.zoneCode} — {w.workspace}</span>
              <div className="bar bar-sm">
                <div className={`bar-fill ${w.safetyScore >= 90 ? 'fill-ok' : w.safetyScore >= 75 ? 'fill-warn' : 'fill-bad'}`}
                  style={{ width: `${w.safetyScore}%` }} />
              </div>
              <b>{w.safetyScore}</b>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
