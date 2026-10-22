function Kpi({ label, value, sub, tone }) {
  return (
    <div className={`kpi ${tone ? `kpi-${tone}` : ''}`}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

export default function KpiCards({ summary }) {
  if (!summary) {
    return <div className="kpi-grid">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="kpi skeleton" />)}</div>;
  }
  const { robots, workers, workspaces, safety, compliance } = summary;
  return (
    <div className="kpi-grid">
      <Kpi label="Total Workstations" value={workspaces.total}
        sub={`${workspaces.operational} operational · ${workspaces.restricted} restricted`}
        tone={workspaces.restricted > 0 ? 'warn' : 'good'} />
      <Kpi label="Total Workers" value={workers.total}
        sub={`${workers.active} on floor · ${workers.onBreak} on break`}
        tone={workers.expiredCerts > 0 ? 'warn' : 'good'} />
      <Kpi label="Total Robots" value={robots.total}
        sub={`${robots.maintenance} in maintenance`} />
      <Kpi label="Running Robots" value={robots.running}
        sub={`avg utilization ${robots.avgUtilization}%`}
        tone={robots.running > 0 ? 'good' : 'warn'} />
      <Kpi label="Idle Robots" value={robots.idle}
        sub={`${robots.charging ?? 0} charging · ${robots.warning ?? 0} warning`} />
      <Kpi label="Faulty Robots" value={robots.faulted}
        sub="error or e-stop" tone={robots.faulted > 0 ? 'bad' : 'good'} />
      <Kpi label="Active Safety Alerts" value={safety.openIncidents}
        sub={`${safety.incidents24h} in 24h · ${safety.critical24h} high/critical`}
        tone={safety.critical24h > 0 ? 'bad' : safety.openIncidents > 5 ? 'warn' : 'good'} />
      <Kpi label="Overall Safety" value={safety.avgSafetyScore}
        sub={`compliance ${compliance.rate}%`}
        tone={safety.avgSafetyScore >= 90 ? 'good' : safety.avgSafetyScore >= 75 ? 'warn' : 'bad'} />
    </div>
  );
}
