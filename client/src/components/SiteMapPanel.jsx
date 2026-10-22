import { useMemo, useState } from 'react';
import './SiteMapPanel.css';

const FAN_CLASS = {
  running: 'fan-run', idle: 'fan-idle', charging: 'fan-charge',
  warning: 'fan-warn', maintenance: 'fan-idle', error: 'fan-fault', 'e-stop': 'fan-fault'
};

const LAYER_DEFS = [
  { id: 'workers', label: 'Workers' },
  { id: 'hazards', label: 'Hazard zones' },
  { id: 'alerts', label: 'Safety alerts' },
  { id: 'robots', label: 'Robots' },
  { id: 'labels', label: 'Labels' }
];

function FanMark({ r, showLabel }) {
  return (
    <g className="fan-mark" transform={`translate(${r.x} ${r.y})`}>
      <title>
        {r.robotId} — {r.status}
        {r.currentTask ? ` · ${r.currentTask}` : ''}
        {r.batteryPercent != null ? ` · battery ${Math.round(r.batteryPercent)}%` : ''}
      </title>
      <circle className={`fan-hub ${FAN_CLASS[r.status] || 'fan-idle'}`} r={1.05} />
      <g className={`fan-blades ${FAN_CLASS[r.status] || 'fan-idle'}`}>
        {[0, 90, 180, 270].map(a => (
          <ellipse key={a} rx={0.52} ry={0.18} cy={-0.5} transform={`rotate(${a})`} />
        ))}
        {r.status === 'running' && (
          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="2.4s" repeatCount="indefinite" />
        )}
      </g>
      <circle className="fan-center" r={0.2} />
      {showLabel && <text className="mark-label" y={-1.5}>{r.robotId}</text>}
    </g>
  );
}

function AlertMark({ m }) {
  return (
    <g className="alert-mark" transform={`translate(${m.x} ${m.y})`}>
      <title>{m.open} open alert{m.open > 1 ? 's' : ''} — {m.types.join(', ')}</title>
      <path className="alert-tri" d="M0 -1.15 L1.1 0.85 L-1.1 0.85 Z" />
      <text className="alert-bang" y={0.55}>!</text>
      {m.open > 1 && (
        <>
          <circle className="mark-count" cx={1.2} cy={-1} r={0.55} />
          <text className="mark-count-t" x={1.2} y={-0.75}>{m.open}</text>
        </>
      )}
    </g>
  );
}

function TeamMark({ m }) {
  return (
    <g className="team-mark" transform={`translate(${m.x} ${m.y})`}>
      <title>Response in progress — {m.ack} acknowledged/investigating alert{m.ack > 1 ? 's' : ''}: {m.types.join(', ')}</title>
      <path className="shield-path" d="M0 -1.1 L0.95 -0.65 V0.1 A0.95 0.95 0 0 1 0 1.1 A0.95 0.95 0 0 1 -0.95 0.1 V-0.65 Z" />
      <path className="shield-cross" d="M0 -0.5 V0.45 M-0.42 -0.02 H0.42" />
      {m.ack > 1 && (
        <>
          <circle className="mark-count" cx={1.1} cy={-1} r={0.55} />
          <text className="mark-count-t" x={1.1} y={-0.75}>{m.ack}</text>
        </>
      )}
    </g>
  );
}

export default function SiteMapPanel({ zones, incidents }) {
  const [selectedId, setSelectedId] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [full, setFull] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [layers, setLayers] = useState({ workers: true, hazards: true, alerts: true, robots: true, labels: true });

  const list = zones || [];
  const zone = list.find(z => z.workspaceId === selectedId) || list[0];

  const robotById = useMemo(
    () => new Map((zone?.robots || []).map(r => [String(r.id), r])),
    [zone]
  );

  const zoneIncidents = useMemo(() => (incidents || []).filter(i => {
    const wid = i.workspace?._id || i.workspace;
    return zone && String(wid) === String(zone.workspaceId) && i.status !== 'resolved';
  }), [incidents, zone]);

  const marks = useMemo(() => {
    if (!zone) return [];
    const walk = (zone.areas || []).find(a => a.kind === 'walkway');
    const fallback = walk
      ? { x: walk.x + walk.w / 2, y: walk.y + walk.h / 2 }
      : { x: (zone.widthM || 32) / 2, y: (zone.heightM || 20) / 2 };
    const map = new Map();
    for (const inc of zoneIncidents) {
      const rid = inc.robot?._id || inc.robot;
      const r = rid ? robotById.get(String(rid)) : null;
      const pos = r && r.x != null ? { x: r.x, y: r.y } : fallback;
      const key = `${Math.round(pos.x * 2) / 2},${Math.round(pos.y * 2) / 2}`;
      const m = map.get(key) || { x: pos.x, y: pos.y, open: 0, ack: 0, types: [] };
      if (inc.status === 'acknowledged' || inc.status === 'investigating') m.ack += 1;
      else m.open += 1;
      if (!m.types.includes(inc.type)) m.types.push(inc.type);
      map.set(key, m);
    }
    return [...map.values()];
  }, [zoneIncidents, zone, robotById]);

  if (!zone) return null;

  const W = zone.widthM || 32;
  const H = zone.heightM || 20;
  const bw = W + 1, bh = H + 1;
  const cx = -0.5 + bw / 2, cy = -0.5 + bh / 2;
  const vw = bw / zoom, vh = bh / zoom;
  const vb = `${cx - vw / 2} ${cy - vh / 2} ${vw} ${vh}`;

  const areas = zone.areas || [];
  const walkway = areas.find(a => a.kind === 'walkway');
  const hazards = layers.hazards
    ? areas.filter(a => {
      if (a.kind === 'restricted') return true;
      if (a.kind !== 'robot-cell') return false;
      const r = a.robot ? robotById.get(String(a.robot)) : null;
      return r ? r.status === 'running' : false;
    })
    : [];

  const spurs = walkway
    ? areas.filter(a => a !== walkway).map(a => {
      const x = a.x + a.w / 2 - 0.8;
      if (a.y + a.h <= walkway.y) return { x, y: a.y + a.h, h: walkway.y - (a.y + a.h) };
      if (a.y >= walkway.y + walkway.h) return { x, y: walkway.y + walkway.h, h: a.y - (walkway.y + walkway.h) };
      return null;
    }).filter(s => s && s.h > 0.1)
    : [];

  return (
    <section className="panel sitemap-panel">
      <div className="sitemap-head">
        <span className="sitemap-title">
          <svg viewBox="0 0 24 24" className="pin-ico" aria-hidden="true">
            <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
          </svg>
          Live Factory Site Map — {zone.zoneCode}
        </span>
        <div className="sitemap-legend">
          <span className="lg"><i className="lg-dot" />Workers</span>
          <span className="lg"><i className="lg-hazard" />Hazard zone</span>
          <span className="lg"><i className="lg-alert" />Safety alert</span>
          <span className="lg"><i className="lg-fan" />Robot</span>
          <span className="lg"><i className="lg-shield" />Response team</span>
        </div>
        <select
          className="sitemap-zone-select"
          value={zone.workspaceId}
          onChange={e => { setSelectedId(e.target.value); setZoom(1); }}
        >
          {list.map(z => <option key={z.workspaceId} value={z.workspaceId}>{z.zoneCode} — {z.name}</option>)}
        </select>
      </div>

      <div className={full ? 'sitemap-body sitemap-full' : 'sitemap-body'}>
        <svg className="sitemap-svg" viewBox={vb} preserveAspectRatio="xMidYMid meet">
          <defs>
            <filter id="sfm-rock" x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch" />
              <feColorMatrix type="saturate" values="0" />
            </filter>
            <pattern id="sfm-hatch" width="0.9" height="0.9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="0.9" height="0.9" fill="rgba(239,68,68,0.14)" />
              <line x1="0" y1="0" x2="0" y2="0.9" stroke="#ef4444" strokeWidth="0.22" />
            </pattern>
          </defs>

          <rect x={-0.5} y={-0.5} width={bw} height={bh} fill="#07090d" />
          <rect x={-0.5} y={-0.5} width={bw} height={bh} filter="url(#sfm-rock)" opacity="0.16" />
          <rect className="zone-frame" x={0} y={0} width={W} height={H} rx={0.6} />

          {areas.filter(a => a.kind !== 'walkway').map(a => (
            <rect key={a.areaId} className="room" x={a.x} y={a.y} width={a.w} height={a.h} rx={0.5}>
              <title>{a.label || a.areaId} — {a.kind.replace(/-/g, ' ')}</title>
            </rect>
          ))}
          {walkway && <rect className="corridor" x={walkway.x} y={walkway.y} width={walkway.w} height={walkway.h} rx={1.1} />}
          {spurs.map((s, i) => (
            <rect key={i} className="spur" x={s.x} y={s.y} width={1.6} height={s.h} />
          ))}

          {hazards.map(a => (
            <rect
              key={a.areaId}
              className="hazard-blob"
              x={a.x + 0.5} y={a.y + 0.5} width={a.w - 1} height={a.h - 1} rx={1.4}
            >
              <title>{a.label || a.areaId} — {a.kind === 'restricted' ? 'restricted area' : 'active protective field'}</title>
            </rect>
          ))}

          {layers.workers && (zone.workers || []).map(w => w.x != null && (
            <g key={w.id}>
              <circle className={w.inHazard ? 'worker-dot worker-hazard' : 'worker-dot'} cx={w.x} cy={w.y} r={0.55}>
                <title>{w.name}{w.inHazard ? ' — IN PROTECTIVE FIELD' : ''}</title>
              </circle>
            </g>
          ))}

          {layers.robots && (zone.robots || []).map(r => r.x != null && (
            <FanMark key={r.id} r={r} showLabel={layers.labels} />
          ))}

          {layers.alerts && marks.map((m, i) => (
            <g key={i}>
              {m.open > 0 && <AlertMark m={m} />}
              {m.ack > 0 && <TeamMark m={{ ...m, x: m.open > 0 ? m.x + 2 : m.x, y: m.open > 0 ? m.y - 1.6 : m.y }} />}
            </g>
          ))}

          <g className="compass" transform={`translate(2.6 ${H - 3.1})`}>
            <circle className="compass-ring" r={1.35} />
            <path className="compass-needle" d="M0 -0.95 L0.42 0.62 L0 0.28 L-0.42 0.62 Z" />
            <text className="compass-n" y={-1.75}>N</text>
          </g>
          <g className="scalebar" transform={`translate(1 ${H - 0.8})`}>
            <path className="scale-line" d="M0 -0.35 V0 H10 V-0.35 M5 0 V-0.22" />
            <text className="scale-t" x={5} y={-0.55}>10 m</text>
          </g>
        </svg>

        <div className="sitemap-tools">
          <button className="tool-btn" title={full ? 'Exit fullscreen' : 'Fullscreen'} onClick={() => setFull(f => !f)}>
            <svg viewBox="0 0 24 24" className="tool-ico" aria-hidden="true">
              {full
                ? <path d="M9 9H4V7h5V4h2v5H9zm6 6h5v2h-5v3h-2v-5h2zM9 15v5H7v-3H4v-2h5zm6-6V4h2v3h3v2h-5z" />
                : <path d="M4 4h6v2H6v4H4V4zm16 0v6h-2V6h-4V4h6zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4z" />}
            </svg>
          </button>
          <button className="tool-btn" title="Layers" onClick={() => setLayersOpen(o => !o)}>
            <svg viewBox="0 0 24 24" className="tool-ico" aria-hidden="true">
              <path d="M12 3l9 5-9 5-9-5 9-5zm-9 9l9 5 9-5 2 1.1-11 6-11-6L3 12z" />
            </svg>
          </button>
          {layersOpen && (
            <div className="sitemap-layers">
              {LAYER_DEFS.map(l => (
                <label key={l.id}>
                  <input
                    type="checkbox"
                    checked={layers[l.id]}
                    onChange={() => setLayers(s => ({ ...s, [l.id]: !s[l.id] }))}
                  />
                  {l.label}
                </label>
              ))}
            </div>
          )}
          <button className="tool-btn" title="Zoom in" onClick={() => setZoom(z => Math.min(4, Math.round(z * 1.25 * 100) / 100))}>+</button>
          <button className="tool-btn" title="Zoom out" onClick={() => setZoom(z => Math.max(1, Math.round((z / 1.25) * 100) / 100))}>−</button>
          <button className="tool-btn" title="Reset view" onClick={() => setZoom(1)}>
            <svg viewBox="0 0 24 24" className="tool-ico" aria-hidden="true">
              <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0-6h1v3.1a7 7 0 0 1 5.9 5.9H22v1h-3.1A7 7 0 0 1 13 17.9V21h-1v-3.1A7 7 0 0 1 6.1 12H3v-1h3.1A7 7 0 0 1 12 5.1V2z" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
