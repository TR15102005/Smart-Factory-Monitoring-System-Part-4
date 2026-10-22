import { useCallback, useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Title,
  Filler
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { api } from '../api.js';
import './AnalyticsPage.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Title,
  Filler
);

const TICK = '#9aa3b8';
const GRID = 'rgba(42,51,80,0.6)';
const SEV_COLORS = {
  low: '#37c98b',
  medium: '#f5b544',
  high: '#f26d6d',
  critical: '#e0447c'
};
const STATUS_COLORS = {
  running: '#37c98b',
  idle: '#f5b544',
  charging: '#4f9cf9',
  warning: '#f5b544',
  error: '#f26d6d',
  'e-stop': '#e0447c',
  maintenance: '#8b96b8',
  offline: '#2a3350'
};

const HOURS_OPTIONS = [12, 24, 72, 168];

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename, header, rows) {
  const csv = [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const axis = (extra = {}) => ({
  ticks: { color: TICK },
  grid: { color: GRID },
  ...extra
});

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: TICK } },
    tooltip: { backgroundColor: '#1a2140', borderColor: '#2a3350', borderWidth: 1 }
  },
  scales: { x: axis(), y: axis({ beginAtZero: true }) }
};

const stackedOptions = {
  ...baseOptions,
  scales: { x: axis({ stacked: true }), y: axis({ stacked: true, beginAtZero: true }) }
};

const horizontalOptions = {
  ...baseOptions,
  indexAxis: 'y'
};

const doughnutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'right', labels: { color: TICK } },
    tooltip: { backgroundColor: '#1a2140', borderColor: '#2a3350', borderWidth: 1 }
  }
};

const lineOptions = {
  ...baseOptions,
  elements: { point: { backgroundColor: '#4f9cf9' } }
};

function ChartPanel({ title, empty, onExport, children }) {
  return (
    <section className="panel an-panel">
      <div className="an-panel-head">
        <h2>{title}</h2>
        {onExport && !empty && (
          <button type="button" className="btn btn-sm" onClick={onExport}>Export CSV</button>
        )}
      </div>
      {empty ? (
        <div className="an-empty">No data for the selected range</div>
      ) : (
        <div className="an-chart">{children}</div>
      )}
    </section>
  );
}

export default function AnalyticsPage({ workspaces }) {
  const [hours, setHours] = useState(24);
  const [workspace, setWorkspace] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const wsParam = workspace ? { workspace } : {};
      const [overview, robotUtilization, occupancy, safetyIncidents, robotHours, faultFrequency, workspaceSafety] =
        await Promise.all([
          api.analytics.overview(),
          api.analytics.robotUtilization({ hours, ...wsParam }),
          api.analytics.occupancy(),
          api.analytics.safetyIncidents({ days: 14, ...wsParam }),
          api.analytics.robotHours(),
          api.analytics.faultFrequency({ hours }),
          api.analytics.workspaceSafety()
        ]);
      setData({ overview, robotUtilization, occupancy, safetyIncidents, robotHours, faultFrequency, workspaceSafety });
    } catch (e) {
      setError(e.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [hours, workspace]);

  useEffect(() => { load(); }, [load]);

  const exportUtilization = () => {
    const rows = (data?.robotUtilization?.perRobot || []).map(r => [r.robotId, r.utilization]);
    downloadCsv(`robot-utilization_${hours}h.csv`, ['Robot', 'Avg utilization %'], rows);
  };

  const exportDailyIncidents = () => {
    const rows = (data?.safetyIncidents?.daily || [])
      .map(d => [d.date, d.low, d.medium, d.high, d.critical, d.total]);
    downloadCsv('safety-incidents-daily_14d.csv', ['Date', 'Low', 'Medium', 'High', 'Critical', 'Total'], rows);
  };

  if (loading && !data) {
    return (
      <div className="an-page">
        <div className="panel an-loading">Loading analytics…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="an-page">
        <div className="form-error">{error}</div>
        <button type="button" className="btn btn-primary" onClick={load}>Retry</button>
      </div>
    );
  }

  const perRobot = data?.robotUtilization?.perRobot || [];
  const robotsByStatus = data?.overview?.robotsByStatus || {};
  const occupancy = data?.occupancy || [];
  const daily = data?.safetyIncidents?.daily || [];
  const weekly = data?.safetyIncidents?.weekly || [];
  const workspaceSafety = data?.workspaceSafety || [];
  const robotHours = data?.robotHours || [];
  const faultFrequency = data?.faultFrequency || [];

  const statusLabels = Object.keys(robotsByStatus);

  return (
    <div className="an-page">
      <div className="panel an-filters">
        <label className="field">
          <span>Time range</span>
          <select value={hours} onChange={e => setHours(Number(e.target.value))}>
            {HOURS_OPTIONS.map(h => (
              <option key={h} value={h}>{h < 24 ? `${h} hours` : h < 168 ? `${h / 24} days` : '7 days'}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Workstation</span>
          <select value={workspace} onChange={e => setWorkspace(e.target.value)}>
            <option value="">All workstations</option>
            {(workspaces || []).map(ws => (
              <option key={ws._id || ws.zoneCode} value={ws._id}>{ws.zoneCode}</option>
            ))}
          </select>
        </label>
        {loading && <span className="an-refreshing">Refreshing…</span>}
      </div>

      <div className="an-grid">
        <ChartPanel title="Robot utilization (avg %)" empty={!perRobot.length} onExport={exportUtilization}>
          <Bar
            data={{
              labels: perRobot.map(r => r.robotId),
              datasets: [{
                label: 'Avg utilization %',
                data: perRobot.map(r => r.utilization),
                backgroundColor: '#4f9cf9',
                borderRadius: 4
              }]
            }}
            options={baseOptions}
          />
        </ChartPanel>

        <ChartPanel title="Robot status distribution" empty={!statusLabels.length}>
          <Doughnut
            data={{
              labels: statusLabels,
              datasets: [{
                data: statusLabels.map(s => robotsByStatus[s]),
                backgroundColor: statusLabels.map(s => STATUS_COLORS[s] || '#8b5cf6'),
                borderColor: '#141a2e'
              }]
            }}
            options={doughnutOptions}
          />
        </ChartPanel>

        <ChartPanel title="Workstation occupancy vs capacity" empty={!occupancy.length}>
          <Bar
            data={{
              labels: occupancy.map(z => z.zoneCode),
              datasets: [
                { label: 'Occupancy', data: occupancy.map(z => z.occupancy), backgroundColor: '#37c98b', borderRadius: 4 },
                { label: 'Max occupancy', data: occupancy.map(z => z.maxOccupancy), backgroundColor: '#2a3350', borderRadius: 4 }
              ]
            }}
            options={baseOptions}
          />
        </ChartPanel>

        <ChartPanel title="Daily safety incidents by severity (14 days)" empty={!daily.length} onExport={exportDailyIncidents}>
          <Bar
            data={{
              labels: daily.map(d => d.date),
              datasets: ['low', 'medium', 'high', 'critical'].map(sev => ({
                label: sev,
                data: daily.map(d => d[sev] || 0),
                backgroundColor: SEV_COLORS[sev],
                borderRadius: 2
              }))
            }}
            options={stackedOptions}
          />
        </ChartPanel>

        <ChartPanel title="Weekly incident trend" empty={!weekly.length}>
          <Line
            data={{
              labels: weekly.map(w => w.week),
              datasets: [{
                label: 'Incidents',
                data: weekly.map(w => w.count),
                borderColor: '#4f9cf9',
                backgroundColor: 'rgba(79,156,249,0.15)',
                fill: true,
                tension: 0.3
              }]
            }}
            options={lineOptions}
          />
        </ChartPanel>

        <ChartPanel title="Workstation safety comparison" empty={!workspaceSafety.length}>
          <Bar
            data={{
              labels: workspaceSafety.map(w => w.zoneCode),
              datasets: [
                { label: 'Safety score', data: workspaceSafety.map(w => w.safetyScore), backgroundColor: '#37c98b', borderRadius: 4 },
                { label: 'Incidents (7d)', data: workspaceSafety.map(w => w.incidents7d), backgroundColor: '#f26d6d', borderRadius: 4 }
              ]
            }}
            options={baseOptions}
          />
        </ChartPanel>

        <ChartPanel title="Robot operating hours" empty={!robotHours.length}>
          <Bar
            data={{
              labels: robotHours.map(r => r.robotId),
              datasets: [{
                label: 'Operating hours',
                data: robotHours.map(r => r.operatingHours),
                backgroundColor: '#8b5cf6',
                borderRadius: 4
              }]
            }}
            options={horizontalOptions}
          />
        </ChartPanel>

        <ChartPanel title="Robot fault frequency" empty={!faultFrequency.length}>
          <Bar
            data={{
              labels: faultFrequency.map(f => f.robotId),
              datasets: [{
                label: 'Faults',
                data: faultFrequency.map(f => f.faults),
                backgroundColor: '#f5b544',
                borderRadius: 4
              }]
            }}
            options={baseOptions}
          />
        </ChartPanel>
      </div>
    </div>
  );
}
