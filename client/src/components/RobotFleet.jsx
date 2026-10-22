import { api } from '../api.js';

const STATUS_TONE = { running: 'ok', idle: 'warn', maintenance: 'info', error: 'bad', 'e-stop': 'bad' };

export default function RobotFleet({ robots, telemetry, onRefresh }) {
  const setStatus = async (id, status) => {
    await api.setRobotStatus(id, status);
    onRefresh();
  };

  return (
    <section className="panel">
      <h2>Robot Fleet ({robots.length})</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Robot</th><th>Kind</th><th>Workspace</th><th>Status</th>
              <th>Task</th><th>Utilization</th><th>Temp</th><th>Cycles/h</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {robots.map(r => {
              const live = telemetry[r._id];
              const util = live ? live.utilizationRate : r.utilizationRate;
              const temp = live ? live.temperatureC : r.temperatureC;
              const status = live ? live.status : r.status;
              return (
                <tr key={r._id}>
                  <td><b>{r.robotId}</b><br /><small>{r.vendor} {r.model}</small></td>
                  <td>{r.kind}</td>
                  <td>{r.workspace?.zoneCode || '—'} {r.workspace?.name ? `· ${r.workspace.name}` : ''}</td>
                  <td><span className={`pill pill-${STATUS_TONE[status] || 'info'}`}>{status}</span></td>
                  <td>{(live && live.currentTask) || r.currentTask || '—'}</td>
                  <td className="util-cell">
                    <div className="bar bar-sm">
                      <div className={`bar-fill ${util >= 60 ? 'fill-ok' : util > 0 ? 'fill-warn' : 'fill-idle'}`}
                        style={{ width: `${util}%` }} />
                    </div>
                    <span>{util}%</span>
                  </td>
                  <td className={temp > 65 ? 'temp-hot' : ''}>{temp?.toFixed?.(1) ?? temp}°C</td>
                  <td>{status === 'running' ? (live?.cyclesPerHour ?? r.cyclesPerHour) : 0}</td>
                  <td className="actions">
                    {status !== 'maintenance' && (
                      <button className="btn btn-sm" onClick={() => setStatus(r._id, 'maintenance')}>Maint.</button>
                    )}
                    {(status === 'error' || status === 'e-stop') && (
                      <button className="btn btn-sm btn-primary" onClick={() => setStatus(r._id, 'idle')}>Reset</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
