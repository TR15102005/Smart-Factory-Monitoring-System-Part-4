import { useState } from 'react';

const STATUS_CLASS = { running: 'st-running', idle: 'st-idle', charging: 'st-charging', warning: 'st-warn', maintenance: 'st-maint', error: 'st-fault', 'e-stop': 'st-fault' };

const FILTERS = [
  { id: 'all', label: 'All workstations' },
  { id: 'safe', label: 'Safe' },
  { id: 'warning', label: 'Warning' },
  { id: 'critical', label: 'Critical' },
  { id: 'high', label: 'High occupancy' }
];

const zoneLevel = z => (z.status === 'restricted' || z.hazards > 0 ? 'critical'
  : z.overCapacity || z.occupancy >= z.maxOccupancy - 1 ? 'warning' : 'safe');

const matchesFilter = (z, filter) => {
  if (filter === 'all') return true;
  if (filter === 'high') return z.maxOccupancy > 0 && z.occupancy / z.maxOccupancy >= 0.8;
  return zoneLevel(z) === filter;
};

function FloorPlan({ zone }) {
  return (
    <svg className="zone-svg" viewBox={`-0.5 -0.5 ${zone.widthM + 1} ${zone.heightM + 1}`} preserveAspectRatio="xMidYMid meet">
      {zone.areas.map(a => (
        <g key={a.areaId}>
          <rect className={`area area-${a.kind}`} x={a.x} y={a.y} width={a.w} height={a.h} rx={0.3}>
            <title>{a.label || a.areaId} — {a.kind.replace('-', ' ')}</title>
          </rect>
          <text className="area-label" x={a.x + 0.4} y={a.y + 1.1}>{a.label}</text>
        </g>
      ))}
      {zone.robots.map(r => r.x != null && (
        r.kind === 'agv' ? (
          <g key={r.id}>
            <circle className={`robot-mark ${STATUS_CLASS[r.status] || 'st-idle'}`} cx={r.x} cy={r.y} r={0.8}>
              <title>{r.robotId} — {r.status}{r.batteryPercent != null ? ` · battery ${Math.round(r.batteryPercent)}%` : ''}</title>
            </circle>
            <text className="mark-label" x={r.x} y={r.y - 1.1}>{r.robotId}</text>
          </g>
        ) : (
          <g key={r.id}>
            <rect className={`robot-mark ${STATUS_CLASS[r.status] || 'st-idle'}`} x={r.x - 1} y={r.y - 1} width={2} height={2} rx={0.3}>
              <title>{r.robotId} — {r.status}{r.currentTask ? ` · ${r.currentTask}` : ''}</title>
            </rect>
            <text className="mark-label" x={r.x} y={r.y - 1.4}>{r.robotId}</text>
          </g>
        )
      ))}
      {zone.workers.map(w => w.x != null && (
        <g key={w.id}>
          <circle className={w.inHazard ? 'worker-dot worker-hazard' : 'worker-dot'} cx={w.x} cy={w.y} r={0.55}>
            <title>{w.name}{w.inHazard ? ' — IN PROTECTIVE FIELD' : ''}</title>
          </circle>
        </g>
      ))}
    </svg>
  );
}

export default function ZoneLayoutPanel({ zones }) {
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState('all');
  const all = zones || [];
  const list = all.filter(z => matchesFilter(z, filter));
  const zone = list.find(z => z.workspaceId === selectedId) || list[0];

  if (!all.length) return <section className="panel"><p className="empty">Loading zone layouts…</p></section>;

  return (
    <section className="panel">
      <h2>Zone Layout & Live Occupancy</h2>
      <div className="filter-row">
        {FILTERS.map(f => (
          <button key={f.id} className={filter === f.id ? 'chip active' : 'chip'} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
        <span className="zone-filter-count">{list.length}/{all.length} shown</span>
      </div>
      {!zone ? (
        <p className="empty">No workstations match this filter right now.</p>
      ) : (
      <div className="zone-split">
        <div className="zone-list">
          {list.map(z => (
            <button
              key={z.workspaceId}
              className={z.workspaceId === zone.workspaceId ? 'zone-card active' : 'zone-card'}
              onClick={() => setSelectedId(z.workspaceId)}
            >
              <div className="zone-card-head">
                <b>{z.zoneCode}</b>
                <span className={z.overCapacity ? 'pill pill-bad' : z.occupancy >= z.maxOccupancy - 1 ? 'pill pill-warn' : 'pill pill-ok'}>
                  {z.occupancy}/{z.maxOccupancy}
                </span>
              </div>
              <span className="zone-card-name">{z.name}</span>
              <div className="bar bar-sm zone-bar">
                <div
                  className={`bar-fill ${z.overCapacity ? 'fill-bad' : z.occupancy / z.maxOccupancy > 0.75 ? 'fill-warn' : 'fill-ok'}`}
                  style={{ width: `${Math.min(100, (z.occupancy / z.maxOccupancy) * 100)}%` }}
                />
              </div>
              <div className="zone-card-meta">
                <span>{z.robotsActive} robots active</span>
                {z.hazards > 0 && <span className="pill pill-bad">{z.hazards} in hazard zone</span>}
                {z.status !== 'operational' && <span className="pill pill-warn">{z.status}</span>}
              </div>
            </button>
          ))}
        </div>

        <div className="zone-view">
          <div className="zone-view-head">
            <div>
              <h3>{zone.zoneCode} — {zone.name}</h3>
              <span className="zone-sub">
                {zone.occupancy} workers present (max {zone.maxOccupancy}) · {zone.robotsActive} robots active · safety {zone.safetyScore}
              </span>
            </div>
            {zone.hazards > 0 && <span className="pill pill-bad">{zone.hazards} worker{zone.hazards > 1 ? 's' : ''} in protective field</span>}
            {zone.overCapacity && <span className="pill pill-bad">over capacity</span>}
          </div>
          <FloorPlan zone={zone} />
          <div className="zone-legend">
            <span><i className="sw sw-robot-cell" /> robot cell</span>
            <span><i className="sw sw-walkway" /> walkway</span>
            <span><i className="sw sw-workstation" /> workstation</span>
            <span><i className="sw sw-staging" /> staging</span>
            <span><i className="sw sw-charging" /> charging</span>
            <span><i className="sw sw-restricted" /> restricted</span>
            <span><i className="sw sw-worker" /> worker</span>
            <span><i className="sw sw-hazard" /> worker in hazard</span>
            <span><i className="sw sw-running" /> robot running</span>
            <span><i className="sw sw-idle" /> robot idle</span>
            <span><i className="sw sw-charging-mark" /> robot charging</span>
            <span><i className="sw sw-fault" /> robot fault/e-stop</span>
          </div>
        </div>
      </div>
      )}
    </section>
  );
}
