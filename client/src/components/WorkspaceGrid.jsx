const STATUS_TONE = { operational: 'ok', restricted: 'warn', shutdown: 'bad' };

export default function WorkspaceGrid({ workspaces, telemetry }) {
  return (
    <section className="panel">
      <h2>Collaborative Workspaces</h2>
      <div className="ws-grid">
        {workspaces.map(ws => {
          const live = (ws.robots || []).map(r => telemetry[r._id]).filter(Boolean);
          const running = live.filter(r => r.status === 'running').length;
          const avgUtil = live.length
            ? Math.round(live.reduce((s, r) => s + r.utilizationRate, 0) / live.length)
            : 0;
          return (
            <div key={ws._id} className="ws-card">
              <div className="ws-head">
                <div>
                  <span className="ws-code">{ws.zoneCode}</span>
                  <h3>{ws.name}</h3>
                </div>
                <span className={`pill pill-${STATUS_TONE[ws.status] || 'ok'}`}>{ws.status}</span>
              </div>
              <div className="ws-meta">
                <span>{ws.type.replace(/-/g, ' ')}</span>
                <span>{ws.collaborationMode.replace(/-/g, ' ')}</span>
              </div>
              <div className="ws-stats">
                <div><b>{live.length}</b><span>robots ({running} running)</span></div>
                <div><b>{(ws.workers || []).length}</b><span>workers assigned</span></div>
                <div><b>{avgUtil}%</b><span>avg utilization</span></div>
                <div><b>{ws.openIncidents}</b><span>open incidents</span></div>
              </div>
              <div className="ws-bar-row">
                <span>safety {ws.safetyScore}</span>
                <div className="bar"><div
                  className={`bar-fill ${ws.safetyScore >= 90 ? 'fill-ok' : ws.safetyScore >= 75 ? 'fill-warn' : 'fill-bad'}`}
                  style={{ width: `${ws.safetyScore}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
